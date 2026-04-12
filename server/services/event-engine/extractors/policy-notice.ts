import md5 from "md5"
import type { NewsItem, SourceID } from "@shared/types"
import sources from "@shared/sources"
import type { EventFactRow, RawItemRow } from "#/types"
import { extractPeriodKey, inferReleaseCadence, normalizeReleaseTitle, normalizeTitle } from "#/services/event-engine/text"

function parsePolicyDirection(text: string) {
  if (/支持|鼓励|推进|促进|扩大|加快|优化|规范发展|提质|提效/.test(text)) return "up"
  if (/限制|压降|收紧|规范整治|处罚|禁止|叫停|暂停|约束/.test(text)) return "down"
  return null
}

function firstTagId(payload: NewsItem, sourceId: SourceID) {
  const tags = (payload.extra as { tags?: string[] } | undefined)?.tags
  if (Array.isArray(tags) && typeof tags[0] === "string") return tags[0]
  const sourceTags = sources[sourceId]?.tags
  if (sourceTags?.length) return sourceTags[0]
  const [main] = sourceId.split("-")
  return main
}

export function extractPolicyNoticeFacts(input: {
  eventId: string
  rawId: string
  sourceId: SourceID
  raw: RawItemRow
  payload: NewsItem
}) {
  const title = normalizeTitle(input.payload.title)
  const text = `${title} ${typeof input.payload.extra?.info === "string" ? input.payload.extra.info : ""}`
  const raw = (input.payload.extra?.raw ?? {}) as Record<string, unknown>
  const periodKey = extractPeriodKey(text)
  const cadence = inferReleaseCadence(text)
  const direction = parsePolicyDirection(text)

  const fact: EventFactRow = {
    fact_id: `fact_${md5(`${input.eventId}|${input.rawId}|policy_notice`)}`,
    event_id: input.eventId,
    evidence_id: input.rawId,
    fact_type: "policy_notice",
    metric_name: normalizeReleaseTitle(title) || "policy_notice",
    value: null,
    unit: cadence,
    previous_value: null,
    delta: null,
    direction,
    effective_at: input.raw.published_at,
    entity_id: firstTagId(input.payload, input.sourceId),
    confidence: 0.72,
    payload_json: JSON.stringify({
      sourceId: input.sourceId,
      cadence,
      periodKey,
      summary: typeof input.payload.extra?.info === "string" ? input.payload.extra.info : undefined,
      raw,
    }),
  }

  return [fact]
}
