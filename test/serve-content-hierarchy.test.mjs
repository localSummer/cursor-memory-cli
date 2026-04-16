import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMemorySections,
  getDocumentSectionOrder,
} from "../lib/serve-content-hierarchy.mjs";

test("buildMemorySections promotes decision choice into the conclusion layer", () => {
  const sections = buildMemorySections({
    type: "decision",
    category: "technical",
    title: "Choose auth mechanism",
    selected_option: "JWT",
    content: "Use JWT for stateless service-to-service auth.",
    reasoning: "Session state would not scale cleanly.",
    alternatives: [{ option: "Session", why_not: "Server state overhead" }],
    confidence_score: 91,
    related_entities: [{ type: "project", raw: "auth-service" }],
    tools_mentioned: ["serve"],
    target_agents: ["executor"],
    urls_mentioned: ["https://example.com/spec"],
    source_chunk: "**User:** What should we use?\n**Assistant:** JWT.",
  });

  assert.equal(sections.header.type, "decision");
  assert.equal(sections.conclusion.selectedOption, "JWT");
  assert.equal(
    sections.conclusion.content,
    "Use JWT for stateless service-to-service auth.",
  );
  assert.equal(sections.supporting.reasoning, "Session state would not scale cleanly.");
  assert.equal(sections.supporting.confidenceScore, 91);
  assert.deepEqual(sections.supporting.alternatives, [
    { option: "Session", whyNot: "Server state overhead" },
  ]);
  assert.deepEqual(sections.supporting.relatedEntities, [
    "project: auth-service",
  ]);
  assert.deepEqual(sections.evidence.urlsMentioned, ["https://example.com/spec"]);
  assert.equal(
    sections.evidence.sourceChunk,
    "**User:** What should we use?\n**Assistant:** JWT.",
  );
});

test("buildMemorySections keeps ordinary memory content in the conclusion layer", () => {
  const sections = buildMemorySections(
    {
      type: "insight",
      title: "Search performance issue",
      content: "Search results slow down once archives exceed 10k records.",
      related_entities: [{ type: "module", raw: "search-command" }],
      tools_mentioned: ["rg"],
      target_agents: ["debugger"],
    },
    { index: 2 },
  );

  assert.equal(sections.header.title, "Search performance issue");
  assert.equal(
    sections.conclusion.content,
    "Search results slow down once archives exceed 10k records.",
  );
  assert.equal(sections.conclusion.selectedOption, "");
  assert.deepEqual(sections.supporting.relatedEntities, [
    "module: search-command",
  ]);
  assert.deepEqual(sections.supporting.toolsMentioned, ["rg"]);
  assert.deepEqual(sections.supporting.targetAgents, ["debugger"]);
  assert.equal(sections.evidence.hasContent, false);
});

test("getDocumentSectionOrder places raw json after memories and suggestions", () => {
  assert.deepEqual(
    getDocumentSectionOrder({
      kind: "session",
      suggestions: [{ type: "follow_up", message: "Inspect archive retention" }],
    }),
    ["memories", "suggestions", "raw-json"],
  );

  assert.deepEqual(
    getDocumentSectionOrder({
      kind: "aggregate",
      deduped_memories: [],
    }),
    ["memories", "raw-json"],
  );
});
