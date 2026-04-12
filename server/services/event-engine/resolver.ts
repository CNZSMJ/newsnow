import type { EventProfile } from "@shared/event-profile"
import { type IndustryTag, allIndustryTags } from "@shared/industry"
import type { EventImportance, EventSubType, EventType, SourceID } from "@shared/types"
import sources from "@shared/sources"
import { getSourceEventProfile } from "#/services/event-engine/profiles"
import { extractCompanyHints, getPrimaryEntityName, inferIndustryTagsFromText, isMediaInterpretationText } from "#/services/event-engine/text"

function classifyEventSubType(eventType: EventType, title: string, summary?: string | null): EventSubType {
  const text = `${title} ${summary ?? ""}`.toLowerCase()
  const hasAny = (...keywords: string[]) => keywords.some(keyword => text.includes(keyword.toLowerCase()))

  if (eventType === "announcement") {
    if (hasAny("停牌", "暫停買賣", "短暫停牌", "复牌", "復牌", "復牌進度", "终止上市", "摘牌")) return "listing_status"
    if (hasAny("限售股上市流通", "解除限售", "解禁", "上市流通")) return "shareholding_change"
    if (hasAny("首次公开发行", "ipo", "招股说明书", "上市保荐书", "发行公告", "战略配售", "上市申请")) return "financing"
    if (hasAny("年度报告", "年报", "半年报", "季报", "一季度报告", "三季度报告", "中期报告", "业绩预告", "业绩快报")) return "earnings"
    if (hasAny("定增", "非公开发行", "向特定对象发行", "可转债", "配股", "募资", "融资", "发行股份", "募集说明书")) return "financing"
    if (hasAny("中标", "合同", "订单", "框架协议", "签署")) return "contract"
    if (hasAny("减持", "增持", "股份变动", "持股变动", "股东")) return "shareholding_change"
    if (hasAny("聘任", "辞任", "董事会", "监事会", "高级管理人员", "总经理", "董事长")) return "management_change"
    if (hasAny("问询函", "监管函", "纪律处分", "立案", "警示函", "处罚")) return "regulation"
    if (hasAny("回购")) return "buyback"
    if (hasAny("分红", "派息", "利润分配")) return "dividend"
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

function inferMediaFastFeedClassification(title: string, summary?: string | null) {
  const text = `${title} ${summary ?? ""}`.toLowerCase()
  const hasAny = (...keywords: string[]) => keywords.some(keyword => text.includes(keyword.toLowerCase()))

  if (hasAny("shibor", "dr007", "fdr007", "fr007", "lpr")) {
    return {
      eventType: "macro" as const,
      eventSubType: "rate_fixing" as const,
    }
  }

  if (hasAny("逆回购", "mlf", "降准", "降息", "存款准备金率", "货币政策", "央行")) {
    return {
      eventType: "policy" as const,
      eventSubType: "monetary_policy" as const,
    }
  }

  if (hasAny("cpi", "ppi", "pmi", "gdp", "社融", "m2", "出口", "进口", "非农")) {
    return {
      eventType: "macro" as const,
      eventSubType: "macro_data" as const,
    }
  }

  if (isMediaInterpretationText(title, summary)) {
    return {
      eventType: "news" as const,
      eventSubType: "analysis_signal" as const,
    }
  }

  const announcementSubType = classifyEventSubType("announcement", title, summary)
  if (announcementSubType !== "other") {
    return {
      eventType: "announcement" as const,
      eventSubType: announcementSubType,
    }
  }

  if (hasAny("涨超", "涨逾", "跌超", "跌逾", "拉升", "跳水", "走高", "走低", "沪指", "深成指", "创业板指", "恒指", "恒生科技", "a股", "港股")) {
    return {
      eventType: "market_move" as const,
      eventSubType: "other" as const,
    }
  }

  return undefined
}

function getImportance(eventType: EventType, eventSubType: EventSubType): EventImportance {
  if (["earnings", "regulation", "monetary_policy", "trade_policy", "macro_data", "rate_fixing"].includes(eventSubType)) {
    return "high"
  }
  if (eventType === "announcement") return "high"
  if (eventType === "policy" || eventType === "macro") return "high"
  return "medium"
}

function getSourceTags(sourceId: SourceID) {
  const tags = sources[sourceId]?.tags ?? []
  return [...new Set(tags)] as IndustryTag[]
}

function shouldSuppressBroadSourceTags(profile: EventProfile | undefined, sourceTags: readonly IndustryTag[]) {
  if (!sourceTags.length) return false
  if (sourceTags.length >= allIndustryTags.length) return true
  return profile?.sourceKind === "official_macro_release" || profile?.sourceKind === "official_policy_notice"
}

function resolveTopicTags(sourceId: SourceID, title: string, summary?: string | null, profile?: EventProfile) {
  const sourceTags = getSourceTags(sourceId)
  const inferredTags = inferIndustryTagsFromText(title, summary)

  if (inferredTags.length) {
    if (!sourceTags.length) return inferredTags
    const narrowed = inferredTags.filter(tag => sourceTags.includes(tag))
    return narrowed.length ? narrowed : inferredTags
  }

  if (shouldSuppressBroadSourceTags(profile, sourceTags)) {
    return []
  }

  return sourceTags
}

function resolvePrimaryEntityName(_sourceId: SourceID, title: string, summary?: string | null, _profile?: EventProfile) {
  const primary = getPrimaryEntityName(title)
  if (primary) return primary
  const summaryHints = summary ? extractCompanyHints(summary) : []
  if (summaryHints.length) return summaryHints[0]
  const titleHints = extractCompanyHints(title)
  if (titleHints.length) return titleHints[0]
  return undefined
}

export interface ResolvedEventClassification {
  eventType: EventType
  eventSubType: EventSubType
  importance: EventImportance
  topicTags: IndustryTag[]
  primaryEntityName?: string
  profile?: EventProfile
}

export function resolveEventClassification(sourceId: SourceID, title: string, summary?: string | null): ResolvedEventClassification {
  const profile = getSourceEventProfile(sourceId)
  const inferredMediaClassification = profile?.sourceKind === "media_fast_feed"
    ? inferMediaFastFeedClassification(title, summary)
    : undefined
  const eventType = inferredMediaClassification?.eventType
    ?? (profile?.defaultEventType as EventType | undefined)
    ?? (sources[sourceId]?.column === "industry" ? "industry" : "news")
  const classifiedSubType = classifyEventSubType(eventType, title, summary)
  const eventSubType = inferredMediaClassification?.eventSubType
    ?? (classifiedSubType !== "other" ? classifiedSubType : profile?.defaultEventSubType as EventSubType | undefined)
    ?? "other"

  return {
    eventType,
    eventSubType,
    importance: getImportance(eventType, eventSubType),
    topicTags: resolveTopicTags(sourceId, title, summary, profile),
    primaryEntityName: resolvePrimaryEntityName(sourceId, title, summary, profile),
    profile,
  }
}
