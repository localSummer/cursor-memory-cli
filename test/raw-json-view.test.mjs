import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanRoot, readMemoryFile } from "../lib/scanner.mjs";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cursor-memory-raw-json-"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function cleanup(rootPath) {
  fs.rmSync(rootPath, { recursive: true, force: true });
}

function toRawPayload(doc) {
  const { kind: _kind, shareKey: _shareKey, ...rawPayload } = doc;
  return rawPayload;
}

function assertRawPayloadMatchesFixture(doc, fixture) {
  const rawPayload = toRawPayload(doc);

  assert.deepEqual(rawPayload, fixture);
  assert.equal(Object.hasOwn(rawPayload, "kind"), false);
  assert.equal(Object.hasOwn(rawPayload, "shareKey"), false);
}

test("raw-view adapter mirrors session fixture JSON without runtime fields", () => {
  const rootPath = makeTempRoot();
  const fixturePath = path.join(
    rootPath,
    "workspace",
    "memories",
    "2026-03-18",
    "demo-session.json",
  );
  const fixture = {
    session_id: "2026-03-18-demo-session",
    timestamp: "2026-03-18T00:00:00Z",
    memories: [
      {
        title: "Session fixture",
        tags: ["node", "json"],
        source_chunk: {
          path: "docs/session.md",
          start_line: 3,
          end_line: 9,
        },
        metadata: {
          nested: {
            ok: true,
          },
        },
      },
    ],
  };

  try {
    writeJson(fixturePath, fixture);

    const { projects, fileIndex } = scanRoot(rootPath);
    const file = projects[0].memories[0].files[0];
    const doc = readMemoryFile(rootPath, file.id, fileIndex);
    assertRawPayloadMatchesFixture(doc, fixture);
  } finally {
    cleanup(rootPath);
  }
});

test("raw-view adapter mirrors aggregate fixture JSON without runtime fields", () => {
  const rootPath = makeTempRoot();
  const fixturePath = path.join(
    rootPath,
    "workspace",
    "memories",
    "archive",
    "aggregate",
    "2026-03.json",
  );
  const fixture = {
    month: "2026-03",
    generated_at: "2026-03-31T00:00:00Z",
    stats: {
      total_memories: 2,
      deduped_count: 1,
    },
    deduped_memories: [
      {
        title: "Aggregate fixture",
        aliases: ["raw", "view"],
        evidence: [
          {
            source: "docs/aggregate.md",
            score: 0.9,
          },
        ],
      },
    ],
  };

  try {
    writeJson(fixturePath, fixture);

    const { projects, fileIndex } = scanRoot(rootPath);
    const file = projects[0].aggregates[0];
    const doc = readMemoryFile(rootPath, file.id, fileIndex);
    assertRawPayloadMatchesFixture(doc, fixture);
  } finally {
    cleanup(rootPath);
  }
});
