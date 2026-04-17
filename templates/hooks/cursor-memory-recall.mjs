#!/usr/bin/env node

import { stdin, stdout } from "node:process";
import {
  buildHookResponse,
  buildModifiedPrompt,
  buildProbeInjectionText,
  buildProbeReport,
  normalizeHookPayload,
  parseCliArgs,
  safeParseJson,
  writeProbeReport,
} from "./cursor-memory-recall-contract.mjs";
import {
  buildRecallInjection,
  findRecallCandidates,
} from "./cursor-memory-recall-runtime.mjs";

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => {
      data += chunk;
    });
    stdin.on("end", () => resolve(data));
    stdin.on("error", reject);
  });
}

function resolveReportFile(cliOptions) {
  if (cliOptions.reportFile) {
    return cliOptions.reportFile;
  }
  if (process.env.CURSOR_MEMORY_HOOK_DEBUG_FILE) {
    return process.env.CURSOR_MEMORY_HOOK_DEBUG_FILE;
  }
  return null;
}

async function main() {
  const cliOptions = parseCliArgs(process.argv);
  const rawInput = await readStdin();
  const parseResult = safeParseJson(rawInput || "{}");
  const normalizedPayload = normalizeHookPayload(parseResult.value);

  const shouldAttemptRecall =
    parseResult.ok &&
    normalizedPayload.hookEventName === "beforeSubmitPrompt" &&
    normalizedPayload.prompt &&
    normalizedPayload.workspaceRoots.length > 0;

  const probeMode =
    cliOptions.probeMode || process.env.CURSOR_MEMORY_RECALL_PROBE_MODE === "1";

  const recallCandidates =
    shouldAttemptRecall && !probeMode
      ? findRecallCandidates(
          normalizedPayload.workspaceRoots,
          normalizedPayload.prompt,
          {
            maxResults: 3,
            minScore: Number(process.env.CURSOR_MEMORY_RECALL_MIN_SCORE) || 10,
          },
        )
      : [];

  const injectionText = probeMode
    ? buildProbeInjectionText({
        markerText: cliOptions.markerText,
        normalizedPayload,
      })
    : buildRecallInjection(recallCandidates);

  const modifiedPrompt = injectionText
    ? buildModifiedPrompt(
        normalizedPayload.prompt,
        injectionText,
        cliOptions.position,
      )
    : "";

  const responsePayload = buildHookResponse({
    mode: cliOptions.responseMode,
    originalPayload: parseResult.value || {},
    modifiedPrompt,
  });

  const report = buildProbeReport({
    parseResult,
    normalizedPayload,
    responseMode: cliOptions.responseMode,
    modifiedPrompt,
    responsePayload,
    recall_candidates: recallCandidates,
    probe_mode: probeMode,
  });
  writeProbeReport(resolveReportFile(cliOptions), report);

  stdout.write(JSON.stringify(responsePayload));
}

main().catch((error) => {
  const fallbackResponse = { continue: true };
  writeProbeReport(process.env.CURSOR_MEMORY_HOOK_DEBUG_FILE, {
    generated_at: new Date().toISOString(),
    parse_ok: false,
    parse_error: error.message,
    response_mode: "continue_only",
    modified_prompt_preview: null,
    response_payload: fallbackResponse,
  });
  stdout.write(JSON.stringify(fallbackResponse));
  process.exit(0);
});
