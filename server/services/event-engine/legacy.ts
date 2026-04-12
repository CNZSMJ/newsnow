// This file intentionally preserves a frozen approximation of the pre-upgrade
// classification logic so shadow comparisons can measure drift against a stable
// baseline. Update only when the baseline itself is deliberately redefined.
import type { EventImportance, EventSubType, EventType, SourceID } from "@shared/types"
import sources from "@shared/sources"
import { normalizeTitle } from "#/services/event-engine/text"

function classifyLegacySubType(eventType: EventType, title: string, summary?: string | null): EventSubType {
  const text = `${title} ${summary ?? ""}`.toLowerCase()
  const hasAny = (...keywords: string[]) => keywords.some(keyword => text.includes(keyword.toLowerCase()))

  if (eventType === "announcement") {
    if (hasAny("停牌", "暫停買賣", "复牌", "復牌", "终止上市", "摘牌", "上市")) return "listing_status"
    if (hasAny("年度报告", "年报", "半年报", "季报", "业绩预告", "业绩快报")) return "earnings"
    if (hasAny("定增", "非公开发行", "可转债", "配股", "募资", "融资")) return "financing"
    if (hasAny("中标", "合同", "订单", "框架协议", "签署")) return "contract"
    if (hasAny("减持", "增持", "股份变动", "持股变动", "股东")) return "shareholding_change"
    if (hasAny("聘任", "辞任", "董事会", "监事会", "高级管理人员", "总经理", "董事长")) return "management_change"
    if (hasAny("问询函", "监管函", "纪律处分", "立案", "警示函", "处罚")) return "regulation"
  }

  if (eventType === "policy") {
    if (hasAny("lpr", "降准", "降息", "mlf", "逆回购", "存款准备金率", "货币政策")) return "monetary_policy"
    if (hasAny("关税", "出口管制", "反倾销", "贸易", "进出口", "外贸")) return "trade_policy"
    if (hasAny("规划", "行动方案", "实施方案", "意见", "产业政策", "补贴")) return "industrial_policy"
  }

  if (eventType === "macro" && hasAny("cpi", "ppi", "pmi", "gdp", "社融", "m2", "出口", "进口")) {
    return "macro_data"
  }

  if (eventType === "industry" && hasAny("装机", "产量", "销量", "库存", "开工率", "出货量", "统计", "数据")) {
    return "industry_data"
  }

  return "other"
}

function getLegacyEventType(sourceId: SourceID): EventType {
  const [mainId] = sourceId.split("-")
  if (["cninfo", "sse", "hkexnews"].includes(mainId)) return "announcement"
  if (["pbc", "safe", "csrc", "gov", "sasac", "mof", "mofcom"].includes(mainId)) return "policy"
  if (["stats", "chinamoney"].includes(mainId)) return "macro"
  if (sources[sourceId]?.column === "industry") return "industry"
  return "news"
}

function getLegacyImportance(eventType: EventType, eventSubType: EventSubType): EventImportance {
  if (["earnings", "regulation", "monetary_policy", "trade_policy", "macro_data"].includes(eventSubType)) {
    return "high"
  }
  if (eventType === "announcement" || eventType === "policy" || eventType === "macro") return "high"
  return "medium"
}

export function resolveLegacyEventClassification(sourceId: SourceID, title: string, summary?: string | null) {
  const normalizedTitle = normalizeTitle(title)
  const eventType = getLegacyEventType(sourceId)
  const eventSubType = classifyLegacySubType(eventType, normalizedTitle, summary)
  return {
    eventType,
    eventSubType,
    importance: getLegacyImportance(eventType, eventSubType),
  }
}
