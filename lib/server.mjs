import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as log from "./logger.mjs";
import { scanRoot, readMemoryFile, searchMemories } from "./scanner.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(__dirname, "..", "templates");
const SERVE_PERMALINK_MODULE = path.resolve(__dirname, "serve-permalink.mjs");

const MAX_PORT_ATTEMPTS = 10;
const BIND_ADDRESS = "127.0.0.1";

// --- cached state ---
let cachedTree = null;
let cachedFileIndex = null;

function clearCache() {
  cachedTree = null;
  cachedFileIndex = null;
}

function ensureScanned(rootPath) {
  if (cachedTree && cachedFileIndex) {
    return { projects: cachedTree, fileIndex: cachedFileIndex };
  }
  const result = scanRoot(rootPath);
  cachedTree = result.projects;
  cachedFileIndex = result.fileIndex;
  return result;
}

// --- response helpers ---

function jsonResponse(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function htmlResponse(res, statusCode, html, options = {}) {
  const { headOnly = false } = options;
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
  });
  res.end(headOnly ? undefined : html);
}

// --- route handlers ---

function handleIndex(res, options = {}) {
  const htmlPath = path.join(TEMPLATES_DIR, "serve", "index.html");
  let html;
  try {
    html = fs.readFileSync(htmlPath, "utf-8");
  } catch (err) {
    jsonResponse(res, 500, { error: `Cannot read index.html: ${err.message}` });
    return;
  }
  htmlResponse(res, 200, html, options);
}

function handleServePermalinkModule(res) {
  let source;
  try {
    source = fs.readFileSync(SERVE_PERMALINK_MODULE, "utf-8");
  } catch (err) {
    jsonResponse(res, 500, {
      error: `Cannot read serve-permalink module: ${err.message}`,
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Content-Length": Buffer.byteLength(source),
  });
  res.end(source);
}

function handleTree(res, rootPath) {
  try {
    const { projects } = ensureScanned(rootPath);
    jsonResponse(res, 200, { projects });
  } catch (err) {
    jsonResponse(res, 500, { error: `Scan failed: ${err.message}` });
  }
}

function handleMemory(res, rootPath, idStr) {
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    jsonResponse(res, 400, { error: "Invalid file ID" });
    return;
  }

  ensureScanned(rootPath);
  const doc = readMemoryFile(rootPath, id, cachedFileIndex);
  if (!doc) {
    jsonResponse(res, 404, { error: "File not found" });
    return;
  }
  jsonResponse(res, 200, doc);
}

function handleSearch(res, rootPath, query) {
  const q = query.get("q");
  if (!q) {
    jsonResponse(res, 400, { error: "Missing search query parameter: q" });
    return;
  }

  const limitStr = query.get("limit");
  const limit = limitStr ? Number(limitStr) : 50;

  ensureScanned(rootPath);
  try {
    const result = searchMemories(rootPath, q, cachedFileIndex, limit);
    jsonResponse(res, 200, result);
  } catch (err) {
    jsonResponse(res, 500, { error: `Search failed: ${err.message}` });
  }
}

function handleRefresh(res) {
  clearCache();
  jsonResponse(res, 200, { ok: true });
}

// --- routing ---

function createRequestHandler(rootPath) {
  return (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;

    // GET/HEAD / — serve SPA
    if ((method === "GET" || method === "HEAD") && pathname === "/") {
      handleIndex(res, { headOnly: method === "HEAD" });
      return;
    }

    // GET /assets/serve-permalink.mjs
    if ((method === "GET" || method === "HEAD") && pathname === "/assets/serve-permalink.mjs") {
      handleServePermalinkModule(res);
      return;
    }

    // GET /api/tree
    if (method === "GET" && pathname === "/api/tree") {
      handleTree(res, rootPath);
      return;
    }

    // GET /api/memory/:id
    const memoryMatch = pathname.match(/^\/api\/memory\/(\d+)$/);
    if (method === "GET" && memoryMatch) {
      handleMemory(res, rootPath, memoryMatch[1]);
      return;
    }

    // GET /api/search?q=...
    if (method === "GET" && pathname === "/api/search") {
      handleSearch(res, rootPath, url.searchParams);
      return;
    }

    // POST /api/refresh
    if (method === "POST" && pathname === "/api/refresh") {
      handleRefresh(res);
      return;
    }

    // 404 for everything else
    jsonResponse(res, 404, { error: "Not found" });
  };
}

// --- server startup ---

function tryListen(server, port, attempt) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      if (err.code === "EADDRINUSE" && attempt < MAX_PORT_ATTEMPTS) {
        log.warn(`Port ${port} is in use, trying ${port + 1}...`);
        resolve(tryListen(server, port + 1, attempt + 1));
      } else {
        reject(err);
      }
    };

    server.once("error", onError);
    server.listen(port, BIND_ADDRESS, () => {
      server.removeListener("error", onError);
      resolve(port);
    });
  });
}

export async function startServer(rootPath, port) {
  const resolvedRoot = path.resolve(rootPath);
  const handler = createRequestHandler(resolvedRoot);
  const server = http.createServer(handler);

  const actualPort = await tryListen(server, port, 1);
  const url = `http://${BIND_ADDRESS}:${actualPort}`;

  log.success(`Server running at ${url}`);
  log.info(`Scanning memories in: ${resolvedRoot}`);
  log.info("Press Ctrl+C to stop");

  // try to open browser on macOS
  try {
    const { execSync } = await import("node:child_process");
    execSync(`open "${url}"`, { stdio: "ignore" });
  } catch {
    // ignore if open fails
  }

  // keep process alive
  return new Promise(() => {});
}
