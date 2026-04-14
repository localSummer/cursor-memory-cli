import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanRoot, readMemoryFile } from "../lib/scanner.mjs";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cursor-memory-share-"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function cleanup(rootPath) {
  fs.rmSync(rootPath, { recursive: true, force: true });
}

test("scanRoot assigns stable shareKey across rescans", () => {
  const rootPath = makeTempRoot();
  try {
    writeJson(
      path.join(rootPath, "workspace", "memories", "2026-03-18", "demo-session.json"),
      {
        session_id: "2026-03-18-demo-session",
        timestamp: "2026-03-18T00:00:00Z",
        memories: [],
      },
    );

    const first = scanRoot(rootPath);
    const second = scanRoot(rootPath);

    const firstFile = first.projects[0].memories[0].files[0];
    const secondFile = second.projects[0].memories[0].files[0];

    assert.equal(firstFile.shareKey, secondFile.shareKey);
    assert.match(firstFile.shareKey, /^workspace:session:/);
    assert.equal(firstFile.timestamp, "2026-03-18T00:00:00");
  } finally {
    cleanup(rootPath);
  }
});

test("active and archived sessions share the same logical shareKey", () => {
  const rootPath = makeTempRoot();
  try {
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

    const { projects } = scanRoot(rootPath);
    const active = projects[0].memories[0].files[0];
    const archived = projects[0].archive[0].files[0];
    const aggregate = projects[0].aggregates[0];

    assert.equal(active.shareKey, archived.shareKey);
    assert.notEqual(active.shareKey, aggregate.shareKey);
    assert.match(aggregate.shareKey, /^workspace:aggregate:/);
  } finally {
    cleanup(rootPath);
  }
});

test("readMemoryFile exposes shareKey in the document response", () => {
  const rootPath = makeTempRoot();
  try {
    writeJson(
      path.join(rootPath, "workspace", "memories", "2026-03-18", "demo-session.json"),
      {
        session_id: "2026-03-18-demo-session",
        timestamp: "2026-03-18T00:00:00Z",
        memories: [],
      },
    );

    const { projects, fileIndex } = scanRoot(rootPath);
    const file = projects[0].memories[0].files[0];
    const doc = readMemoryFile(rootPath, file.id, fileIndex);

    assert.equal(doc.kind, "session");
    assert.equal(doc.shareKey, file.shareKey);
  } finally {
    cleanup(rootPath);
  }
});
