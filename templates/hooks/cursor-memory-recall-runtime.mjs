import fs from "node:fs";
import path from "node:path";

const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DIR_RE = /^\d{4}-\d{2}$/;

function normalizeText(text) {
  return typeof text === "string" ? text.normalize("NFKC").toLowerCase() : "";
}

function uniquePush(target, value, seen) {
  if (!value || seen.has(value)) return;
  seen.add(value);
  target.push(value);
}

export function tokenizePrompt(text) {
  const normalized = normalizeText(text);
  const tokens = [];
  const seen = new Set();

  for (const match of normalized.matchAll(/[\p{L}\p{N}_-]{2,}/gu)) {
    uniquePush(tokens, match[0], seen);
  }

  for (const match of normalized.matchAll(/[\p{Script=Han}]{2,}/gu)) {
    const chunk = match[0];
    uniquePush(tokens, chunk, seen);
    for (let i = 0; i < chunk.length - 1; i += 1) {
      uniquePush(tokens, chunk.slice(i, i + 2), seen);
    }
  }

  return tokens.slice(0, 48);
}

function dirEntries(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isReadableDirectory(dirPath) {
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return false;
    fs.accessSync(dirPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function findMemoriesDirs(rootPath) {
  if (!isReadableDirectory(rootPath)) return [];
  if (path.basename(rootPath) === "memories") {
    return [rootPath];
  }
  const directMemoriesDir = path.join(rootPath, "memories");
  return isReadableDirectory(directMemoriesDir) ? [directMemoriesDir] : [];
}

function listJsonFiles(dirPath) {
  return dirEntries(dirPath)
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function trimSnippet(text, maxLength = 120) {
  if (typeof text !== "string") return "";
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function buildRecencyBoost(timestamp) {
  if (!timestamp) return 0;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 0;
  const ageDays = (Date.now() - parsed.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= 30) return 2;
  if (ageDays <= 180) return 1;
  return 0;
}

function scoreTextMatches(tokens, title, content, sourceChunk) {
  const titleText = normalizeText(title);
  const contentText = normalizeText(content);
  const sourceText = normalizeText(sourceChunk);

  let score = 0;
  let matchedTokens = 0;
  for (const token of tokens) {
    let matched = false;
    if (titleText.includes(token)) {
      score += 8;
      matched = true;
    }
    if (contentText.includes(token)) {
      score += 3;
      matched = true;
    }
    if (sourceText.includes(token)) {
      score += 1;
      matched = true;
    }
    if (matched) matchedTokens += 1;
  }

  if (matchedTokens >= 2) score += 2;
  if (matchedTokens >= 4) score += 2;

  return { score, matchedTokens };
}

function collectSessionHits(memoriesDir, workspaceRoot, promptTokens) {
  const hits = [];
  const projectRoot = path.dirname(memoriesDir);
  const candidateDirs = [];

  for (const entry of dirEntries(memoriesDir)) {
    if (!entry.isDirectory()) continue;
    if (!DATE_DIR_RE.test(entry.name)) continue;
    candidateDirs.push({
      dirPath: path.join(memoriesDir, entry.name),
      fallbackTimestamp: `${entry.name}T00:00:00Z`,
    });
  }

  const archiveDir = path.join(memoriesDir, "archive");
  for (const entry of dirEntries(archiveDir)) {
    if (!entry.isDirectory()) continue;
    if (!MONTH_DIR_RE.test(entry.name)) continue;
    candidateDirs.push({
      dirPath: path.join(archiveDir, entry.name),
      fallbackTimestamp: `${entry.name}-01T00:00:00Z`,
    });
  }

  for (const candidateDir of candidateDirs) {
    const { dirPath, fallbackTimestamp } = candidateDir;
    for (const fileName of listJsonFiles(dirPath)) {
      const filePath = path.join(dirPath, fileName);
      const payload = safeReadJson(filePath);
      if (!payload || !Array.isArray(payload.memories)) continue;

      for (let index = 0; index < payload.memories.length; index += 1) {
        const memory = payload.memories[index];
        const title = typeof memory.title === "string" ? memory.title : "";
        const content = typeof memory.content === "string" ? memory.content : "";
        const sourceChunk =
          typeof memory.source_chunk === "string" ? memory.source_chunk : "";
        const { score: textScore, matchedTokens } = scoreTextMatches(
          promptTokens,
          title,
          content,
          sourceChunk,
        );
        if (textScore === 0) continue;

        const confidence =
          Number.isFinite(memory.confidence_score) ? memory.confidence_score : 0;
        const timestamp =
          payload.timestamp || payload.last_updated || fallbackTimestamp;
        const totalScore =
          textScore +
          buildRecencyBoost(timestamp) +
          Math.min(4, Math.max(0, confidence / 25));

        hits.push({
          title: title || "(untitled memory)",
          type: typeof memory.type === "string" ? memory.type : "memory",
          snippet: trimSnippet(content || sourceChunk),
          timestamp,
          score: totalScore,
          matchedTokens,
          confidenceScore: confidence,
          workspaceRoot,
          projectRoot,
          projectName: path.basename(projectRoot),
          filePath,
          memoryIndex: index,
        });
      }
    }
  }

  return hits;
}

export function findRecallCandidates(workspaceRoots, prompt, options = {}) {
  const promptTokens = tokenizePrompt(prompt);
  if (!promptTokens.length) {
    return [];
  }

  const minScore =
    Number.isFinite(options.minScore) && options.minScore > 0 ? options.minScore : 10;
  const maxResults =
    Number.isInteger(options.maxResults) && options.maxResults > 0
      ? options.maxResults
      : 3;

  const hits = [];
  for (const workspaceRoot of workspaceRoots) {
    for (const memoriesDir of findMemoriesDirs(workspaceRoot)) {
      hits.push(...collectSessionHits(memoriesDir, workspaceRoot, promptTokens));
    }
  }

  hits.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.matchedTokens !== left.matchedTokens) {
      return right.matchedTokens - left.matchedTokens;
    }
    return String(right.timestamp).localeCompare(String(left.timestamp));
  });

  const filtered = hits.filter((hit) => hit.score >= minScore);
  return filtered.slice(0, maxResults);
}

export function buildRecallInjection(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }

  const lines = [
    "[相关历史记忆，仅在确实有帮助时参考]",
  ];

  for (const candidate of candidates) {
    const parts = [
      `- [${candidate.type}]`,
      candidate.title,
    ];
    if (candidate.timestamp) {
      parts.push(`(${String(candidate.timestamp).slice(0, 10)})`);
    }
    lines.push(parts.join(" "));
    if (candidate.snippet) {
      lines.push(`  ${candidate.snippet}`);
    }
  }

  lines.push("如果这些内容不相关，请忽略即可。");
  return lines.join("\n");
}
