import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_CONFIG = {
  retention_days: 60,
  expiry_basis: 'last_updated',
  archive_dir: './memories/archive',
  aggregate: {
    granularity: 'month',
    schema: 'sessions+deduped_index',
    dedupe: {
      method: 'jaccard',
      threshold: 0.85,
      fields: ['content']
    }
  },
  processing_limit: 200,
  log_file: './memories/archive.log',
  quarantine_dir: './memories/.quarantine',
  lock_file: './memories/.archive.lock',
  remove_empty_dirs: true
};

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    projectRoot: process.cwd(),
    cursorDir: null,
    dryRun: false,
    thresholdOverride: null,
    limitOverride: null
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--project-root') {
      result.projectRoot = args[i + 1] || result.projectRoot;
      i += 1;
    } else if (arg === '--cursor-dir') {
      result.cursorDir = args[i + 1] || result.cursorDir;
      i += 1;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--threshold') {
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        result.thresholdOverride = Number(value);
        i += 1;
      }
    } else if (arg === '--limit') {
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        result.limitOverride = Number(value);
        i += 1;
      }
    }
  }
  return result;
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function readConfig(projectRoot, cursorDir) {
  const candidates = [];
  if (cursorDir) {
    candidates.push(path.join(cursorDir, 'memory-archive.json'));
  }
  candidates.push(path.join(projectRoot, '.cursor', 'memory-archive.json'));
  candidates.push(path.join(os.homedir(), '.cursor', 'memory-archive.json'));

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      try {
        return { config: readJsonFile(filePath), configPath: filePath };
      } catch {
        return { config: DEFAULT_CONFIG, configPath: null };
      }
    }
  }
  return { config: DEFAULT_CONFIG, configPath: null };
}

