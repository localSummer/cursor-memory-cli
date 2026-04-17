import fs from "node:fs";
import path from "node:path";

const DEFAULT_RESPONSE_MODE = "continue_only";
const SUPPORTED_RESPONSE_MODES = new Set([
  "continue_only",
  "prompt",
  "updated_prompt",
  "updated_input_prompt",
]);

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function safeParseJson(rawText) {
  try {
    return {
      ok: true,
      value: JSON.parse(rawText),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      value: null,
      error: error.message,
    };
  }
}

export function normalizeHookPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const workspaceRoots = uniqueStrings(
    Array.isArray(source.workspace_roots)
      ? source.workspace_roots
      : Array.isArray(source.workspaceRoots)
        ? source.workspaceRoots
        : [],
  );

  return {
    hookEventName:
      typeof source.hook_event_name === "string" ? source.hook_event_name : null,
    prompt: typeof source.prompt === "string" ? source.prompt : "",
    workspaceRoots,
    attachmentsCount: Array.isArray(source.attachments) ? source.attachments.length : 0,
    cursorVersion:
      typeof source.cursor_version === "string" ? source.cursor_version : null,
    conversationId:
      typeof source.conversation_id === "string" ? source.conversation_id : null,
    generationId:
      typeof source.generation_id === "string" ? source.generation_id : null,
    model: typeof source.model === "string" ? source.model : null,
    transcriptPath:
      typeof source.transcript_path === "string" ? source.transcript_path : null,
    userEmail: typeof source.user_email === "string" ? source.user_email : null,
  };
}

export function resolveResponseMode(mode) {
  if (typeof mode !== "string") {
    return DEFAULT_RESPONSE_MODE;
  }
  return SUPPORTED_RESPONSE_MODES.has(mode) ? mode : DEFAULT_RESPONSE_MODE;
}

export function buildProbeInjectionText(options = {}) {
  const {
    markerText = "Cursor Memory recall probe",
    normalizedPayload,
  } = options;

  const promptLength = normalizedPayload?.prompt?.length || 0;
  const rootsCount = normalizedPayload?.workspaceRoots?.length || 0;

  return [
    "[cursor-memory recall probe]",
    markerText,
    `prompt_chars=${promptLength}`,
    `workspace_roots=${rootsCount}`,
    "ignore_if_not_helpful=true",
  ].join("\n");
}

export function buildModifiedPrompt(originalPrompt, injectionText, position = "prepend") {
  if (!injectionText) {
    return originalPrompt;
  }
  if (!originalPrompt) {
    return injectionText;
  }

  if (position === "append") {
    return `${originalPrompt}\n\n${injectionText}`;
  }
  return `${injectionText}\n\n${originalPrompt}`;
}

export function buildHookResponse(options = {}) {
  const {
    mode = DEFAULT_RESPONSE_MODE,
    originalPayload = {},
    modifiedPrompt = "",
  } = options;

  const resolvedMode = resolveResponseMode(mode);
  if (resolvedMode === "continue_only" || !modifiedPrompt) {
    return { continue: true };
  }

  if (resolvedMode === "prompt") {
    return {
      continue: true,
      prompt: modifiedPrompt,
    };
  }

  if (resolvedMode === "updated_prompt") {
    return {
      continue: true,
      updated_prompt: modifiedPrompt,
    };
  }

  return {
    continue: true,
    updated_input: {
      ...originalPayload,
      prompt: modifiedPrompt,
    },
  };
}

export function buildProbeReport(options = {}) {
  const {
    parseResult,
    normalizedPayload,
    responseMode,
    modifiedPrompt,
    responsePayload,
    recall_candidates: recallCandidates = [],
    probe_mode: probeMode = false,
  } = options;

  return {
    generated_at: new Date().toISOString(),
    parse_ok: parseResult.ok,
    parse_error: parseResult.error,
    normalized_payload: normalizedPayload,
    response_mode: responseMode,
    modified_prompt_preview:
      typeof modifiedPrompt === "string" ? modifiedPrompt.slice(0, 500) : null,
    response_payload: responsePayload,
    probe_mode: probeMode,
    recall_candidates: recallCandidates,
  };
}

export function writeProbeReport(filePath, report) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2) + "\n", "utf8");
}

export function parseCliArgs(argv) {
  const args = argv.slice(2);
  const result = {
    responseMode: DEFAULT_RESPONSE_MODE,
    markerText: "Cursor Memory recall probe",
    position: "prepend",
    reportFile: null,
    probeMode: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--response-mode") {
      result.responseMode = resolveResponseMode(args[i + 1]);
      i += 1;
    } else if (arg === "--marker-text") {
      result.markerText = args[i + 1] || result.markerText;
      i += 1;
    } else if (arg === "--position") {
      const next = args[i + 1];
      result.position = next === "append" ? "append" : "prepend";
      i += 1;
    } else if (arg === "--report-file") {
      result.reportFile = args[i + 1] || null;
      i += 1;
    } else if (arg === "--probe-mode") {
      result.probeMode = true;
    }
  }

  return result;
}
