import md5 from "md5"
import type { EventSubType, NewsItem, SourceID } from "@shared/types"
import sources from "@shared/sources"
import type { EventFactRow, RawItemRow } from "#/types"
import { extractPeriodKey, inferReleaseCadence, normalizeReleaseTitle, normalizeTitle, stripHtml } from "#/services/event-engine/text"

function parseDirection(text: string) {
  if (/增长|提升|扩大|回升|改善|上升|增加|创新高|提振|向好/.test(text)) return "up"
  if (/下降|下滑|减少|回落|走弱|承压|收缩|放缓/.test(text)) return "down"
  if (/持平|平稳|稳定|维持/.test(text)) return "flat"
  return null
}

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

export function extractIndustryReleaseFacts(input: {
  eventId: string
  rawId: string
  sourceId: SourceID
  raw: RawItemRow
  payload: NewsItem
  eventSubType: EventSubType
}) {
  const title = normalizeTitle(input.payload.title)
  const summary = pickSummary(input.payload)
  const text = `${title} ${summary ?? ""}`
  const raw = (input.payload.extra?.raw ?? {}) as Record<string, unknown>
  const periodKey = extractPeriodKey(text)
  const cadence = inferReleaseCadence(text)
  const direction = parseDirection(text)
  const entityId = firstTagId(input.payload, input.sourceId)
  const sourceKind = sources[input.sourceId]?.eventProfile?.sourceKind

  const factType = sourceKind === "industry_report_release"
    ? "industry_report"
    : input.eventSubType === "industry_data"
    ? "industry_release"
    : "policy_notice"
  const metricName = sourceKind === "industry_report_release"
    ? normalizeReleaseTitle(title) || "industry_report"
    : input.eventSubType === "industry_data"
    ? normalizeReleaseTitle(title) || "industry_data"
    : normalizeReleaseTitle(title) || "industrial_policy"

  const payload = {
    sourceId: input.sourceId,
    cadence,
    periodKey,
    summary,
    raw,
    releaseTitle: stripHtml(title),
  }

  const fact: EventFactRow = {
    fact_id: `fact_${md5(`${input.eventId}|${input.rawId}|${factType}|${metricName}`)}`,
    event_id: input.eventId,
    evidence_id: input.rawId,
    fact_type: factType,
    metric_name: metricName,
    value: null,
    unit: cadence,
    previous_value: null,
    delta: null,
    direction,
    effective_at: input.raw.published_at,
    entity_id: entityId,
    confidence: sourceKind === "industry_report_release"
      ? 0.8
      : input.eventSubType === "industry_data" ? 0.82 : 0.76,
    payload_json: JSON.stringify(payload),
  }

  return [fact]
}
