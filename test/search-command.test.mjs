import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.resolve(__dirname, "..", "index.mjs");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cursor-memory-search-"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function cleanup(rootPath) {
  fs.rmSync(rootPath, { recursive: true, force: true });
}

function stripAnsi(text) {
  return text.replace(/\x1B\[[0-9;]*m/g, "");
}

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf8",
    ...options,
  });

  return {
    status: result.status,
    stdout: stripAnsi(result.stdout),
    stderr: stripAnsi(result.stderr),
  };
}

function writeSearchFixture(rootPath) {
  writeJson(
    path.join(rootPath, "workspace", "memories", "2026-03-18", "older.json"),
    {
      session_id: "older-session",
      timestamp: "2026-03-18T00:00:00Z",
      memories: [
        {
          title: "Older match",
          content: "This memory mentions refresh tokens.",
        },
      ],
    },
  );

  writeJson(
    path.join(rootPath, "workspace", "memories", "2026-03-19", "newer.json"),
    {
      session_id: "newer-session",
      timestamp: "2026-03-19T00:00:00Z",
      memories: [
        {
          title: "Newer match",
          content: "This memory also mentions refresh tokens.",
        },
      ],
    },
  );
}

test("search command returns newest hits first and respects --limit", () => {
  const rootPath = makeTempRoot();
  try {
    writeSearchFixture(rootPath);

    const result = runCli(["search", "match", "--root", rootPath, "--limit", "1"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Found 2 matching memories for "match"\./);
    assert.match(result.stdout, /Showing 1 result\(s\)\./);
    assert.match(result.stdout, /Newer match/);
    assert.doesNotMatch(result.stdout, /Older match/);
  } finally {
    cleanup(rootPath);
  }
});

test("search command defaults to process cwd when --root is omitted", () => {
  const rootPath = makeTempRoot();
  try {
    writeJson(
      path.join(rootPath, "workspace", "memories", "2026-03-20", "cwd.json"),
      {
        session_id: "cwd-session",
        timestamp: "2026-03-20T00:00:00Z",
        memories: [
          {
            title: "Cwd search hit",
            content: "Search from the current working directory.",
          },
        ],
      },
    );

    const result = runCli(["search", "cwd", "search"], { cwd: rootPath });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Found 1 matching memory for "cwd search"\./);
    assert.match(result.stdout, /Cwd search hit/);
  } finally {
    cleanup(rootPath);
  }
});

test("search command treats no matches as a successful result", () => {
  const rootPath = makeTempRoot();
  try {
    writeSearchFixture(rootPath);

    const result = runCli(["search", "no-such-keyword", "--root", rootPath]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /No memories matched "no-such-keyword"\./);
  } finally {
    cleanup(rootPath);
  }
});

test("search command requires a query", () => {
  const result = runCli(["search"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /search requires a query\./);
  assert.match(result.stdout, /Usage: node cli\/cursor-memory-cli\/index\.mjs/);
});

test("search command rejects an unreadable root path", () => {
  const missingPath = path.join(os.tmpdir(), "cursor-memory-search-missing");
  const result = runCli(["search", "match", "--root", missingPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Root directory not found or not readable/);
});

test("help output documents the search command", () => {
  const result = runCli(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /search\s+Search stored memories from the terminal/);
  assert.match(result.stdout, /--root <path>\s+Search root directory/);
});
