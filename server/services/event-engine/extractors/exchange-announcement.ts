import md5 from "md5"
import type { EventSubType, NewsItem, SourceID } from "@shared/types"
import type { EventFactRow, RawItemRow } from "#/types"

export function extractExchangeAnnouncementFacts(input: {
  eventId: string
  rawId: string
  sourceId: SourceID
  raw: RawItemRow
  payload: NewsItem
  eventSubType: EventSubType
}) {
  const raw = (input.payload.extra?.raw ?? {}) as Record<string, unknown>
  const metricName = input.eventSubType === "other"
    ? String(raw.announcementTypeName ?? raw.sTxt ?? "announcement")
    : input.eventSubType
  const entityId = typeof raw.secCode === "string" ? raw.secCode : typeof raw.securityCode === "string" ? raw.securityCode : null

  const fact: EventFactRow = {
    fact_id: `fact_${md5(`${input.eventId}|${input.rawId}|exchange_announcement|${metricName}`)}`,
    event_id: input.eventId,
    evidence_id: input.rawId,
    fact_type: "exchange_announcement",
    metric_name: metricName,
    value: null,
    unit: null,
    previous_value: null,
    delta: null,
    direction: null,
    effective_at: input.raw.published_at,
    entity_id: entityId,
    confidence: 0.9,
    payload_json: JSON.stringify(raw),
  }

  return [fact]
}
