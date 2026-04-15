import fs from "node:fs";
import path from "node:path";
import * as log from "./logger.mjs";
import { scanRoot, searchMemories } from "./scanner.mjs";

export const DEFAULT_SEARCH_LIMIT = 10;

export class SearchCommandError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "SearchCommandError";
    this.showUsage = options.showUsage || false;
  }
}

function resolveSearchRoot(rootPath, cwd) {
  const resolvedRoot = path.resolve(rootPath || cwd);
  try {
    const stats = fs.statSync(resolvedRoot);
    if (!stats.isDirectory()) {
      throw new Error("Root path must be a directory");
    }
    fs.accessSync(resolvedRoot, fs.constants.R_OK);
  } catch {
    throw new SearchCommandError(
      `Root directory not found or not readable: ${resolvedRoot}`,
    );
  }
  return resolvedRoot;
}

function printSearchResults(query, result, limit) {
  if (result.total === 0) {
    log.info(`No memories matched "${query}".`);
    return;
  }

  const shownCount = result.results.length;
  const resultLabel = result.total === 1 ? "memory" : "memories";
  log.success(`Found ${result.total} matching ${resultLabel} for "${query}".`);
  if (shownCount < result.total) {
    log.dim(`Showing ${shownCount} result(s). Use --limit ${limit} or higher to view more.`);
  }

  for (const hit of result.results) {
    const title = hit.title || "(untitled memory)";
    console.log("");
    console.log(`- ${title}`);
    log.dim(`  project: ${hit.displayName}`);
    log.dim(`  timestamp: ${hit.timestamp || "unknown"}`);
    log.dim(`  match: ${hit.matchField}`);
    log.dim(`  snippet: ${hit.snippet}`);
  }
}

export function runSearchCommand(options) {
  const {
    searchTerms,
    rootPath,
    limit,
    cwd = process.cwd(),
  } = options;

  const query = searchTerms.join(" ").trim();
  if (!query) {
    throw new SearchCommandError("search requires a query.", { showUsage: true });
  }

  const resolvedRoot = resolveSearchRoot(rootPath, cwd);

  try {
    const { fileIndex } = scanRoot(resolvedRoot);
    const effectiveLimit = limit || DEFAULT_SEARCH_LIMIT;
    const result = searchMemories(
      resolvedRoot,
      query,
      fileIndex,
      effectiveLimit,
    );

    printSearchResults(query, result, effectiveLimit);
  } catch (err) {
    if (err instanceof SearchCommandError) {
      throw err;
    }
    throw new SearchCommandError(`Search failed: ${err.message}`);
  }
}
