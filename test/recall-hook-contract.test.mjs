import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildHookResponse,
  buildModifiedPrompt,
  buildProbeInjectionText,
  normalizeHookPayload,
} from "../templates/hooks/cursor-memory-recall-contract.mjs";
import { findMemoriesDirs } from "../templates/hooks/cursor-memory-recall-runtime.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RECALL_HOOK_PATH = path.resolve(
  __dirname,
  "..",
  "templates",
  "hooks",
  "cursor-memory-recall.mjs",
);

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cursor-memory-recall-"));
}

function cleanup(rootPath) {
  fs.rmSync(rootPath, { recursive: true, force: true });
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

test("normalizeHookPayload extracts prompt and workspace roots", () => {
  const normalized = normalizeHookPayload({
    hook_event_name: "beforeSubmitPrompt",
    prompt: "hello",
    workspace_roots: ["/repo/a", "/repo/a", "  ", "/repo/b"],
    attachments: [{ type: "file" }],
    cursor_version: "2.6.20",
  });

  assert.equal(normalized.hookEventName, "beforeSubmitPrompt");
  assert.equal(normalized.prompt, "hello");
  assert.deepEqual(normalized.workspaceRoots, ["/repo/a", "/repo/b"]);
  assert.equal(normalized.attachmentsCount, 1);
  assert.equal(normalized.cursorVersion, "2.6.20");
});

test("buildModifiedPrompt supports prepend and append modes", () => {
  assert.equal(
    buildModifiedPrompt("user prompt", "probe block", "prepend"),
    "probe block\n\nuser prompt",
  );
  assert.equal(
    buildModifiedPrompt("user prompt", "probe block", "append"),
    "user prompt\n\nprobe block",
  );
});

test("buildHookResponse supports multiple candidate response shapes", () => {
  const originalPayload = { prompt: "hello", hook_event_name: "beforeSubmitPrompt" };
  const modifiedPrompt = "probe\n\nhello";

  assert.deepEqual(
    buildHookResponse({ mode: "continue_only", originalPayload, modifiedPrompt }),
    { continue: true },
  );
  assert.deepEqual(
    buildHookResponse({ mode: "prompt", originalPayload, modifiedPrompt }),
    { continue: true, prompt: modifiedPrompt },
  );
  assert.deepEqual(
    buildHookResponse({ mode: "updated_prompt", originalPayload, modifiedPrompt }),
    { continue: true, updated_prompt: modifiedPrompt },
  );
  assert.deepEqual(
    buildHookResponse({
      mode: "updated_input_prompt",
      originalPayload,
      modifiedPrompt,
    }),
    {
      continue: true,
      updated_input: {
        prompt: modifiedPrompt,
        hook_event_name: "beforeSubmitPrompt",
      },
    },
  );
});

test("buildProbeInjectionText includes prompt and root counts", () => {
  const injection = buildProbeInjectionText({
    markerText: "validation marker",
    normalizedPayload: {
      prompt: "hello world",
      workspaceRoots: ["/repo/a", "/repo/b"],
    },
  });

  assert.match(injection, /validation marker/);
  assert.match(injection, /prompt_chars=11/);
  assert.match(injection, /workspace_roots=2/);
});

test("recall hook prototype returns a modified prompt when relevant memories exist", () => {
  const rootPath = makeTempRoot();
  try {
    const reportFile = path.join(rootPath, "probe-report.json");
    writeJson(
      path.join(rootPath, "workspace", "memories", "2026-04-15", "session.json"),
      {
        session_id: "session-1",
        timestamp: "2026-04-15T00:00:00Z",
        memories: [
          {
            type: "decision",
            title: "修复 hook payload 解析",
            content: "我们需要优先验证 beforeSubmitPrompt payload 中的 prompt 和 workspace_roots 字段。",
            confidence_score: 90,
          },
        ],
      },
    );

    const payload = JSON.stringify({
      hook_event_name: "beforeSubmitPrompt",
      prompt: "请验证 beforeSubmitPrompt 的 payload 解析",
      workspace_roots: [path.join(rootPath, "workspace")],
    });

    const result = spawnSync(
      process.execPath,
      [
        RECALL_HOOK_PATH,
        "--response-mode",
        "updated_input_prompt",
        "--report-file",
        reportFile,
      ],
      {
        encoding: "utf8",
        input: payload,
      },
    );

    assert.equal(result.status, 0);
    const parsedOutput = JSON.parse(result.stdout);
    assert.equal(parsedOutput.continue, true);
    assert.match(parsedOutput.updated_input.prompt, /\[相关历史记忆/);
    assert.match(parsedOutput.updated_input.prompt, /修复 hook payload 解析/);
    assert.equal(fs.existsSync(reportFile), true);

    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    assert.equal(report.parse_ok, true);
    assert.equal(report.normalized_payload.prompt, "请验证 beforeSubmitPrompt 的 payload 解析");
    assert.equal(report.response_mode, "updated_input_prompt");
    assert.equal(report.recall_candidates.length, 1);
  } finally {
    cleanup(rootPath);
  }
});

test("recall hook prototype can recall archived session memories", () => {
  const rootPath = makeTempRoot();
  try {
    const workspaceRoot = path.join(rootPath, "workspace");
    writeJson(
      path.join(
        workspaceRoot,
        "memories",
        "archive",
        "2026-03",
        "2026-03-10-archived-session.json",
      ),
      {
        session_id: "archived-session-1",
        timestamp: "2026-03-10T00:00:00Z",
        memories: [
          {
            type: "insight",
            title: "历史归档中的 prompt modification 约束",
            content:
              "即使 memory 已归档，只要仍在当前项目 archive 下，也应该能参与 recall 候选。",
            confidence_score: 88,
          },
        ],
      },
    );

    const payload = JSON.stringify({
      hook_event_name: "beforeSubmitPrompt",
      prompt: "请结合 archive 里的 prompt modification 历史约束",
      workspace_roots: [workspaceRoot],
    });

    const result = spawnSync(
      process.execPath,
      [RECALL_HOOK_PATH, "--response-mode", "updated_prompt"],
      {
        encoding: "utf8",
        input: payload,
      },
    );

    assert.equal(result.status, 0);
    const response = JSON.parse(result.stdout);
    assert.equal(response.continue, true);
    assert.match(response.updated_prompt, /历史归档中的 prompt modification 约束/);
  } finally {
    cleanup(rootPath);
  }
});

test("recall hook prototype degrades to continue-only when prompt or roots are missing", () => {
  const payload = JSON.stringify({
    hook_event_name: "beforeSubmitPrompt",
    prompt: "",
    workspace_roots: [],
  });

  const result = spawnSync(
    process.execPath,
    [RECALL_HOOK_PATH, "--response-mode", "updated_prompt"],
    {
      encoding: "utf8",
      input: payload,
    },
  );

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { continue: true });
});

test("recall hook prototype supports explicit probe mode for contract validation", () => {
  const payload = JSON.stringify({
    hook_event_name: "beforeSubmitPrompt",
    prompt: "hello world",
    workspace_roots: ["/repo/project"],
  });

  const result = spawnSync(
    process.execPath,
    [RECALL_HOOK_PATH, "--response-mode", "updated_prompt", "--probe-mode"],
    {
      encoding: "utf8",
      input: payload,
    },
  );

  assert.equal(result.status, 0);
  const response = JSON.parse(result.stdout);
  assert.equal(response.continue, true);
  assert.match(response.updated_prompt, /cursor-memory recall probe/i);
});

test("findMemoriesDirs only uses the workspace root direct memories directory", () => {
  const rootPath = makeTempRoot();
  try {
    fs.mkdirSync(path.join(rootPath, "memories"), { recursive: true });
    fs.mkdirSync(
      path.join(rootPath, "packages", "nested-project", "memories"),
      { recursive: true },
    );

    assert.deepEqual(findMemoriesDirs(rootPath), [path.join(rootPath, "memories")]);
    assert.deepEqual(
      findMemoriesDirs(path.join(rootPath, "packages", "nested-project")),
      [path.join(rootPath, "packages", "nested-project", "memories")],
    );
  } finally {
    cleanup(rootPath);
  }
});
