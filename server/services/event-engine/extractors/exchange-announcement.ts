import md5 from "md5"
import type { EventSubType, NewsItem, SourceID } from "@shared/types"
import type { EventFactRow, RawItemRow } from "#/types"

type DisclosureActionKind = "financing" | "buyback" | "dividend" | "shareholding_change" | null
type DisclosureAnnouncementStage = "pre_disclosure" | "proposal" | "progress" | "implementation" | "completion" | null
type DisclosureFinancingPath = "ipo" | "refinancing" | "convertible_bond" | "rights_issue" | null
type DisclosureOwnershipDirection = "increase" | "decrease" | "neutral" | null

function readString(raw: Record<string, unknown>, key: string) {
  const value = raw[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readSecurityCode(raw: Record<string, unknown>) {
  const direct = readString(raw, "secCode") ?? readString(raw, "securityCode")
  if (direct) return direct

  const stockEntries = raw.stock
  if (Array.isArray(stockEntries)) {
    for (const entry of stockEntries) {
      if (!entry || typeof entry !== "object") continue
      const stockCode = readString(entry as Record<string, unknown>, "sc") ?? readString(entry as Record<string, unknown>, "code")
      if (stockCode) return stockCode
    }
  }

  return null
}

function readSecurityName(raw: Record<string, unknown>, title: string) {
  const direct = readString(raw, "secName") ?? readString(raw, "securityName") ?? readString(raw, "sn")
  if (direct) return direct

  const stockEntries = raw.stock
  if (Array.isArray(stockEntries)) {
    for (const entry of stockEntries) {
      if (!entry || typeof entry !== "object") continue
      const stockName = readString(entry as Record<string, unknown>, "sn") ?? readString(entry as Record<string, unknown>, "name")
      if (stockName) return stockName
    }
  }

  const prefixMatch = title.match(/^([^：:]+)[：:]/)
  if (prefixMatch?.[1]) return prefixMatch[1].trim()

  return null
}

function inferMarket(sourceId: SourceID, securityCode: string | null) {
  if (sourceId.startsWith("hkexnews") || sourceId.startsWith("cninfo-hk")) return "HK"
  if (sourceId === "cninfo" || sourceId.startsWith("cninfo-s") || sourceId.startsWith("sse")) return "A"
  if (securityCode) {
    if (/^\d{6}$/.test(securityCode)) return "A"
    if (/^\d{5}$/.test(securityCode)) return "HK"
  }
  return null
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some(keyword => text.includes(keyword))
}

function inferAnnouncementStage(eventSubType: EventSubType, title: string, announcementTypeName: string | null): DisclosureAnnouncementStage {
  const text = `${title} ${announcementTypeName ?? ""}`
  if (hasAny(text, ["预披露", "预告"])) return "pre_disclosure"
  if (eventSubType === "financing" && hasAny(text, ["募集说明书", "上市申请", "发行公告"])) return "pre_disclosure"
  if (eventSubType === "shareholding_change" && hasAny(text, ["预案", "预披露", "预告"])) return "pre_disclosure"
  if (hasAny(text, ["受理", "审核", "注册", "核准", "问询", "反馈", "回复"])) return "progress"
  if (hasAny(text, ["进展", "进度", "更新"])) return "progress"
  if (hasAny(text, ["实施", "完成", "结果", "已实施", "已完成", "生效"])) return "implementation"
  if (hasAny(text, ["终止", "撤回"])) return "completion"
  if (hasAny(text, ["方案", "预案", "计划"])) return "proposal"
  return null
}

function inferFinancingPath(title: string, announcementTypeName: string | null): DisclosureFinancingPath {
  const text = `${title} ${announcementTypeName ?? ""}`
  if (hasAny(text, ["首次公开发行", "IPO", "招股说明书", "上市保荐书", "上市申请"])) return "ipo"
  if (hasAny(text, ["可转债"])) return "convertible_bond"
  if (hasAny(text, ["配股"])) return "rights_issue"
  if (hasAny(text, ["定增", "非公开发行", "向特定对象发行", "再融资", "募集说明书", "发行股份"])) return "refinancing"
  return null
}

function inferOwnershipDirection(title: string, announcementTypeName: string | null): DisclosureOwnershipDirection {
  const text = `${title} ${announcementTypeName ?? ""}`
  if (hasAny(text, ["减持", "减持计划", "减持预披露"])) return "decrease"
  if (hasAny(text, ["增持", "增持计划"])) return "increase"
  if (hasAny(text, ["解除限售", "解禁", "上市流通"])) return "neutral"
  return null
}

function inferActionKind(eventSubType: EventSubType): DisclosureActionKind {
  if (eventSubType === "financing" || eventSubType === "buyback" || eventSubType === "dividend" || eventSubType === "shareholding_change") {
    return eventSubType
  }
  return null
}

function isFormalDisclosure(title: string, announcementTypeName: string | null, eventSubType: EventSubType) {
  if (announcementTypeName) return true
  if (inferActionKind(eventSubType)) return true
  return /公告|报告|预案|方案|说明书|通知|议案|进展|实施|结果|分红|回购|减持|增持|发行|募集/.test(title)
}

function buildNormalizedPayload(input: {
  payload: NewsItem
  sourceId: SourceID
  eventSubType: EventSubType
}) {
  const raw = (input.payload.extra?.raw ?? {}) as Record<string, unknown>
  const announcementTitle = readString(raw, "announcementTitle") ?? input.payload.title
  const announcementTypeName = readString(raw, "announcementTypeName")
  const securityCode = readSecurityCode(raw)
  const securityName = readSecurityName(raw, announcementTitle)
  const market = inferMarket(input.sourceId, securityCode)
  const actionKind = inferActionKind(input.eventSubType)
  const announcementStage = actionKind ? inferAnnouncementStage(input.eventSubType, announcementTitle, announcementTypeName) : null
  const financingPath = input.eventSubType === "financing"
    ? inferFinancingPath(announcementTitle, announcementTypeName)
    : null
  const ownershipDirection = input.eventSubType === "shareholding_change"
    ? inferOwnershipDirection(announcementTitle, announcementTypeName)
    : null

  return {
    announcementTitle,
    announcementTypeName,
    securityCode,
    securityName,
    market,
    actionKind,
    announcementStage,
    financingPath,
    ownershipDirection,
    isFormalDisclosure: isFormalDisclosure(announcementTitle, announcementTypeName, input.eventSubType),
    raw,
  }
}

export function extractExchangeAnnouncementFacts(input: {
  eventId: string
  rawId: string
  sourceId: SourceID
  raw: RawItemRow
  payload: NewsItem
  eventSubType: EventSubType
}) {
  const normalizedPayload = buildNormalizedPayload({
    payload: input.payload,
    sourceId: input.sourceId,
    eventSubType: input.eventSubType,
  })
  const metricName = input.eventSubType === "other"
    ? String(normalizedPayload.announcementTypeName ?? (normalizedPayload.raw.sTxt as string | undefined) ?? "announcement")
    : input.eventSubType
  const entityId = normalizedPayload.securityCode

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
    payload_json: JSON.stringify(normalizedPayload),
  }

  return [fact]
}
