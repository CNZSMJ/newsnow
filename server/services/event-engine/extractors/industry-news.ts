import md5 from "md5"
import type { NewsItem, SourceID } from "@shared/types"
import sources from "@shared/sources"
import type { EventFactRow, RawItemRow } from "#/types"
import { extractPeriodKey, inferReleaseCadence, normalizeTitle, stripHtml } from "#/services/event-engine/text"

function pickSummary(payload: NewsItem) {
  const extraInfo = payload.extra?.info
  if (typeof extraInfo === "string" && extraInfo.trim()) return extraInfo.trim()
  return undefined
}

function firstTagId(payload: NewsItem, sourceId: SourceID) {
  const tags = (payload.extra as { tags?: string[] } | undefined)?.tags
  if (Array.isArray(tags) && typeof tags[0] === "string") return tags[0]
  const sourceTags = sources[sourceId]?.tags
  if (sourceTags?.length) return sourceTags[0]
  const [main] = sourceId.split("-")
  return main
}

export function extractIndustryNewsFacts(input: {
  eventId: string
  rawId: string
  sourceId: SourceID
  raw: RawItemRow
  payload: NewsItem
}) {
  const title = normalizeTitle(input.payload.title)
  const summary = pickSummary(input.payload)
  const text = `${title} ${summary ?? ""}`
  const raw = (input.payload.extra?.raw ?? {}) as Record<string, unknown>
  const cadence = inferReleaseCadence(text)
  const periodKey = extractPeriodKey(text)
  const entityId = firstTagId(input.payload, input.sourceId)

  const fact: EventFactRow = {
    fact_id: `fact_${md5(`${input.eventId}|${input.rawId}|industry_news|${title}`)}`,
    event_id: input.eventId,
    evidence_id: input.rawId,
    fact_type: "industry_news",
    metric_name: stripHtml(title),
    value: null,
    unit: cadence,
    previous_value: null,
    delta: null,
    direction: null,
    effective_at: input.raw.published_at,
    entity_id: entityId,
    confidence: 0.74,
    payload_json: JSON.stringify({
      sourceId: input.sourceId,
      cadence,
      periodKey,
      summary,
      raw,
      releaseTitle: stripHtml(title),
    }),
  }

  return [fact]
}
