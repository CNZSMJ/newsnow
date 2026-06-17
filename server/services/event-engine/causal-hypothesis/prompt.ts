import type { EventDetail } from "@shared/types"
import { getCausalHypothesisPromptDefinition } from "#/services/event-engine/prompt-registry"
import { buildCausalHypothesisGenerationInput } from "#/services/event-engine/causal-hypothesis/input"
import type { CausalHypothesisGenerationInputOptions } from "#/services/event-engine/causal-hypothesis/types"

export const CAUSAL_HYPOTHESIS_SCHEMA_NAME = "newsnow_causal_hypothesis_output"
export const CAUSAL_HYPOTHESIS_PROMPT_ID = getCausalHypothesisPromptDefinition().id
export const CAUSAL_HYPOTHESIS_PROMPT_VERSION = getCausalHypothesisPromptDefinition().version

const causeTypeSchema = {
  type: "string",
  enum: [
    "policy_or_regulation",
    "macro_or_liquidity",
    "industry_supply_demand",
    "company_action",
    "market_flow_or_sentiment",
    "external_event",
  ],
} as const

export const CAUSAL_HYPOTHESIS_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["available", "unknown"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    hypotheses: {
      type: "array",
      minItems: 0,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          statement: { type: "string" },
          causeType: causeTypeSchema,
          basis: {
            type: "string",
            enum: ["stated", "inferred"],
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          rationale: { type: "string" },
          evidenceIds: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
          factIds: {
            type: "array",
            items: { type: "string" },
          },
          evidenceSpans: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                evidenceId: { type: "string" },
                field: {
                  type: "string",
                  enum: ["title", "summary", "payload"],
                },
                snippet: { type: "string" },
                offset: {
                  type: "integer",
                  minimum: 0,
                },
              },
              required: ["evidenceId", "field"],
            },
          },
        },
        required: [
          "statement",
          "causeType",
          "basis",
          "confidence",
          "rationale",
          "evidenceIds",
          "factIds",
          "evidenceSpans",
        ],
      },
    },
    unknownReason: {
      anyOf: [
        { type: "string" },
        { type: "null" },
      ],
    },
  },
  required: [
    "status",
    "confidence",
    "hypotheses",
    "unknownReason",
  ],
} as const

export const CAUSAL_HYPOTHESIS_SYSTEM_PROMPT = getCausalHypothesisPromptDefinition().systemPrompt.join("\n")

export function buildCausalHypothesisPromptInput(
  detail: EventDetail,
  options: CausalHypothesisGenerationInputOptions,
) {
  return buildCausalHypothesisGenerationInput(detail, options).promptInput
}
