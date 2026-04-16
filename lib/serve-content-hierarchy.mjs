function toText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toTextList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => toText(value))
    .filter((value) => value.length > 0);
}

function normalizeAlternatives(alternatives) {
  if (!Array.isArray(alternatives)) return [];
  return alternatives
    .map((alt) => ({
      option: toText(alt?.option),
      whyNot: toText(alt?.why_not),
    }))
    .filter((alt) => alt.option || alt.whyNot);
}

function normalizeEntities(entities) {
  if (!Array.isArray(entities)) return [];
  return entities
    .map((ent) => {
      const type = toText(ent?.type);
      const raw = toText(ent?.raw || ent?.slug);
      return type && raw ? `${type}: ${raw}` : raw || type;
    })
    .filter(Boolean);
}

export function buildMemorySections(mem = {}, { index = 0 } = {}) {
  const type = toText(mem.type) || "unknown";
  const category = toText(mem.category);
  const title = toText(mem.title) || `Memory ${index + 1}`;
  const content = toText(mem.content);
  const selectedOption = toText(mem.selected_option);
  const reasoning = toText(mem.reasoning);
  const sourceChunk = toText(mem.source_chunk);
  const urlsMentioned = toTextList(mem.urls_mentioned);
  const relatedEntities = normalizeEntities(mem.related_entities);
  const toolsMentioned = toTextList(mem.tools_mentioned);
  const targetAgents = toTextList(mem.target_agents);
  const alternatives = normalizeAlternatives(mem.alternatives);
  const confidenceScore =
    typeof mem.confidence_score === "number" ? mem.confidence_score : null;

  return {
    header: {
      type,
      typeLabel: type.replace(/_/g, " "),
      category,
      title,
    },
    conclusion: {
      content,
      selectedOption,
      hasPrimaryContent: Boolean(content || selectedOption),
    },
    supporting: {
      reasoning,
      confidenceScore,
      alternatives,
      relatedEntities,
      toolsMentioned,
      targetAgents,
      hasContent: Boolean(
        reasoning ||
          confidenceScore !== null ||
          alternatives.length > 0 ||
          relatedEntities.length > 0 ||
          toolsMentioned.length > 0 ||
          targetAgents.length > 0,
      ),
    },
    evidence: {
      urlsMentioned,
      sourceChunk,
      hasContent: Boolean(urlsMentioned.length > 0 || sourceChunk),
    },
  };
}

export function getDocumentSectionOrder(doc = {}) {
  const order = ["memories"];
  if (Array.isArray(doc.suggestions) && doc.suggestions.length > 0) {
    order.push("suggestions");
  }
  order.push("raw-json");
  return order;
}
