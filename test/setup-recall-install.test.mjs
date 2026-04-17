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
  return fs.mkdtempSync(path.join(os.tmpdir(), "cursor-memory-setup-"));
}

function cleanup(rootPath) {
  fs.rmSync(rootPath, { recursive: true, force: true });
}

test("setup --local installs recall runtime files", () => {
  const rootPath = makeTempRoot();
  try {
    const result = spawnSync(process.execPath, [CLI_PATH, "setup", "--local"], {
      cwd: rootPath,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.equal(
      fs.existsSync(
        path.join(rootPath, ".cursor", "hooks", "cursor-memory-recall.mjs"),
      ),
      true,
    );
    assert.equal(
      fs.existsSync(
        path.join(
          rootPath,
          ".cursor",
          "hooks",
          "cursor-memory-recall-contract.mjs",
        ),
      ),
      true,
    );
    assert.equal(
      fs.existsSync(
        path.join(
          rootPath,
          ".cursor",
          "hooks",
          "cursor-memory-recall-runtime.mjs",
        ),
      ),
      true,
    );
  } finally {
    cleanup(rootPath);
  }
});

test("setup --global installs recall runtime files under HOME", () => {
  const rootPath = makeTempRoot();
  try {
    const fakeHome = path.join(rootPath, "fake-home");
    fs.mkdirSync(fakeHome, { recursive: true });

    const result = spawnSync(process.execPath, [CLI_PATH, "setup", "--global"], {
      cwd: rootPath,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: fakeHome,
      },
    });

    assert.equal(result.status, 0);
    assert.equal(
      fs.existsSync(
        path.join(fakeHome, ".cursor", "hooks", "cursor-memory-recall.mjs"),
      ),
      true,
    );
  } finally {
    cleanup(rootPath);
  }
});
