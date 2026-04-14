import fs from "node:fs";
import path from "node:path";

// --- opaque ID counter, reset on each scanRoot call ---
let nextId = 1;

function allocId() {
  return nextId++;
}

// --- directory traversal helpers ---

const SKIP_NAMES = new Set([
  ".quarantine",
  ".archive.lock",
  "archive.log",
  "node_modules",
  ".git",
]);

/**
 * Recursively find all directories named "memories" under rootPath.
 * Returns an array of absolute paths.
 */
function findMemoriesDirs(dirPath) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_NAMES.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.name === "memories") {
      results.push(fullPath);
    } else {
      results.push(...findMemoriesDirs(fullPath));
    }
  }
  return results;
}

// --- date / month pattern helpers ---

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function stripJsonExt(fileName) {
  return fileName.replace(/\.json$/, "");
}

function buildShareKey(projectId, logicalKind, logicalId) {
  return `${encodeURIComponent(projectId)}:${logicalKind}:${encodeURIComponent(logicalId)}`;
}

function buildActiveSessionLogicalId(dateDir, fileName) {
  const base = stripJsonExt(fileName);
  return base.startsWith(`${dateDir}-`) ? base : `${dateDir}-${base}`;
}

function buildArchivedSessionLogicalId(fileName) {
  return stripJsonExt(fileName);
}

function buildAggregateLogicalId(fileName) {
  return stripJsonExt(fileName);
}

/**
 * Extract timestamp string from a session filename.
 * Filename pattern: HH-MM-SS-session-name.json
 * Combined with the parent date dir to produce an ISO-like timestamp.
 */
function timestampFromSessionFile(dateDir, fileName) {
  const base = stripJsonExt(fileName);
  const match = base.match(/^(\d{2})-(\d{2})-(\d{2})(?:-|$)/);
  if (!match) return `${dateDir}T00:00:00`;
  const [, hh, mm, ss] = match;
  return `${dateDir}T${hh}:${mm}:${ss}`;
}

// --- session date directories ---

function scanDateDirs(memoriesDir, fileIndex, projectId) {
  const groups = [];
  let entries;
  try {
    entries = fs.readdirSync(memoriesDir, { withFileTypes: true });
  } catch {
    return groups;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!DATE_RE.test(entry.name)) continue;
    const dirPath = path.join(memoriesDir, entry.name);
    const files = listJsonFiles(dirPath);
    if (files.length === 0) continue;

    const dateStr = entry.name;
    const fileObjs = [];
    for (const fileName of files) {
      const id = allocId();
      const timestamp = timestampFromSessionFile(dateStr, fileName);
      const shareKey = buildShareKey(
        projectId,
        "session",
        buildActiveSessionLogicalId(dateStr, fileName),
      );
      fileObjs.push({ id, name: fileName, timestamp, kind: "session", shareKey });
      fileIndex.set(id, {
        absPath: path.join(dirPath, fileName),
        projectId,
        kind: "session",
        shareKey,
      });
    }
    // sort files descending by name
    fileObjs.sort((a, b) => (a.name > b.name ? -1 : a.name < b.name ? 1 : 0));
    groups.push({ date: dateStr, files: fileObjs });
  }
  // sort date groups descending
  groups.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  return groups;
}

// --- archive month directories ---

function scanArchiveDirs(archiveDir, fileIndex, projectId) {
  const groups = [];
  if (!dirExists(archiveDir)) return groups;
  let entries;
  try {
    entries = fs.readdirSync(archiveDir, { withFileTypes: true });
  } catch {
    return groups;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // skip the aggregate sub-directory; those are handled separately
    if (entry.name === "aggregate") continue;
    if (!MONTH_RE.test(entry.name)) continue;
    const dirPath = path.join(archiveDir, entry.name);
    const files = listJsonFiles(dirPath);
    if (files.length === 0) continue;

    const monthStr = entry.name;
    const fileObjs = [];
    for (const fileName of files) {
      const id = allocId();
      // archived files are named like YYYY-MM-DD-name.json
      const dateFromName = fileName.slice(0, 10); // best-effort date
      const shareKey = buildShareKey(
        projectId,
        "session",
        buildArchivedSessionLogicalId(fileName),
      );
      fileObjs.push({
        id,
        name: fileName,
        timestamp: dateFromName,
        kind: "archived-session",
        shareKey,
      });
      fileIndex.set(id, {
        absPath: path.join(dirPath, fileName),
        projectId,
        kind: "archived-session",
        shareKey,
      });
    }
    fileObjs.sort((a, b) => (a.name > b.name ? -1 : a.name < b.name ? 1 : 0));
    groups.push({ month: monthStr, files: fileObjs });
  }
  // sort month groups descending
  groups.sort((a, b) =>
    a.month > b.month ? -1 : a.month < b.month ? 1 : 0,
  );
  return groups;
}

// --- aggregate files ---

function scanAggregateFiles(aggregateDir, fileIndex, projectId) {
  const results = [];
  if (!dirExists(aggregateDir)) return results;
  const files = listJsonFiles(aggregateDir);
  for (const fileName of files) {
    const id = allocId();
    const base = stripJsonExt(fileName);
    const month = MONTH_RE.test(base) ? base : null;
    const shareKey = buildShareKey(
      projectId,
      "aggregate",
      buildAggregateLogicalId(fileName),
    );
    results.push({ id, name: fileName, month, kind: "aggregate", shareKey });
    fileIndex.set(id, {
      absPath: path.join(aggregateDir, fileName),
      projectId,
      kind: "aggregate",
      shareKey,
    });
  }
  // sort descending by name (month-based names sort naturally)
  results.sort((a, b) => (a.name > b.name ? -1 : a.name < b.name ? 1 : 0));
  return results;
}