function resolveMaybeRelative(baseDir, targetPath) {
  if (!targetPath) return baseDir;
  if (path.isAbsolute(targetPath)) return targetPath;
  return path.resolve(baseDir, targetPath);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function appendLog(logFile, message) {
  if (!logFile) return;
  try {
    ensureDir(path.dirname(logFile));
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`, 'utf-8');
  } catch {
    // ignore
  }
}

function acquireLock(lockFile) {
  if (!lockFile) return { locked: true, release: () => {} };
  try {
    ensureDir(path.dirname(lockFile));
    const fd = fs.openSync(lockFile, 'wx');
    const payload = JSON.stringify({
      pid: process.pid,
      started_at: new Date().toISOString()
    });
    fs.writeFileSync(fd, payload, 'utf-8');
    const release = () => {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(lockFile);
      } catch {
        // ignore
      }
    };
    return { locked: true, release };
  } catch {
    return { locked: false, release: () => {} };
  }
}

function listSessionFiles(memoriesDir, excludeDirNames) {
  if (!fs.existsSync(memoriesDir)) return [];
  const entries = fs.readdirSync(memoriesDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (excludeDirNames.has(entry.name)) continue;
    const dateDir = entry.name;
    const dirPath = path.join(memoriesDir, dateDir);
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      if (!file.name.endsWith('.json')) continue;
      results.push({
        filePath: path.join(dirPath, file.name),
        dateDir
      });
    }
  }
  return results;
}

function parseDate(value) {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function getBasisDate(data, basis, filePath) {
  let date = null;
  if (basis === 'last_updated') {
    date = parseDate(data.last_updated) || parseDate(data.timestamp);
  } else if (basis === 'timestamp') {
    date = parseDate(data.timestamp) || parseDate(data.last_updated);
  }
  if (!date) {
    const stat = fs.statSync(filePath);
    date = new Date(stat.mtimeMs);
  }
  return date;
}

function isExpired(date, retentionDays, now) {
  if (!date) return false;
  const diff = now.getTime() - date.getTime();
  return diff > retentionDays * 24 * 60 * 60 * 1000;
}

function moveFile(src, dest) {
  ensureDir(path.dirname(dest));
  try {
    fs.renameSync(src, dest);
    return dest;
  } catch {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
    return dest;
  }
}

function uniqueDestPath(destPath) {
  if (!fs.existsSync(destPath)) return destPath;
  const dir = path.dirname(destPath);
  const ext = path.extname(destPath);
  const base = path.basename(destPath, ext);
  let counter = 1;
  while (true) {
    const nextPath = path.join(dir, `${base}-${counter}${ext}`);
    if (!fs.existsSync(nextPath)) return nextPath;
    counter += 1;
  }
}

function getMonthKey(date) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseDateFromDir(dateDir) {
  if (typeof dateDir !== 'string') return null;
  const d = new Date(`${dateDir}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function tokenize(text) {
  if (typeof text !== 'string') return new Set();
  const normalized = text.normalize('NFKC').toLowerCase();
  const tokens = normalized.match(/\p{L}+/gu) || [];
  return new Set(tokens.filter(Boolean));
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function dedupeMemories(sessions, dedupeConfig) {
  const threshold = dedupeConfig?.threshold ?? 0.85;
  const byKey = new Map();

  for (const session of sessions) {
    const sessionId = session.session_id || 'unknown-session';
    const memories = Array.isArray(session.memories) ? session.memories : [];
    for (const mem of memories) {
      const type = mem.type || 'unknown';
      const title = mem.title || 'untitled';
      const key = `${type}||${title}`;
      const content = mem.content || '';
      const tokens = tokenize(content);
      const bucket = byKey.get(key) || [];

      let bestIndex = -1;
      let bestScore = 0;
      for (let i = 0; i < bucket.length; i += 1) {
        const score = jaccard(tokens, bucket[i].tokens);
        if (score > threshold && score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      if (bestIndex >= 0) {
        const existing = bucket[bestIndex].memory;
        if (!existing.source_session_ids.includes(sessionId)) {
          existing.source_session_ids.push(sessionId);
        }
        if ((mem.confidence_score || 0) > (existing.confidence_score || 0)) {
          existing.content = content;
          existing.confidence_score = mem.confidence_score || existing.confidence_score;
          existing.category = mem.category || existing.category;
        }
      } else {
        bucket.push({
          tokens,
          memory: {
            type,
            category: mem.category || null,
            title,
            content,
            confidence_score: mem.confidence_score || 0,
            source_session_ids: [sessionId]
          }
        });
      }

      byKey.set(key, bucket);
    }
  }

  const result = [];
  for (const bucket of byKey.values()) {
    for (const entry of bucket) {
      result.push(entry.memory);
    }
  }
  return result;
}

function loadAggregate(aggregatePath, monthKey, retentionDays) {
  if (!fs.existsSync(aggregatePath)) {
    return {
      month: monthKey,
      generated_at: new Date().toISOString(),
      retention_days: retentionDays,
      sessions: [],
      deduped_memories: [],
      stats: {
        session_count: 0,
        memory_count: 0,
        deduped_count: 0
      }
    };
  }
  try {
    return readJsonFile(aggregatePath);
  } catch {
    return {
      month: monthKey,
      generated_at: new Date().toISOString(),
      retention_days: retentionDays,
      sessions: [],
      deduped_memories: [],
      stats: {
        session_count: 0,
        memory_count: 0,
        deduped_count: 0
      }
    };
  }
}

function updateAggregate(aggregate, newSessions, dedupeConfig, retentionDays) {
  const sessions = Array.isArray(aggregate.sessions) ? aggregate.sessions : [];
  const sessionMap = new Map();
  for (const session of sessions) {
    if (session && session.session_id) {
      sessionMap.set(session.session_id, session);
    }
  }
  for (const session of newSessions) {
    if (!session || !session.session_id) continue;
    if (!sessionMap.has(session.session_id)) {
      sessionMap.set(session.session_id, session);
    }
  }

  const mergedSessions = Array.from(sessionMap.values());
  const deduped = dedupeMemories(mergedSessions, dedupeConfig);
  let memoryCount = 0;
  for (const session of mergedSessions) {
    if (Array.isArray(session.memories)) memoryCount += session.memories.length;
  }

  aggregate.generated_at = new Date().toISOString();
  aggregate.retention_days = retentionDays;
  aggregate.sessions = mergedSessions;
  aggregate.deduped_memories = deduped;
  aggregate.stats = {
    session_count: mergedSessions.length,
    memory_count: memoryCount,
    deduped_count: deduped.length
  };

  return aggregate;
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function cleanupEmptyDirs(dirPaths) {
  for (const dirPath of dirPaths) {
    try {
      const entries = fs.readdirSync(dirPath);
      if (entries.length === 0) fs.rmdirSync(dirPath);
    } catch {
      // ignore
    }
  }
}

function getExcludeDirNames(memoriesDir, archiveDir, quarantineDir) {
  const exclude = new Set();
  const archiveRel = path.relative(memoriesDir, archiveDir);
  const quarantineRel = path.relative(memoriesDir, quarantineDir);
  if (!archiveRel.startsWith('..')) {
    const name = archiveRel.split(path.sep)[0];
    if (name) exclude.add(name);
  }
  if (!quarantineRel.startsWith('..')) {
    const name = quarantineRel.split(path.sep)[0];
    if (name) exclude.add(name);
  }
  exclude.add('archive');
  exclude.add('.quarantine');
  return exclude;
}

function main() {
  const { projectRoot, cursorDir, dryRun, thresholdOverride, limitOverride } =
    parseArgs(process.argv);
  const { config } = readConfig(projectRoot, cursorDir);

  const retentionDays = Number(
    Number.isFinite(thresholdOverride)
      ? thresholdOverride
      : config.retention_days || DEFAULT_CONFIG.retention_days
  );
  const expiryBasis = config.expiry_basis || DEFAULT_CONFIG.expiry_basis;
  const processingLimit = Number(
    Number.isFinite(limitOverride)
      ? limitOverride
      : config.processing_limit || DEFAULT_CONFIG.processing_limit
  );
  const removeEmptyDirs =
    typeof config.remove_empty_dirs === 'boolean'
      ? config.remove_empty_dirs
      : DEFAULT_CONFIG.remove_empty_dirs;

  const memoriesDir = path.resolve(projectRoot, 'memories');
  if (!fs.existsSync(memoriesDir)) return;

  const archiveDir = resolveMaybeRelative(projectRoot, config.archive_dir);
  const aggregateDir = path.join(archiveDir, 'aggregate');
  const logFile = resolveMaybeRelative(projectRoot, config.log_file || DEFAULT_CONFIG.log_file);
  const quarantineDir = resolveMaybeRelative(
    projectRoot,
    config.quarantine_dir || DEFAULT_CONFIG.quarantine_dir
  );
  const lockFile = resolveMaybeRelative(projectRoot, config.lock_file || DEFAULT_CONFIG.lock_file);

  const lock = acquireLock(lockFile);
  if (!lock.locked) {
    appendLog(logFile, 'archive skipped: lock held');
    return;
  }

  try {
    const now = new Date();
    const candidates = [];
    const touchedDirs = new Set();
    const excludeDirs = getExcludeDirNames(memoriesDir, archiveDir, quarantineDir);

    for (const entry of listSessionFiles(memoriesDir, excludeDirs)) {
      let data;
      try {
        data = readJsonFile(entry.filePath);
      } catch {
        appendLog(logFile, `quarantine parse error: ${entry.filePath}`);
        if (!dryRun) {
          const destPath = uniqueDestPath(
            path.join(quarantineDir, path.basename(entry.filePath))
          );
          moveFile(entry.filePath, destPath);
          touchedDirs.add(path.join(memoriesDir, entry.dateDir));
        }
        continue;
      }
      const basisDate = getBasisDate(data, expiryBasis, entry.filePath);
      if (isExpired(basisDate, retentionDays, now)) {
        candidates.push({
          filePath: entry.filePath,
          dateDir: entry.dateDir,
          data,
          basisDate
        });
      }
    }

    candidates.sort((a, b) => a.basisDate.getTime() - b.basisDate.getTime());
    const limit = processingLimit > 0 ? processingLimit : candidates.length;
    const toArchive = candidates.slice(0, limit);
    if (toArchive.length === 0) {
      appendLog(logFile, 'archive skipped: no expired sessions');
      return;
    }

    const sessionsByMonth = new Map();

    for (const item of toArchive) {
      if (!dryRun) {
        const destDir = path.join(archiveDir, item.dateDir);
        const destPath = uniqueDestPath(path.join(destDir, path.basename(item.filePath)));
        moveFile(item.filePath, destPath);
        touchedDirs.add(path.join(memoriesDir, item.dateDir));
      }

      const session = item.data;
      const sessionDate =
        parseDate(session?.timestamp) ||
        parseDate(session?.last_updated) ||
        parseDateFromDir(item.dateDir) ||
        item.basisDate ||
        now;
      const monthKey = getMonthKey(sessionDate);
      if (!sessionsByMonth.has(monthKey)) {
        sessionsByMonth.set(monthKey, []);
      }
      sessionsByMonth.get(monthKey).push(session);
    }

    for (const [monthKey, sessions] of sessionsByMonth.entries()) {
      const aggregatePath = path.join(aggregateDir, `${monthKey}.json`);
      const aggregate = loadAggregate(aggregatePath, monthKey, retentionDays);
      const updated = updateAggregate(
        aggregate,
        sessions,
        config.aggregate?.dedupe,
        retentionDays
      );
      if (!dryRun) {
        writeJsonAtomic(aggregatePath, updated);
      }
    }

    if (!dryRun && removeEmptyDirs) {
      cleanupEmptyDirs(touchedDirs);
    }

    appendLog(
      logFile,
      `archived ${toArchive.length} session(s) across ${sessionsByMonth.size} month(s)${
        dryRun ? ' (dry-run)' : ''
      }`
    );
    if (!dryRun) {
      // keep stdout minimal for CLI use
      console.log(`Archived ${toArchive.length} session(s).`);
    } else {
      console.log(`Dry-run: ${toArchive.length} session(s) would be archived.`);
    }
  } finally {
    lock.release();
  }
}

try {
  main();
} catch {
  // Ignore all errors to avoid blocking session end.
}
