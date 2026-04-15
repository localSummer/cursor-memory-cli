import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanRoot } from "../lib/scanner.mjs";
import {
  SHARE_QUERY_PARAM,
  buildShareUrl,
  buildTreeIndexes,
  resolveSharedEntry,
} from "../lib/serve-permalink.mjs";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cursor-memory-permalink-"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function cleanup(rootPath) {
  fs.rmSync(rootPath, { recursive: true, force: true });
}

function buildFixtureTree(rootPath) {
  writeJson(
    path.join(rootPath, "workspace", "memories", "2026-03-18", "demo-session.json"),
    {
      session_id: "2026-03-18-demo-session",
      timestamp: "2026-03-18T00:00:00Z",
      memories: [],
    },
  );
  writeJson(
    path.join(
      rootPath,
      "workspace",
      "memories",
      "archive",
      "2026-03",
      "2026-03-18-demo-session.json",
    ),
    {
      session_id: "2026-03-18-demo-session",
      timestamp: "2026-03-18T00:00:00Z",
      memories: [],
    },
  );
  writeJson(
    path.join(
      rootPath,
      "workspace",
      "memories",
      "archive",
      "aggregate",
      "2026-03.json",
    ),
    {
      month: "2026-03",
      generated_at: "2026-03-31T00:00:00Z",
      deduped_memories: [],
    },
  );
}

test("buildTreeIndexes prefers active sessions over archived sessions for the same shareKey", () => {
  const rootPath = makeTempRoot();
  try {
    buildFixtureTree(rootPath);

    const { projects } = scanRoot(rootPath);
    const { byShareKey } = buildTreeIndexes(projects);
    const active = projects[0].memories[0].files[0];
    const resolved = byShareKey.get(active.shareKey);

    assert.equal(resolved.id, active.id);
    assert.equal(resolved.kind, "session");
  } finally {
    cleanup(rootPath);
  }
});

test("buildShareUrl adds, replaces, and removes the share query parameter", () => {
  const baseHref = "http://127.0.0.1:3000/?q=memory";

  const withShare = buildShareUrl(baseHref, "workspace:session:demo");
  const parsedWithShare = new URL(withShare);
  assert.equal(parsedWithShare.searchParams.get("q"), "memory");
  assert.equal(
    parsedWithShare.searchParams.get(SHARE_QUERY_PARAM),
    "workspace:session:demo",
  );

  const replacedShare = buildShareUrl(withShare, "workspace:aggregate:2026-03");
  assert.equal(
    new URL(replacedShare).searchParams.get(SHARE_QUERY_PARAM),
    "workspace:aggregate:2026-03",
  );

  const withoutShare = buildShareUrl(replacedShare, null);
  assert.equal(new URL(withoutShare).searchParams.has(SHARE_QUERY_PARAM), false);
  assert.equal(new URL(withoutShare).searchParams.get("q"), "memory");
});

test("resolveSharedEntry returns not-found after refresh when the target disappears", () => {
  const rootPath = makeTempRoot();
  try {
    buildFixtureTree(rootPath);

    const firstScan = scanRoot(rootPath);
    const firstIndexes = buildTreeIndexes(firstScan.projects);
    const active = firstScan.projects[0].memories[0].files[0];
    const href = buildShareUrl("http://127.0.0.1:3000/", active.shareKey);

    const firstResolution = resolveSharedEntry({
      href,
      byShareKey: firstIndexes.byShareKey,
    });
    assert.equal(firstResolution.status, "resolved");
    assert.equal(firstResolution.entry.id, active.id);

    fs.rmSync(path.join(rootPath, "workspace", "memories"), {
      recursive: true,
      force: true,
    });

    const secondScan = scanRoot(rootPath);
    const secondIndexes = buildTreeIndexes(secondScan.projects);
    const secondResolution = resolveSharedEntry({
      href,
      byShareKey: secondIndexes.byShareKey,
    });

    assert.deepEqual(secondScan.projects, []);
    assert.equal(secondResolution.status, "not-found");
    assert.equal(secondResolution.shareKey, active.shareKey);
    assert.equal(secondResolution.entry, null);
  } finally {
    cleanup(rootPath);
  }
});
