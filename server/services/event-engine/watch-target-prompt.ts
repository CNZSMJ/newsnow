import type { AffectedMarket, EventSourceKind } from "@shared/event-profile"
import type { EventSubType, EventType, InvestmentEntityRef } from "@shared/types"
import type { IndustryTag } from "@shared/industry"
import { getWatchTargetCandidatePromptDefinition } from "#/services/event-engine/prompt-registry"

const MAX_CONTEXT_CHARS = 600

export interface WatchTargetCandidateInput {
  eventId: string
  title: string
  summary?: string | null
  eventType: EventType
  eventSubType: EventSubType
  sourceKind?: EventSourceKind
  topicTags: IndustryTag[]
  affectedMarkets: AffectedMarket[]
  affectedEntities: InvestmentEntityRef[]
  impactSummary?: string[]
}

export const WATCH_TARGET_CANDIDATE_SCHEMA_NAME = "newsnow_watch_target_candidates"
export const WATCH_TARGET_CANDIDATE_PROMPT_ID = getWatchTargetCandidatePromptDefinition().id
export const WATCH_TARGET_CANDIDATE_PROMPT_VERSION = getWatchTargetCandidatePromptDefinition().version

export const WATCH_TARGET_CANDIDATE_RESPONSE_JSON_SCHEMA = {
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
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          reason: { type: "string" },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
        },
        required: ["label", "reason", "confidence"],
      },
    },
  },
  required: ["provider", "confidence", "candidates"],
} as const

export const WATCH_TARGET_CANDIDATE_SYSTEM_PROMPT = getWatchTargetCandidatePromptDefinition().systemPrompt.join("\n")

function truncate(value?: string | null) {
  const normalized = value?.trim()
  if (!normalized) return undefined
  return normalized.length > MAX_CONTEXT_CHARS
    ? `${normalized.slice(0, MAX_CONTEXT_CHARS)}...`
    : normalized
}

export function buildWatchTargetCandidateInput(input: WatchTargetCandidateInput) {
  return JSON.stringify({
    task: "Suggest investable public-market watch targets for downstream registry validation.",
    eventContext: {
      eventId: input.eventId,
      title: truncate(input.title),
      summary: truncate(input.summary),
      eventType: input.eventType,
      eventSubType: input.eventSubType,
      sourceKind: input.sourceKind ?? null,
      topicTags: input.topicTags,
      affectedMarkets: input.affectedMarkets,
      impactSummary: input.impactSummary?.map(item => truncate(item)).filter(Boolean) ?? [],
    },
    currentSemantics: {
      affectedEntities: input.affectedEntities.map(entity => ({
        label: entity.label,
        entityType: entity.entityType,
      })),
    },
  }, null, 2)
}
