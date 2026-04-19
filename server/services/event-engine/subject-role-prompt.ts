import type { SubjectResolutionInput } from "#/services/event-engine/subject-resolution"
import { getSubjectRoleExtractionPromptDefinition } from "#/services/event-engine/prompt-registry"

const MAX_CONTEXT_CHARS = 600

export const SUBJECT_ROLE_EXTRACTION_SCHEMA_NAME = "newsnow_subject_role_slots"
export const SUBJECT_ROLE_EXTRACTION_PROMPT_ID = getSubjectRoleExtractionPromptDefinition().id
export const SUBJECT_ROLE_EXTRACTION_PROMPT_VERSION = getSubjectRoleExtractionPromptDefinition().version

export const SUBJECT_ROLE_EXTRACTION_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    provider: {
      type: "string",
      const: "llm",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    slots: {
      type: "object",
      additionalProperties: false,
      properties: {
        eventPhrases: {
          type: "array",
          items: { type: "string" },
        },
        explicitCompanies: {
          type: "array",
          items: { type: "string" },
        },
        explicitTickers: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              code: { type: "string" },
              fullCode: { type: "string" },
              market: {
                type: "string",
                enum: ["US", "HK"],
              },
            },
            required: ["label", "code", "fullCode", "market"],
          },
        },
        institutions: {
          type: "array",
          items: { type: "string" },
        },
        industries: {
          type: "array",
          items: { type: "string" },
        },
        markets: {
          type: "array",
          items: { type: "string" },
        },
        nonEntityPhrases: {
          type: "array",
          items: { type: "string" },
        },
        causalDrivers: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "eventPhrases",
        "explicitCompanies",
        "explicitTickers",
        "institutions",
        "industries",
        "markets",
        "nonEntityPhrases",
        "causalDrivers",
      ],
    },
  },
  required: ["provider", "confidence", "slots"],
} as const

export const SUBJECT_ROLE_EXTRACTION_SYSTEM_PROMPT = getSubjectRoleExtractionPromptDefinition().systemPrompt.join("\n")

function truncate(value?: string | null) {
  const normalized = value?.trim()
  if (!normalized) return undefined
  return normalized.length > MAX_CONTEXT_CHARS
    ? `${normalized.slice(0, MAX_CONTEXT_CHARS)}...`
    : normalized
}

export function buildSubjectRoleExtractionInput(input: SubjectResolutionInput) {
  const raw = (input.payload?.extra?.raw ?? {}) as Record<string, unknown>
  const extra = (input.payload?.extra ?? {}) as Record<string, unknown>

  return JSON.stringify({
    task: "Extract subject role slots for downstream registry resolution.",
    eventContext: {
      title: truncate(input.title),
      summary: truncate(input.summary),
      eventType: input.eventType,
      eventSubType: input.eventSubType,
      sourceKind: input.sourceKind ?? null,
      topicTags: input.topicTags,
      affectedMarkets: input.affectedMarkets,
    },
    sourceText: {
      payloadInfo: truncate(typeof extra.info === "string" ? extra.info : null),
      payloadHover: truncate(typeof extra.hover === "string" ? extra.hover : null),
      rawBrief: truncate(typeof raw.brief === "string" ? raw.brief : null),
      rawDescription: truncate(typeof raw.description === "string" ? raw.description : null),
      rawAbstract: truncate(typeof raw.abstract === "string" ? raw.abstract : null),
      rawPreviewText: truncate(typeof raw.previewText === "string" ? raw.previewText : null),
    },
  }, null, 2)
}
