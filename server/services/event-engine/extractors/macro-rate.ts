import md5 from "md5"
import type { NewsItem, SourceID } from "@shared/types"
import type { EventFactRow, RawItemRow } from "#/types"

function toStringValue(value: unknown) {
  if (value === null || value === undefined) return null
  return String(value)
}

function toNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim()
    if (!normalized) return null
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function extractMacroRateFacts(input: {
  eventId: string
  rawId: string
  sourceId: SourceID
  raw: RawItemRow
  payload: NewsItem
}) {
  const raw = (input.payload.extra?.raw ?? {}) as Record<string, unknown>
  const metricName = toStringValue(raw.termCode ?? raw.productCode) ?? input.payload.title.split(" ")[0]
  const valueNumber = toNumberValue(raw.shibor ?? raw.value ?? input.payload.title.match(/([\d.]+)%/)?.[1])
  const deltaNumber = toNumberValue(input.payload.extra?.diff ?? raw.shibIdUpDownNum)
  const value = valueNumber === null ? null : String(valueNumber)
  const delta = deltaNumber === null ? null : String(deltaNumber)
  const previousValue = valueNumber !== null && deltaNumber !== null
    ? String(Number((valueNumber - deltaNumber / 100).toFixed(4)))
    : null

  const fact: EventFactRow = {
    fact_id: `fact_${md5(`${input.eventId}|${input.rawId}|macro_rate|${metricName}`)}`,
    event_id: input.eventId,
    evidence_id: input.rawId,
    fact_type: "macro_rate",
    metric_name: metricName,
    value,
    unit: value ? "%" : null,
    previous_value: previousValue,
    delta,
    direction: delta ? (Number(delta) > 0 ? "up" : Number(delta) < 0 ? "down" : "flat") : null,
    effective_at: input.raw.published_at,
    entity_id: null,
    confidence: 0.95,
    payload_json: JSON.stringify(raw),
  }

  return [fact]
}
