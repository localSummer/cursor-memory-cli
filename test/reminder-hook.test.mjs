import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cursor-memory-hook-"));
}

function cleanup(rootPath) {
  fs.rmSync(rootPath, { recursive: true, force: true });
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

test("reminder hook writes capture reminder and returns recall modification output", () => {
  const rootPath = makeTempRoot();
  try {
    const hooksDir = path.join(rootPath, ".cursor", "hooks");
    const rulesDir = path.join(rootPath, ".cursor", "rules");
    copyFile(
      path.join(process.cwd(), "templates", "hooks", "cursor-memory-reminder.sh"),
      path.join(hooksDir, "cursor-memory-reminder.sh"),
    );
    copyFile(
      path.join(process.cwd(), "templates", "hooks", "cursor-memory-recall.mjs"),
      path.join(hooksDir, "cursor-memory-recall.mjs"),
    );
    copyFile(
      path.join(
        process.cwd(),
        "templates",
        "hooks",
        "cursor-memory-recall-contract.mjs",
      ),
      path.join(hooksDir, "cursor-memory-recall-contract.mjs"),
    );
    copyFile(
      path.join(
        process.cwd(),
        "templates",
        "hooks",
        "cursor-memory-recall-runtime.mjs",
      ),
      path.join(hooksDir, "cursor-memory-recall-runtime.mjs"),
    );
    fs.chmodSync(path.join(hooksDir, "cursor-memory-reminder.sh"), 0o755);

    writeJson(
      path.join(rootPath, "memories", "2026-04-15", "session.json"),
      {
        session_id: "session-1",
        timestamp: "2026-04-15T00:00:00Z",
        memories: [
          {
            type: "decision",
            title: "验证 recall contract",
            content: "需要确认 beforeSubmitPrompt 的 prompt modification 输出合同。",
            confidence_score: 95,
          },
        ],
      },
    );

    const payload = JSON.stringify({
      hook_event_name: "beforeSubmitPrompt",
      prompt: "请帮我验证 prompt modification 合同",
      workspace_roots: [rootPath],
    });

    const result = spawnSync(
      path.join(hooksDir, "cursor-memory-reminder.sh"),
      [],
      {
        cwd: rootPath,
        encoding: "utf8",
        input: payload,
        env: {
          ...process.env,
          CURSOR_MEMORY_NODE_BIN: process.execPath,
          CURSOR_MEMORY_RECALL_RESPONSE_MODE: "updated_input_prompt",
        },
      },
    );

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.continue, true);
    assert.match(parsed.updated_input.prompt, /\[相关历史记忆/);
    assert.equal(
      fs.existsSync(path.join(rulesDir, "cursor-memory-reminder.mdc")),
      true,
    );
  } finally {
    cleanup(rootPath);
  }
});