// --- small utilities ---

function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function listJsonFiles(dirPath) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    console.warn(`scanner: cannot read directory ${dirPath}: ${err.message}`);
    return [];
  }
  const names = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".json")) continue;
    names.push(entry.name);
  }
  return names;
}

function deriveDisplayName(projectId, rootPath) {
  if (projectId === ".") {
    return path.basename(rootPath);
  }
  // last meaningful segment
  const segments = projectId.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : projectId;
}

// ============================================================
// Public API
// ============================================================

/**
 * Recursively scan rootPath for memories/ directories and build
 * a structured catalogue of all memory files.
 */
export function scanRoot(rootPath) {
  // reset ID counter for each scan
  nextId = 1;

  const fileIndex = new Map();
  const projects = [];
  const memoriesDirs = findMemoriesDirs(rootPath);

  for (const memoriesDir of memoriesDirs) {
    const parentDir = path.dirname(memoriesDir);
    const projectId =
      parentDir === rootPath ? "." : path.relative(rootPath, parentDir);
    const displayName = deriveDisplayName(projectId, rootPath);

    const memories = scanDateDirs(memoriesDir, fileIndex, projectId);
    const archiveDir = path.join(memoriesDir, "archive");
    const archive = scanArchiveDirs(archiveDir, fileIndex, projectId);
    const aggregateDir = path.join(archiveDir, "aggregate");
    const aggregates = scanAggregateFiles(aggregateDir, fileIndex, projectId);

    projects.push({
      projectId,
      displayName,
      memories,
      archive,
      aggregates,
    });
  }

  // sort projects by projectId for stable output
  projects.sort((a, b) =>
    a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0,
  );

  return { projects, fileIndex };
}

/**
 * Read and parse a single memory file by its opaque ID.
 */
export function readMemoryFile(rootPath, id, fileIndex) {
  const entry = fileIndex.get(id);
  if (!entry) return null;

  const { absPath, kind: indexKind, shareKey } = entry;

  // path-traversal guard
  const rel = path.relative(rootPath, absPath);
  if (rel.startsWith("..")) return null;

  let raw;
  try {
    raw = fs.readFileSync(absPath, "utf-8");
  } catch (err) {
    return { kind: "error", error: `Cannot read file: ${err.message}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { kind: "error", error: `Invalid JSON: ${err.message}` };
  }

  // detect kind from content
  let kind;
  if (
    parsed.month !== undefined &&
    parsed.deduped_memories !== undefined
  ) {
    kind = "aggregate";
  } else {
    kind = indexKind;
  }

  return { kind, ...parsed, shareKey };
}

/**
 * Full-text search across memory files.
 */
export function searchMemories(rootPath, keyword, fileIndex, limit = 50) {
  if (!keyword || typeof keyword !== "string") {
    return { results: [], total: 0 };
  }

  const lowerKeyword = keyword.toLowerCase();
  const hits = [];

  for (const [id, entry] of fileIndex) {
    if (entry.kind === "aggregate") continue;

    let raw;
    try {
      raw = fs.readFileSync(entry.absPath, "utf-8");
    } catch (err) {
      console.warn(
        `scanner: cannot read ${entry.absPath}: ${err.message}`,
      );
      continue;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.warn(
        `scanner: invalid JSON in ${entry.absPath}: ${err.message}`,
      );
      continue;
    }

    const memories = Array.isArray(data.memories) ? data.memories : [];
    const fileTimestamp = data.timestamp || data.last_updated || "";
    const fileName = path.basename(entry.absPath);
    const displayName = deriveDisplayName(entry.projectId, rootPath);

    for (let i = 0; i < memories.length; i++) {
      const mem = memories[i];
      const title = typeof mem.title === "string" ? mem.title : "";
      const content = typeof mem.content === "string" ? mem.content : "";

      const titleIdx = title.toLowerCase().indexOf(lowerKeyword);
      const contentIdx = content.toLowerCase().indexOf(lowerKeyword);

      if (titleIdx === -1 && contentIdx === -1) continue;

      // prefer title match, fall back to content
      let matchField;
      let snippet;
      if (titleIdx !== -1) {
        matchField = "title";
        snippet = buildSnippet(title, titleIdx, keyword.length);
      } else {
        matchField = "content";
        snippet = buildSnippet(content, contentIdx, keyword.length);
      }

      hits.push({
        fileId: id,
        projectId: entry.projectId,
        displayName,
        fileName,
        memoryIndex: i,
        title,
        snippet,
        matchField,
        timestamp: fileTimestamp,
      });
    }
  }

  // sort by timestamp descending
  hits.sort((a, b) =>
    a.timestamp > b.timestamp ? -1 : a.timestamp < b.timestamp ? 1 : 0,
  );

  return {
    results: hits.slice(0, limit),
    total: hits.length,
  };
}

// --- snippet builder ---

function buildSnippet(text, matchStart, matchLen) {
  const contextChars = 50;
  const start = Math.max(0, matchStart - contextChars);
  const end = Math.min(text.length, matchStart + matchLen + contextChars);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}
