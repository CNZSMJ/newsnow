import md5 from "md5"
import type { NewsItem, SourceID } from "@shared/types"
import type { EventFactRow, RawItemRow } from "#/types"

function extractAmount(text: string) {
  const match = text.match(/([\d,.]+)\s*亿元/)
  if (!match) return null
  const parsed = Number(match[1].replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function extractTenor(text: string) {
  const matches = [...text.matchAll(/(\d+)(天|个月|年)/g)]
  for (const match of matches) {
    const amount = Number(match[1])
    const unit = match[2]
    if (!Number.isFinite(amount)) continue
    if (unit === "年" && amount > 5) continue
    if (unit === "个月" && amount > 24) continue
    if (unit === "天" && amount > 365) continue
    return `${amount}${unit}`
  }
  return null
}

function extractRate(text: string) {
  const explicitMatch = text.match(/(?:利率(?:为|：)?|中标利率(?:为|：)?|操作利率(?:为|：)?)\s*([\d.]+)%/)
  if (explicitMatch) {
    const parsed = Number(explicitMatch[1])
    return Number.isFinite(parsed) ? parsed : null
  }

  const tableMatch = text.match(/(?:\d+天|\d+个月|\d+年)\s*([\d.]+)%\s*[\d,.]+\s*亿元/)
  if (!tableMatch) return null
  const parsed = Number(tableMatch[1])
  return Number.isFinite(parsed) ? parsed : null
}

function getNetDirection(text: string) {
  if (text.includes("净投放")) return "up"
  if (text.includes("净回笼")) return "down"
  return null
}

function getOperationType(title: string, sourceId: SourceID) {
  if (title.includes("逆回购")) return "reverse_repo"
  if (title.toUpperCase().includes("MLF") || sourceId === "pbc-mlf") return "mlf"
  return "central_bank_operation"
}

export function extractCentralBankOperationFacts(input: {
  eventId: string
  rawId: string
  sourceId: SourceID
  raw: RawItemRow
  payload: NewsItem
}) {
  const raw = (input.payload.extra?.raw ?? {}) as Record<string, unknown>
  const contextText = [
    input.raw.title,
    input.payload.extra?.hover,
    typeof raw.description === "string" ? raw.description : null,
  ].filter(Boolean).join(" ")
  const tenor = extractTenor(contextText)
  const operationType = getOperationType(contextText, input.sourceId)
  const amount = extractAmount(contextText)
  const rate = extractRate(contextText)
  const netDirection = getNetDirection(contextText)

  const fact: EventFactRow = {
    fact_id: `fact_${md5(`${input.eventId}|${input.rawId}|central_bank_operation|${operationType}`)}`,
    event_id: input.eventId,
    evidence_id: input.rawId,
    fact_type: "central_bank_operation",
    metric_name: operationType,
    value: amount === null ? null : String(amount),
    unit: amount === null ? null : "CNY_100M",
    previous_value: null,
    delta: null,
    direction: netDirection,
    effective_at: input.raw.published_at,
    entity_id: null,
    confidence: amount === null && rate === null ? 0.7 : 0.9,
    payload_json: JSON.stringify({
      ...raw,
      amount,
      rate,
      netDirection,
      tenor,
      title: input.raw.title,
      contextText,
    }),
  }

  return [fact]
}
