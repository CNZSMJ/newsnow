import md5 from "md5"
import type { NewsItem, SourceID } from "@shared/types"
import type { EventFactRow, RawItemRow } from "#/types"
import { isMediaInterpretationText } from "#/services/event-engine/text"

function detectDirection(text: string) {
  const normalized = text.toLowerCase()
  if (/涨超|涨逾|上涨|拉升|走高|飙升|反弹|上行|净投放|净流入/.test(normalized)) return "up"
  if (/跌超|跌逾|下跌|跳水|走低|回落|下行|净回笼|净流出/.test(normalized)) return "down"
  if (/持平|不变|稳定/.test(normalized)) return "flat"
  return null
}

function detectMagnitude(text: string) {
  const percentMatch = text.match(/([\d.]+)\s*%/)
  if (percentMatch) return { value: percentMatch[1], unit: "%" }

  const bpMatch = text.match(/([\d.]+)\s*(?:bp|个基点)/i)
  if (bpMatch) return { value: bpMatch[1], unit: "bp" }

  const amountMatch = text.match(/([\d,.]+)\s*亿元/)
  if (amountMatch) return { value: amountMatch[1].replace(/,/g, ""), unit: "CNY_100M" }

  return { value: null, unit: null }
}

function detectMarket(text: string) {
  const normalized = text.toLowerCase()
  if (/沪指|深成指|创业板指|科创50|a股/.test(normalized)) return "A"
  if (/恒指|恒生科技|港股|恒生指数/.test(normalized)) return "HK"
  if (/shibor|dr007|fdr007|fr007|国债|逆回购|mlf|资金面|利率债|同业存单/.test(normalized)) return "CN_rates"
  if (/cpi|ppi|pmi|gdp|社融|m2|出口|进口|非农|美联储|鲍威尔/.test(normalized)) return "CN_macro"
  return null
}

function detectMetricName(text: string) {
  const normalized = text.toLowerCase()
  if (/shibor|dr007|fdr007|fr007|lpr/.test(normalized)) return "macro_rate_signal"
  if (/逆回购|mlf|降准|降息|存款准备金率|货币政策/.test(normalized)) return "policy_signal"
  if (/沪指|深成指|创业板指|恒指|恒生科技|a股|港股/.test(normalized)) return "market_move_signal"
  if (isMediaInterpretationText(text)) return "analysis_signal"
  if (/回购|业绩|停牌|复牌|定增|分红|减持|增持/.test(normalized)) return "announcement_signal"
  return "media_fast_signal"
}

export function extractMediaFastFacts(input: {
  eventId: string
  rawId: string
  sourceId: SourceID
  raw: RawItemRow
  payload: NewsItem
}) {
  const raw = (input.payload.extra?.raw ?? {}) as Record<string, unknown>
  const text = [
    input.raw.title,
    input.payload.extra?.hover,
    input.payload.extra?.info,
    typeof raw.description === "string" ? raw.description : null,
  ].filter(Boolean).join(" ")

  const direction = detectDirection(text)
  const metricName = detectMetricName(text)
  const amountMagnitude = text.match(/([\d,.]+)\s*亿元/)
    ? { value: text.match(/([\d,.]+)\s*亿元/)?.[1]?.replace(/,/g, "") ?? null, unit: "CNY_100M" }
    : null
  const magnitude = metricName === "policy_signal" && amountMagnitude
    ? amountMagnitude
    : detectMagnitude(text)
  const market = detectMarket(text)

  const fact: EventFactRow = {
    fact_id: `fact_${md5(`${input.eventId}|${input.rawId}|media_fast|${metricName}`)}`,
    event_id: input.eventId,
    evidence_id: input.rawId,
    fact_type: "media_fast_signal",
    metric_name: metricName,
    value: magnitude.value,
    unit: magnitude.unit,
    previous_value: null,
    delta: null,
    direction,
    effective_at: input.raw.published_at,
    entity_id: null,
    confidence: direction || magnitude.value || market ? 0.72 : 0.45,
    payload_json: JSON.stringify({
      market,
      text,
      sourceId: input.sourceId,
      raw,
    }),
  }

  return [fact]
}
