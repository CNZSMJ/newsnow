import type {
  EventDetail,
  EventEntityLink,
  EventEvidence,
  EventFact,
  EventLifecycleState,
  EventRecord,
  EventTimelineEntry,
  InvestmentActionBucket,
  InvestmentEntityRef,
  InvestmentEventBrief,
  InvestmentEventDetail,
  InvestmentEventEvidence,
  InvestmentEventFact,
  InvestmentEventFamily,
  InvestmentScoreInsight,
  InvestmentTimelineEntry,
} from "@shared/types"
import type { DirectionalView, EventSourceKind } from "@shared/event-profile"
import { industries } from "@shared/industry"
import sources from "@shared/sources"
import { isCodeLikeEntityName, normalizeSecurityCode, normalizeSecurityIdentifier } from "#/services/event-engine/entity-normalization"
import { isBroadMarketDescriptor, normalizeTitle } from "#/services/event-engine/text"
import { deriveWatchTargetCandidates } from "#/services/event-engine/watch-target-candidates"

export function getInvestmentEventFamily(event: Pick<EventRecord, "eventType" | "eventSubType" | "sourceKind">): InvestmentEventFamily {
  if (event.sourceKind === "media_fast_feed" && event.eventType === "policy")
    return "policy_signal"
  if (event.eventSubType === "analysis_signal")
    return "media_interpretation"
  if (event.sourceKind === "media_fast_feed" && event.eventType === "announcement")
    return "disclosure_signal"
  if (event.sourceKind === "industry_report_release")
    return "industry_report"
  if (event.eventSubType === "rate_fixing" || event.eventSubType === "monetary_policy")
    return "rates_liquidity"
  if (event.eventSubType === "macro_data")
    return "macro_print"
  if (event.eventType === "policy" || event.eventSubType === "trade_policy" || event.eventSubType === "industrial_policy" || event.eventSubType === "regulation")
    return "policy"
  if (event.eventSubType === "earnings")
    return "earnings"
  if (event.eventSubType === "financing")
    return "financing"
  if (event.eventSubType === "listing_status")
    return "trading_status"
  if (event.eventType === "market_move")
    return "market_move"
  if (event.eventSubType === "industry_data")
    return "industry_data"
  if (event.eventSubType === "industry_report")
    return "industry_report"
  if (event.eventSubType === "industry_news" || event.sourceKind === "industry_news_feed")
    return "industry_news"
  if (event.sourceKind === "media_fast_feed" && (event.eventSubType === "contract" || event.eventSubType === "other"))
    return "rumor_clarification"
  if (["buyback", "dividend", "shareholding_change", "management_change", "contract"].includes(event.eventSubType))
    return "corporate_action"
  if (event.sourceKind === "exchange_disclosure" && event.eventType === "announcement")
    return "disclosure_signal"
  return "general_news"
}

export function matchesInvestmentEventFamily(
  event: Pick<EventRecord, "eventType" | "eventSubType" | "sourceKind"> | Pick<InvestmentEventBrief, "eventFamily">,
  family?: InvestmentEventFamily,
) {
  if (!family) return true
  if ("eventFamily" in event) return event.eventFamily === family
  return getInvestmentEventFamily(event) === family
}

function mapEntityType(entityType: EventEntityLink["entityType"]): InvestmentEntityRef["entityType"] {
  switch (entityType) {
    case "stock":
      return "security"
    case "index":
      return "market"
    case "industry":
      return "industry"
    case "company":
      return "issuer"
    case "institution":
      return "institution"
    case "topic":
      return "topic"
    default:
      return "topic"
  }
}

function mapEntityTypeLabel(entityType: InvestmentEntityRef["entityType"]) {
  switch (entityType) {
    case "security":
      return "交易标的"
    case "issuer":
      return "公司主体"
    case "market":
      return "影响市场"
    case "industry":
      return "产业赛道"
    case "institution":
      return "发布机构"
    default:
      return "主题标签"
  }
}

function inferPrimaryEntityType(event: Pick<EventRecord, "eventType" | "sourceKind">, label: string): InvestmentEntityRef["entityType"] {
  const institutionPattern = /(?:[部委局署会院行司厅]|中心|协会|信通院|中汽协|药审中心|中国货币网|人民银行|央行)$/
  if (institutionPattern.test(label)) return "institution"
  const industryMatch = Object.entries(industries).find(([, name]) => name === label)
  if (industryMatch) return "industry"
  if (event.eventType === "policy" || event.sourceKind === "official_policy_notice" || event.sourceKind === "official_macro_release")
    return "institution"
  return "issuer"
}

function inferMarketFromCode(code?: string) {
  if (!code) return undefined
  const normalized = code.toLowerCase()
  if (normalized.startsWith("sh") || normalized.startsWith("sz") || normalized.startsWith("bj"))
    return "A"
  if (normalized.startsWith("hk"))
    return "HK"
  if (normalized.startsWith("us:") || normalized.endsWith(".us"))
    return "US"
  return undefined
}

function normalizeComparableTitleToken(value?: string) {
  return value
    ?.replace(/\s+/g, "")
    .replace(/[：:【】\[\]（）()《》<>"'`、，,._-]/g, "")
    .toLowerCase()
}

function formatInvestmentDisplayTitle(title: string, options?: {
  sourceKind?: EventSourceKind
  primaryEntityName?: string
}) {
  const normalized = normalizeTitle(title)
  const match = normalized.match(/^([^：:]{2,40})[：:]\s*(.+)$/)
  const prefix = match?.[1]?.trim() || options?.primaryEntityName?.trim()
  const suffix = (match?.[2] ?? normalized).trim()
  if (!suffix.includes("_")) return normalized

  const tokens = suffix.split("_").map(token => token.trim()).filter(Boolean)
  if (tokens.length < 2) return normalized

  const prefixKey = normalizeComparableTitleToken(prefix)
  const primaryKey = normalizeComparableTitleToken(options?.primaryEntityName)
  let removedNoise = false
  const filteredTokens = tokens.filter((token) => {
    const comparable = normalizeComparableTitleToken(token)
    if (!comparable) {
      removedNoise = true
      return false
    }
    if (/^(?:sh|sz|bj)?\d{6}$/i.test(token) || /^\d{4}-\d{2}-\d{2}$/.test(token)) {
      removedNoise = true
      return false
    }
    if ((prefixKey && comparable === prefixKey) || (primaryKey && comparable === primaryKey)) {
      removedNoise = true
      return false
    }
    return true
  })

  if (!removedNoise && options?.sourceKind !== "exchange_disclosure") return normalized

  const cleanedSuffix = (filteredTokens.length ? filteredTokens : tokens).join("").replace(/\s+/g, "").trim()
  if (!cleanedSuffix) return normalized
  if (prefix) return `${prefix}：${cleanedSuffix}`
  return cleanedSuffix
}

function shouldSuppressDisplayPrimaryEntity(
  event: Pick<EventRecord, "eventType" | "sourceKind" | "title">,
  primaryEntityName: string,
) {
  if (event.sourceKind !== "official_policy_notice" && event.sourceKind !== "official_macro_release") {
    return false
  }
  if (!/(问题|通知|公告|办法|规定|制度|解释|细则|方案|意见|事宜|文件)$/.test(primaryEntityName)) {
    return false
  }
  const normalizedTitle = normalizeTitle(event.title)
  return normalizedTitle.includes(`关于${primaryEntityName}`)
    || normalizedTitle.includes(`《${primaryEntityName}》`)
    || normalizedTitle.includes(`${primaryEntityName}的`)
}

function extractInstitutionLabelFromTitle(title: string) {
  const normalizedTitle = normalizeTitle(title)
  const matched = normalizedTitle.match(/^([\u4e00-\u9fa5A-Za-z*“”"《》（）()\s]{2,48}?)(?:发布|印发|关于|令〔?\d{4}〕?第?\d+号?)/)
  const prefix = matched?.[1]?.replace(/\s+/g, " ").trim()
  if (!prefix) return undefined
  const parts = prefix.split(/\s+/).filter(Boolean)
  const institutionParts = parts.filter(part => /(?:部|委|局|署|会|院|行|厅|办|法院|检察院|税务总局|人民银行|外汇管理局|海关总署|“两高”|两高)$/.test(part))
  if (institutionParts.length) return institutionParts.join(" / ")
  return prefix
}

function getDisplayPrimaryEntityName(
  event: Pick<EventRecord, "eventType" | "primaryEntityName" | "sourceKind" | "title">,
  publisherInstitution?: string,
) {
  const primaryEntityName = event.primaryEntityName?.trim()
  if (!primaryEntityName) return undefined
  if (event.eventType === "market_move" && event.sourceKind === "media_fast_feed" && isBroadMarketDescriptor(primaryEntityName)) {
    return undefined
  }
  if (shouldSuppressDisplayPrimaryEntity(event, primaryEntityName)) {
    return extractInstitutionLabelFromTitle(event.title) ?? publisherInstitution?.trim()
  }
  return primaryEntityName
}

function normalizeEntityText(value?: string) {
  return value?.trim().toLowerCase()
}

function isCodeLikeLabel(label: string) {
  return isCodeLikeEntityName(label)
}

function toInvestmentEntity(entity: EventEntityLink): InvestmentEntityRef {
  const entityId = entity.fullCode || entity.code || entity.entityName
  const code = entity.code || normalizeSecurityCode(entity.fullCode) || undefined
  const entityType = mapEntityType(entity.entityType)
  const label = industries[entity.entityName as keyof typeof industries] ?? entity.entityName
  return {
    entityId,
    label,
    entityType,
    entityTypeLabel: mapEntityTypeLabel(entityType),
    code,
    market: inferMarketFromCode(entity.fullCode || entity.code || entityId),
  }
}

function dedupeEntities(entities: InvestmentEntityRef[]) {
  const seen = new Set<string>()
  return entities.filter((entity) => {
    const key = `${entity.entityType}|${entity.entityId}|${entity.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getEntitySelectionScore(entity: InvestmentEntityRef) {
  const priority: Record<InvestmentEntityRef["entityType"], number> = {
    security: 6,
    issuer: 5,
    industry: 4,
    market: 3,
    institution: 2,
    topic: 1,
  }

  let score = priority[entity.entityType] * 100
  if (!isCodeLikeLabel(entity.label)) score += 20
  if (entity.market) score += 10
  if (normalizeSecurityCode(entity.entityId) && entity.entityId.length > 6) score += 5
  if (entity.code) score += 2
  return score
}

function isPreferredEntity(candidate: InvestmentEntityRef, current: InvestmentEntityRef) {
  const candidateScore = getEntitySelectionScore(candidate)
  const currentScore = getEntitySelectionScore(current)
  if (candidateScore !== currentScore) return candidateScore > currentScore
  if (candidate.label.length !== current.label.length) return candidate.label.length > current.label.length
  return candidate.entityId.length > current.entityId.length
}

function getEntityAliasKey(entity: InvestmentEntityRef) {
  if (entity.entityType === "security") {
    const normalizedIdentifier = normalizeSecurityIdentifier(entity.entityId)
      ?? normalizeSecurityIdentifier(entity.code)
      ?? normalizeSecurityIdentifier(entity.label)
    if (normalizedIdentifier) return `${entity.entityType}|${normalizedIdentifier}`
  }

  return `${entity.entityType}|label:${normalizeEntityText(entity.label) ?? entity.entityId.toLowerCase()}`
}

function collapseDisplayEntities(entities: InvestmentEntityRef[]) {
  const bestByAlias = new Map<string, InvestmentEntityRef>()
  for (const entity of entities) {
    const aliasKey = getEntityAliasKey(entity)
    const existing = bestByAlias.get(aliasKey)
    if (!existing || isPreferredEntity(entity, existing)) {
      bestByAlias.set(aliasKey, entity)
    }
  }

  const bestByLabel = new Map<string, InvestmentEntityRef>()
  for (const entity of bestByAlias.values()) {
    const labelKey = normalizeEntityText(entity.label) ?? entity.entityId.toLowerCase()
    const existing = bestByLabel.get(labelKey)
    if (!existing || isPreferredEntity(entity, existing)) {
      bestByLabel.set(labelKey, entity)
    }
  }

  return Array.from(bestByLabel.values())
}

function shouldSuppressDisplayEntityLink(
  event: Pick<EventDetail, "eventType" | "sourceKind">,
  entity: EventEntityLink,
) {
  return event.eventType === "market_move"
    && event.sourceKind === "media_fast_feed"
    && entity.entityType === "company"
    && isBroadMarketDescriptor(entity.entityName)
}

function collectEntityLookupKeys(entity: InvestmentEntityRef) {
  const keys = new Set<string>([entity.entityId])
  if (entity.code) keys.add(entity.code)
  const normalizedIdentifier = normalizeSecurityIdentifier(entity.entityId)
    ?? normalizeSecurityIdentifier(entity.code)
  if (normalizedIdentifier) keys.add(normalizedIdentifier)
  const normalizedCode = normalizeSecurityCode(entity.code) ?? normalizeSecurityCode(entity.entityId)
  if (normalizedCode) keys.add(normalizedCode)
  return Array.from(keys)
}

function getEntityTitleRelevanceScore(entity: InvestmentEntityRef, title: string) {
  const normalizedTitle = normalizeComparableTitleToken(title) ?? ""
  const normalizedLabel = normalizeComparableTitleToken(entity.label) ?? ""
  let score = 0

  if (normalizedLabel && normalizedTitle.includes(normalizedLabel)) score += 300
  if (entity.code && title.toLowerCase().includes(entity.code.toLowerCase())) score += 220
  if (entity.entityType === "security") score += 80
  if (entity.entityType === "issuer") score += 40

  return score
}

function orderProjectedEntities(entities: InvestmentEntityRef[], title: string) {
  return [...entities].sort((left, right) => {
    const leftScore = getEntityTitleRelevanceScore(left, title)
    const rightScore = getEntityTitleRelevanceScore(right, title)
    if (leftScore !== rightScore) return rightScore - leftScore
    if (isPreferredEntity(right, left)) return 1
    if (isPreferredEntity(left, right)) return -1
    return left.label.localeCompare(right.label, "zh-Hans-CN")
  })
}

export function formatAffectedMarketLabel(value: string) {
  switch (value) {
    case "A":
      return "A股"
    case "HK":
      return "港股"
    case "CN_rates":
      return "中国资金面"
    case "CN_macro":
      return "中国宏观"
    case "global_macro":
      return "全球宏观"
    default:
      return value
  }
}

export function getInvestmentEventFamilyLabel(value: InvestmentEventFamily) {
  switch (value) {
    case "rates_liquidity": return "资金与利率"
    case "macro_print": return "宏观数据"
    case "policy": return "政策"
    case "policy_signal": return "政策线索"
    case "media_interpretation": return "媒体解读"
    case "earnings": return "业绩"
    case "financing": return "融资"
    case "corporate_action": return "公司动作"
    case "disclosure_signal": return "公告线索"
    case "trading_status": return "交易状态"
    case "industry_data": return "产业数据"
    case "industry_report": return "行业报告"
    case "industry_news": return "行业动态"
    case "rumor_clarification": return "传闻澄清"
    case "market_move": return "盘口异动"
    default: return "一般资讯"
  }
}

export function getInvestmentActionLabel(value: InvestmentActionBucket) {
  switch (value) {
    case "actionable": return "优先处理"
    case "watch": return "重点观察"
    default: return "降噪处理"
  }
}

export function getDirectionalViewLabel(value: DirectionalView) {
  switch (value) {
    case "positive": return "偏正向"
    case "negative": return "偏负向"
    case "neutral": return "中性"
    case "mixed": return "混合"
    default: return "方向待定"
  }
}

export function getTradableNowLabel(value: InvestmentEventBrief["tradableNow"]) {
  switch (value) {
    case "yes": return "可交易"
    case "watch": return "先观察"
    default: return "暂不交易"
  }
}

function deriveActionReason(_event: EventRecord, eventFamily: InvestmentEventFamily, actionBucket: InvestmentActionBucket, whatToWatchNext: string[]) {
  if (actionBucket === "actionable") {
    if (eventFamily === "rates_liquidity")
      return "高权威资金/利率信号已经落地，短线对资金面和利率资产更有直接交易意义。"
    if (eventFamily === "policy")
      return "政策变化具备较高权威和重要性，值得优先纳入盘前或盘中判断。"
    if (["earnings", "financing", "trading_status", "market_move"].includes(eventFamily))
      return "事件重要性和可交易性都较高，适合优先进入交易或风险处置队列。"
    return "当前事件兼具时效性、重要性和执行价值，适合优先处理。"
  }

  if (actionBucket === "watch") {
    if (whatToWatchNext.length)
      return `当前更适合作为观察信号，下一步重点确认：${whatToWatchNext[0]}。`
    if (eventFamily === "industry_news")
      return "当前更像主题催化或行业动向，适合观察而非直接交易。"
    if (eventFamily === "media_interpretation")
      return "当前更像媒体梳理或选股线索，必须等待更高权威证据确认。"
    return "当前事件已有投资意义，但还缺少足够确认，先观察更稳妥。"
  }

  return "当前更像背景信息或弱线索，不宜优先占用交易注意力。"
}

function getAuthorityLevelLabel(value: string) {
  switch (value) {
    case "official": return "官方"
    case "exchange": return "交易所"
    case "association": return "协会/行业组织"
    case "media": return "媒体"
    default: return "来源待补充"
  }
}

function getExtractionStatusLabel(value: InvestmentEventEvidence["extractionStatus"]) {
  switch (value) {
    case "ready": return "已结构化"
    case "degraded": return "降级结构化"
    case "failed": return "结构化失败"
    default: return "旧证据（未回填）"
  }
}

function getFactDirectionLabel(value: NonNullable<InvestmentEventFact["direction"]>) {
  switch (value) {
    case "up": return "上行/改善"
    case "down": return "下行/走弱"
    case "flat": return "持平"
    default: return "方向待定"
  }
}

function parseFactValue(value?: string | null) {
  if (value === undefined || value === null || value === "") return null
  if (value === "true") return true
  if (value === "false") return false
  const n = Number(value)
  return Number.isFinite(n) ? n : value
}

function parseFactDelta(value?: string | null) {
  const parsed = parseFactValue(value)
  return typeof parsed === "boolean" ? value ?? null : parsed
}

function formatFactLabel(fact: EventFact) {
  switch (fact.factType) {
    case "macro_rate":
      return `${fact.metricName} 利率`
    case "central_bank_operation":
      return `${fact.metricName.toUpperCase()} 操作`
    case "exchange_announcement":
      return "交易所公告"
    case "policy_notice":
      return "政策发布"
    case "industry_release":
      return "产业数据发布"
    case "industry_news":
      return "行业动态"
    case "media_fast_signal":
      return "快讯线索"
    default:
      return fact.metricName || fact.factType
  }
}

function formatFactMetricName(fact: EventFact) {
  switch (fact.metricName) {
    case "analysis_signal":
      return "媒体解读"
    case "rate_fixing":
      return "利率定价"
    case "earnings":
      return "业绩披露"
    case "financing":
      return "融资事项"
    case "contract":
      return "合同订单"
    case "shareholding_change":
      return "股东持股变动"
    case "management_change":
      return "管理层变动"
    case "regulation":
      return "监管规则"
    case "listing_status":
      return "上市与交易状态"
    case "buyback":
      return "回购事项"
    case "dividend":
      return "分红派息"
    case "monetary_policy":
      return "货币政策"
    case "trade_policy":
      return "贸易政策"
    case "industrial_policy":
      return "产业政策"
    case "macro_data":
      return "宏观数据"
    case "industry_data":
      return "产业数据"
    case "industry_news":
      return "行业动态"
    case "policy_signal":
      return "政策线索"
    case "macro_rate_signal":
      return "利率线索"
    case "market_move_signal":
      return "盘口异动"
    default:
      if (fact.factType === "central_bank_operation")
        return fact.metricName.toUpperCase()
      return fact.metricName || undefined
  }
}

function getFactValueLabels(fact: EventFact) {
  if (fact.factType === "media_fast_signal") {
    if (fact.unit === "%") {
      return {
        valueLabel: "文中提及幅度",
        previousValueLabel: undefined,
        deltaLabel: undefined,
      }
    }

    if (fact.unit === "CNY_100M") {
      return {
        valueLabel: "文中提及规模",
        previousValueLabel: undefined,
        deltaLabel: undefined,
      }
    }

    return {
      valueLabel: "文中提及数值",
      previousValueLabel: undefined,
      deltaLabel: undefined,
    }
  }

  return {
    valueLabel: "当前值",
    previousValueLabel: "前值",
    deltaLabel: "变化",
  }
}

function getExchangeAnnouncementPayload(fact: EventFact) {
  const payload = fact.payload ?? {}
  return {
    announcementTypeName: typeof payload.announcementTypeName === "string" ? payload.announcementTypeName : undefined,
    actionKind: typeof payload.actionKind === "string" ? payload.actionKind : undefined,
    announcementStage: typeof payload.announcementStage === "string" ? payload.announcementStage : undefined,
    financingPath: typeof payload.financingPath === "string" ? payload.financingPath : undefined,
    ownershipDirection: typeof payload.ownershipDirection === "string" ? payload.ownershipDirection : undefined,
    isFormalDisclosure: payload.isFormalDisclosure === true,
  }
}

function getPolicyNoticePayload(fact: EventFact) {
  const payload = fact.payload ?? {}
  return {
    issuerInstitution: typeof payload.issuerInstitution === "string" ? payload.issuerInstitution : undefined,
    policyAction: typeof payload.policyAction === "string" ? payload.policyAction : undefined,
    targetScope: typeof payload.targetScope === "string" ? payload.targetScope : undefined,
    executionWindow: typeof payload.executionWindow === "string" ? payload.executionWindow : undefined,
  }
}

function getMediaFastPayload(fact: EventFact) {
  const payload = fact.payload ?? {}
  return {
    subjectText: typeof payload.subjectText === "string" ? payload.subjectText : undefined,
    magnitudeText: typeof payload.magnitudeText === "string" ? payload.magnitudeText : undefined,
    driverText: typeof payload.driverText === "string" ? payload.driverText : undefined,
    market: typeof payload.market === "string" ? payload.market : undefined,
  }
}

function formatAnnouncementStageLabel(stage?: string) {
  if (!stage) return undefined
  switch (stage) {
    case "pre_disclosure":
      return "预披露阶段"
    case "proposal":
      return "方案/预案阶段"
    case "progress":
      return "审核/进展阶段"
    case "implementation":
      return "实施阶段"
    case "completion":
      return "结果/终止阶段"
    default:
      return stage
  }
}

function formatExchangeAnnouncementFactSummary(fact: EventFact) {
  const payload = getExchangeAnnouncementPayload(fact)
  const stageLabel = formatAnnouncementStageLabel(payload.announcementStage)
  const formalLead = payload.isFormalDisclosure ? "这是正式披露公告" : "这是披露线索"

  switch (fact.metricName) {
    case "financing": {
      const pathLabel = payload.financingPath === "ipo"
        ? "IPO/上市融资"
        : payload.financingPath === "convertible_bond"
          ? "可转债融资"
          : payload.financingPath === "rights_issue"
            ? "配股融资"
            : payload.financingPath === "refinancing"
              ? "再融资/股权融资"
              : "融资事项"
      return `${formalLead}，围绕 ${pathLabel}${stageLabel ? `，当前处于${stageLabel}` : ""}，关键看规模、价格、稀释和资金用途。`
    }
    case "buyback":
      return `${formalLead}，围绕回购事项${stageLabel ? `，当前处于${stageLabel}` : ""}，关键看金额、价格区间和执行力度。`
    case "dividend":
      return `${formalLead}，围绕分红派息${stageLabel ? `，当前处于${stageLabel}` : ""}，关键看分红率、派息节奏和现金流支持。`
    case "shareholding_change": {
      const directionLabel = payload.ownershipDirection === "increase"
        ? "增持"
        : payload.ownershipDirection === "decrease"
          ? "减持"
          : payload.ownershipDirection === "neutral"
            ? "股份流通变化"
            : "持股变动"
      return `${formalLead}，围绕${directionLabel}${stageLabel ? `，当前处于${stageLabel}` : ""}，关键看主体属性、规模、均价和是否持续。`
    }
    default:
      if (payload.announcementTypeName) {
        return `${formalLead}，公告类型为${payload.announcementTypeName}${stageLabel ? `，当前处于${stageLabel}` : ""}，需继续核对正式文件和关键条款。`
      }
      return "这是一条交易所/法定披露事实，重点在于公告类型、关键条款和后续正式文件。"
  }
}

function formatFactSummary(fact: EventFact) {
  switch (fact.factType) {
    case "policy_notice": {
      const payload = getPolicyNoticePayload(fact)
      const actor = payload.issuerInstitution ?? "相关机构"
      const action = payload.policyAction ?? fact.metricName
      const scope = payload.targetScope ? `，约束/作用对象为${payload.targetScope}` : ""
      const timing = payload.executionWindow ? `，执行窗口为${payload.executionWindow}` : ""
      return `正式政策/监管文件：${actor}已发布${action}${scope}${timing}，重点在于执行口径、节奏和实际影响范围。`
    }
    case "industry_release":
      return "这是事件型产业数据发布，更适合用来确认景气方向，再结合价格、销量或订单数据判断强度。"
    case "industry_report":
      return "这是行业报告型事实，更适合做中期研究和赛道比较，不宜单独当作短线触发器。"
    case "industry_news":
      return "这是行业动态型事实，更像主题催化线索，需要后续硬数据或公司公告确认。"
    case "exchange_announcement":
      return formatExchangeAnnouncementFactSummary(fact)
    case "media_fast_signal": {
      const payload = getMediaFastPayload(fact)
      if (fact.metricName === "market_move_signal" && (payload.subjectText || payload.magnitudeText)) {
        return `${payload.subjectText ?? "相关市场"}盘中出现${payload.magnitudeText ?? "明显异动"}${payload.driverText ? `，伴随${payload.driverText}` : ""}，需继续确认成交、扩散和后续权威证据。`
      }
      if (fact.unit === "%")
        return "快讯正文提到了一个幅度型数字，这更像市场情绪或题材线索，不等同于公司正式经营数据。"
      if (fact.unit === "CNY_100M")
        return "快讯正文提到了一个规模型数字，需等待正式公告或更高权威来源确认。"
      return "这是媒体快讯里抽出的线索型事实，适合作为早期观察，不足以单独支撑强交易结论。"
    }
    default:
      return undefined
  }
}

function toInvestmentFact(fact: EventFact, entities: Map<string, InvestmentEntityRef>): InvestmentEventFact {
  const valueLabels = getFactValueLabels(fact)
  const normalizedFactEntityId = normalizeSecurityCode(fact.entityId)
  const metricName = formatFactMetricName(fact)
  return {
    factType: fact.factType,
    label: formatFactLabel(fact),
    metricName: fact.factType === "media_fast_signal" ? undefined : metricName,
    summary: formatFactSummary(fact),
    valueLabel: valueLabels.valueLabel,
    previousValueLabel: valueLabels.previousValueLabel,
    deltaLabel: valueLabels.deltaLabel,
    value: parseFactValue(fact.value),
    previousValue: parseFactValue(fact.previousValue),
    delta: parseFactDelta(fact.delta),
    unit: fact.unit ?? null,
    direction: (fact.direction as InvestmentEventFact["direction"]) ?? null,
    directionLabel: fact.direction ? getFactDirectionLabel(fact.direction as NonNullable<InvestmentEventFact["direction"]>) : null,
    effectiveAt: fact.effectiveAt ?? null,
    confidence: fact.confidence,
    entity: fact.entityId
      ? (entities.get(fact.entityId)
        ?? (normalizedFactEntityId ? entities.get(normalizedFactEntityId) : null)
        ?? null)
      : null,
    evidenceId: fact.evidenceId ?? null,
  }
}

function toInvestmentEvidence(evidence: EventEvidence, options?: {
  sourceKind?: EventSourceKind
  primaryEntityName?: string
}): InvestmentEventEvidence {
  const extractionStatus = evidence.extractionStatus
    ? evidence.extractionStatus === "unknown"
      ? "legacy"
      : (evidence.extractionStatus as InvestmentEventEvidence["extractionStatus"])
    : "legacy"
  return {
    evidenceId: evidence.rawId,
    sourceId: evidence.sourceId,
    sourceName: evidence.sourceName || evidence.sourceId,
    sourceTitle: evidence.sourceTitle,
    authorityLevel: evidence.authorityLevel || "unknown",
    authorityLabel: getAuthorityLevelLabel(evidence.authorityLevel || "unknown"),
    sourceKind: options?.sourceKind,
    title: formatInvestmentDisplayTitle(evidence.title, {
      sourceKind: options?.sourceKind,
      primaryEntityName: options?.primaryEntityName,
    }),
    summary: evidence.summary,
    url: evidence.url,
    publishedAt: evidence.publishedAt,
    extractionStatus,
    extractionStatusLabel: getExtractionStatusLabel(extractionStatus),
  }
}

function deriveTradableNow(tradabilityScore: number | undefined, family?: InvestmentEventFamily): InvestmentEventBrief["tradableNow"] {
  if (family === "media_interpretation" && (tradabilityScore ?? 0) >= 30) return "watch"
  if ((tradabilityScore ?? 0) >= 70) return "yes"
  if ((tradabilityScore ?? 0) >= 40) return "watch"
  return "no"
}

function deriveWhatHappened(event: Pick<EventRecord, "title" | "summary" | "eventSubType" | "sourceKind">, family: InvestmentEventFamily) {
  switch (family) {
    case "rates_liquidity":
      return `利率/资金指标更新：${event.title}`
    case "macro_print":
      return `宏观数据更新：${event.title}`
    case "policy":
      return `政策发布：${event.title}`
    case "policy_signal":
      return `政策线索：${event.title}`
    case "media_interpretation":
      return `媒体解读：${event.title}`
    case "earnings":
      return `业绩披露：${event.title}`
    case "financing":
      return `融资事项更新：${event.title}`
    case "trading_status":
      return `交易状态变化：${event.title}`
    case "disclosure_signal":
      return `公告线索：${event.title}`
    case "industry_data":
      return `产业数据更新：${event.title}`
    case "industry_report":
      return `行业报告发布：${event.title}`
    case "industry_news":
      return `行业动态：${event.title}`
    case "rumor_clarification":
      if (/回应|辟谣|澄清/.test(event.title))
        return `公司就市场传闻作出回应：${event.title}`
      return `快讯线索更新：${event.title}`
    case "market_move":
      return `市场异动：${event.title}`
    case "corporate_action":
      return `公司动作更新：${event.title}`
    default:
      return event.summary || event.title
  }
}

function deriveWhoIsAffected(entities: InvestmentEntityRef[], affectedMarkets: string[]) {
  const labels = entities
    .map((item) => {
      switch (item.entityType) {
        case "security":
          return `交易标的：${item.label}`
        case "issuer":
          return `公司主体：${item.label}`
        case "industry":
          return `产业赛道：${item.label}`
        case "market":
          return `影响市场：${item.label}`
        case "institution":
          return `发布机构：${item.label}`
        default:
          return `主题标签：${item.label}`
      }
    })
    .filter(Boolean)
    .slice(0, 4)
  if (labels.length)
    return Array.from(new Set(labels))
  return Array.from(new Set(affectedMarkets.map(market => `影响市场：${formatAffectedMarketLabel(market)}`))).slice(0, 3)
}

function derivePrimarySubject(entities: InvestmentEntityRef[], affectedMarkets: string[]) {
  const preferredEntityTypes: InvestmentEntityRef["entityType"][] = ["security", "issuer", "industry", "market", "institution", "topic"]
  for (const entityType of preferredEntityTypes) {
    const match = entities.find(item => item.entityType === entityType)
    if (match) return match
  }

  if (affectedMarkets.length) {
    const market = affectedMarkets[0]
    return {
      entityId: market,
      label: formatAffectedMarketLabel(market),
      entityType: "market" as const,
      entityTypeLabel: mapEntityTypeLabel("market"),
      market,
    }
  }

  return undefined
}

function deriveSubjectSummary(primarySubject: InvestmentEntityRef | undefined, whoIsAffected: string[], affectedMarketLabels: string[], publisherInstitution?: string) {
  if (primarySubject) {
    if (primarySubject.entityType === "market")
      return `影响市场：${primarySubject.label}`
    if (primarySubject.entityType === "industry")
      return `核心赛道：${primarySubject.label}`
    if (primarySubject.entityType === "institution")
      return `发布机构：${primarySubject.label}`
    return `核心主体：${primarySubject.label}`
  }

  if (whoIsAffected.length)
    return `影响对象：${whoIsAffected.slice(0, 3).join(" / ")}`

  if (affectedMarketLabels.length)
    return `影响市场：${affectedMarketLabels.slice(0, 2).join(" / ")}`

  if (publisherInstitution)
    return `发布机构：${publisherInstitution}`

  return "主体待补充"
}

function deriveActionBucket(event: Pick<
  EventRecord,
  "tradabilityScore" | "materialityScore" | "authorityScore" | "directionalConfidence"
>, family: InvestmentEventFamily): InvestmentActionBucket {
  const tradability = event.tradabilityScore ?? 0
  const materiality = event.materialityScore ?? 0
  const authority = event.authorityScore ?? 0
  const directionalConfidence = event.directionalConfidence ?? 0

  const structurallyActionable = new Set<InvestmentEventFamily>([
    "rates_liquidity",
    "macro_print",
    "policy",
    "earnings",
    "financing",
    "trading_status",
    "market_move",
    "corporate_action",
  ])

  if (
    tradability >= 70
    && materiality >= 60
    && authority >= 60
    && (directionalConfidence >= 35 || structurallyActionable.has(family))
  ) {
    return "actionable"
  }

  if (
    tradability >= 40
    || materiality >= 50
    || authority >= 75
    || family === "media_interpretation"
    || structurallyActionable.has(family)
  ) {
    return "watch"
  }

  return "noise"
}

function toScoreInsight(
  score: number | undefined,
  kind: "materiality" | "tradability" | "authority" | "confidence",
): InvestmentScoreInsight {
  const value = score ?? 0

  if (kind === "materiality") {
    if (value >= 80) return { band: "高", note: "足以明显改变市场或主体预期，通常应优先处理。" }
    if (value >= 65) return { band: "中高", note: "具备明确影响，通常值得尽快纳入判断。" }
    if (value >= 50) return { band: "中等", note: "有投资意义，但通常需要结合更多证据确认。" }
    if (value >= 35) return { band: "中低", note: "更像辅助线索，单独不足以驱动交易。" }
    return { band: "低", note: "更多是背景信息或弱线索。" }
  }

  if (kind === "tradability") {
    if (value >= 80) return { band: "高", note: "可以直接进入交易或风控优先队列。" }
    if (value >= 65) return { band: "中高", note: "具备较强执行价值，适合围绕确认项准备交易。" }
    if (value >= 50) return { band: "中等", note: "适合纳入观察和盘中跟踪，但不一定立即交易。" }
    if (value >= 35) return { band: "中低", note: "更像题材或情绪线索，通常先观察更稳妥。" }
    return { band: "低", note: "不宜优先占用交易注意力。" }
  }

  if (kind === "authority") {
    if (value >= 85) return { band: "高", note: "官方、交易所或法定披露级别，通常可作为一手依据。" }
    if (value >= 70) return { band: "中高", note: "行业组织或高权威机构来源，可信度较高，但仍需结合上下文。" }
    if (value >= 55) return { band: "中等", note: "主流媒体或快讯来源，可作为早期线索，但不能替代一手公告。" }
    if (value >= 40) return { band: "中低", note: "来源参考价值有限，适合辅助观察。" }
    return { band: "低", note: "不足以单独支撑投资判断。" }
  }

  if (value >= 75) return { band: "高", note: "方向较清晰，可直接用于排序和观察重点。" }
  if (value >= 55) return { band: "中等", note: "已有方向倾向，但仍需新的事实确认。" }
  if (value >= 35) return { band: "中低", note: "仅形成初步判断，先观察更稳妥。" }
  return { band: "低", note: "方向仍不稳定，不宜据此做强结论。" }
}

function isGenericImpactLine(line: string, family: InvestmentEventFamily) {
  if (!line) return true
  const trimmed = line.trim()
  if (!trimmed) return true
  if (trimmed.startsWith("当前信号偏")) return true
  if (trimmed === "快讯提供了新增交易线索") return true
  if (trimmed.startsWith("当前更适合作为跟踪线索")) return true
  if (family === "industry_news" && trimmed.startsWith("行业动态：")) return true
  if (family === "industry_data" && trimmed.startsWith("产业数据发布：")) return true
  if (family === "industry_report" && trimmed.startsWith("行业报告发布：")) return true
  return false
}

function selectWhyItMatters(event: Pick<EventRecord, "impactSummary" | "summary" | "eventType" | "eventSubType" | "title">, family: InvestmentEventFamily) {
  const impactLines = (event.impactSummary ?? []).filter(line => !isGenericImpactLine(line, family))
  return impactLines[0] ?? event.summary ?? fallbackWhyItMatters(event, family)
}

function deriveThesis(brief: InvestmentEventBrief) {
  const actionablePrefix = brief.actionBucket === "actionable"
    ? "就当前信息看，它已经具备进入交易或风控优先队列的条件。"
    : brief.actionBucket === "watch"
      ? "就当前信息看，它更适合作为观察和确认线索。"
      : "就当前信息看，它更像背景信息，不宜优先交易。"
  const nextWatch = brief.whatToWatchNext[0] ? `下一步优先确认：${brief.whatToWatchNext[0]}` : ""
  return [actionablePrefix, nextWatch].filter(Boolean).join(" ")
}

function fallbackWhyItMatters(event: Pick<EventRecord, "eventType" | "eventSubType" | "title">, family: InvestmentEventFamily) {
  const lowerTitle = event.title.toLowerCase()
  switch (family) {
    case "rates_liquidity":
      return "这类事件直接影响资金面、利率预期和利率资产定价。"
    case "macro_print":
      return "这类宏观数据会改变增长、通胀和政策预期。"
    case "policy":
      if (event.eventSubType === "monetary_policy")
        return "这类货币政策事件会直接改变流动性、利率预期和资金价格。"
      if (event.eventSubType === "trade_policy")
        return "这类贸易政策事件更容易影响出口链、关税预期和跨市场风险偏好。"
      return "这类政策事件会通过监管、补贴、税收或准入规则影响资产定价。"
    case "policy_signal":
      return "这类媒体政策线索更适合用来提前感知政策方向，但必须等待正式文件或权威口径确认。"
    case "media_interpretation":
      return "这类媒体解读更适合作为公司或赛道线索来源，关键在于后续是否出现正式披露、经营数据或高权威催化。"
    case "earnings":
      if (/业绩预告|快报|预增|预减/.test(event.title))
        return "这类业绩预告会先修正市场盈利预期，关键在于实际结果能否兑现。"
      if (/年报|半年报|季报|中期报告|一季度报告|三季度报告/.test(event.title))
        return "这类定期报告会直接影响盈利、估值和后续指引判断。"
      return "这类业绩事件直接影响个股盈利预期和估值定价。"
    case "financing":
      if (/可转债/.test(event.title))
        return "可转债融资会同时影响融资成本、潜在转股稀释和交易预期。"
      if (/配股|定增|向特定对象发行|非公开发行/.test(event.title))
        return "股权融资事件的关键是规模、价格折让和稀释压力。"
      if (/ipo|首次公开发行|招股/.test(lowerTitle))
        return "IPO/发行文件更偏一级市场和流动性分流影响，需看发行节奏与估值。"
      return "这类融资事件需要结合规模、价格和稀释影响判断。"
    case "trading_status":
      if (/复牌|恢復買賣|恢复买卖/.test(event.title))
        return "复牌事件会恢复价格发现，关键在于复牌原因是否带来预期重估。"
      if (/停牌|暫停買賣|暂停买卖/.test(event.title))
        return "停牌事件会中断价格发现，关键在于停牌原因和后续安排。"
      return "这类交易状态事件直接影响交易可达性和价格发现。"
    case "disclosure_signal":
      return "这类媒体公告线索可能提前反映经营或披露方向，但需要正式公告或公司口径确认。"
    case "industry_data":
      return "这类产业数据适合用来验证景气度与周期变化。"
    case "industry_report":
      return "这类行业报告更适合做中期研究、景气验证和赛道比较，不宜直接当成短线触发器。"
    case "industry_news":
      return "这类行业动态更像主题催化线索，需要后续硬数据确认。"
    case "rumor_clarification":
      return "这类传闻澄清主要作用在于修正预期，需后续经营数据验证。"
    case "market_move":
      if (/纳入.*指数|成分股|纳斯达克100|msci|沪深300|中证1000/.test(event.title))
        return "指数纳入/调出更偏被动资金、主题情绪和板块扩散线索，短线交易价值高于中长期基本面含义。"
      return "这类盘口异动时效高，但持续性要结合成交和扩散判断。"
    case "corporate_action":
      if (event.eventSubType === "buyback")
        return "回购更偏股东回报和股价支撑，关键在规模、价格区间和执行力度。"
      if (event.eventSubType === "dividend")
        return "分红事件更偏现金回报预期，关键在分红率、持续性和经营现金流支持。"
      if (event.eventSubType === "shareholding_change")
        return "股东持股变化更偏筹码与信号意义，需看规模、方向和是否持续。"
      if (event.eventSubType === "management_change")
        return "管理层变动会改变治理和战略预期，需看岗位级别和后续经营节奏。"
      return "这类公司动作会影响股东回报、资本结构或经营预期。"
    default:
      return event.title
  }
}

function deriveWhatToWatchNext(event: Pick<EventRecord, "eventSubType" | "title">, family: InvestmentEventFamily, direction: DirectionalView): string[] {
  switch (family) {
    case "rates_liquidity":
      return ["关注后续资金利率与债券收益率变化", "观察央行后续操作是否延续同方向"]
    case "macro_print":
      return ["核对分项数据是否支持主结论", "观察政策预期与市场定价是否同步变化"]
    case "policy":
      return ["跟踪正式文件、细则和执行口径", "观察影响是否扩散到产业链和资本开支"]
    case "policy_signal":
      return ["等待正式政策文件、监管公告或权威媒体确认", "观察市场是否开始围绕该政策方向定价"]
    case "media_interpretation":
      return ["确认文中提到的主体、产能、订单或利润口径是否有正式来源支撑", "观察是否出现交易所公告、公司公告或后续高权威催化"]
    case "earnings":
      return ["核对收入、利润、毛利率与市场预期差", "观察业绩会口径、指引和后续一致预期修正"]
    case "financing":
      if (/可转债/.test(event.title))
        return ["关注发行规模、转股价和摊薄压力", "观察条款设计是否改变股债性价比"]
      if (/配股|定增|向特定对象发行|非公开发行/.test(event.title))
        return ["关注融资规模、发行价格和折价幅度", "观察募集资金用途是否改变成长预期"]
      return ["关注融资规模、价格、稀释影响和募集用途", "观察市场承接与后续交易行为"]
    case "trading_status":
      return ["确认停复牌原因、监管要求及后续安排", "观察复牌后价格发现、流动性和是否触发补跌/补涨"]
    case "disclosure_signal":
      return ["等待交易所公告、公司公告或投资者问答确认", "观察相关主体和板块是否出现同步交易行为"]
    case "industry_data":
      return ["继续跟踪后续月度/季度数据", "确认价格、订单、库存是否共振"]
    case "industry_report":
      return ["核对报告中的关键假设是否有后续数据支持", "观察报告结论是否能传导到订单、盈利或资本开支"]
    case "industry_news":
      return ["观察是否传导到订单、价格、产能或补贴链条", "等待销量、产量、订单等硬数据确认"]
    case "rumor_clarification":
      return ["观察后续公告和经营数据是否验证澄清口径", "观察市场是否继续交易该传闻"]
    case "market_move":
      return ["确认是否有更高权威来源跟进", "观察成交额、扩散和后续公告"]
    case "corporate_action":
      if (event.eventSubType === "buyback")
        return ["跟踪回购进度、执行价格区间和实际回购金额", "观察回购是否改变市场对底部区间的判断"]
      if (event.eventSubType === "dividend")
        return ["确认分红率、派息节奏和是否超预期", "观察现金流与后续分红可持续性"]
      if (event.eventSubType === "shareholding_change")
        return ["确认增减持规模、均价和是否继续进行", "观察筹码供给变化是否影响股价弹性"]
      return ["跟踪执行节奏和正式公告细节", "观察市场对公司动作的再定价"]
    default:
      return direction === "unknown"
        ? ["等待更高权威证据确认方向"]
        : ["继续观察后续证据是否强化当前方向"]
  }
}

function deriveRiskOfMisread(event: Pick<EventRecord, "authorityScore" | "evidenceCount" | "degraded" | "sourceKind" | "directionalConfidence" | "eventSubType">, family: InvestmentEventFamily): string[] {
  const risks: string[] = []
  if ((event.authorityScore ?? 0) < 70) risks.push("来源权威度有限，结论需二次验证")
  if ((event.evidenceCount ?? 0) <= 1) risks.push("当前证据仍偏少，容易受单条口径影响")
  if (event.degraded) risks.push("当前事件经过降级处理，部分结构化字段可能不完整")
  if (event.sourceKind === "media_fast_feed") risks.push("媒体快讯时效高但误读风险也更高")
  if ((event.directionalConfidence ?? 0) < 40) risks.push("方向性置信度偏低，更适合先观察")
  if (family === "rumor_clarification") risks.push("澄清口径不等于经营改善，仍需订单、交付或财务数据验证")
  if (family === "policy_signal") risks.push("媒体政策线索不等于正式政策落地，执行口径和时间点可能变化")
  if (family === "media_interpretation") risks.push("媒体解读常混合旧线索、历史涨跌幅和机构观点，不能直接当成新增催化")
  if (family === "financing") risks.push("融资类公告如果关键条款未披露完整，实际影响可能与标题差异较大")
  if (family === "disclosure_signal") risks.push("快讯中的公告线索可能早于正式披露，细节和影响强度常会发生变化")
  if (family === "trading_status") risks.push("停复牌本身不直接代表基本面变化，需区分交易安排与经营变化")
  if (family === "industry_news") risks.push("行业动态更像主题催化，未必能稳定传导到盈利和现金流")
  if (family === "industry_report") risks.push("研究结论依赖假设条件，不能替代后续经营、订单和财务数据验证")
  if (event.eventSubType === "shareholding_change") risks.push("股东持股变化需要区分战略安排、被动减持和真实基本面信号")
  return risks
}

function summarizeTimelineState(state: EventLifecycleState) {
  switch (state) {
    case "detected":
      return "首次识别"
    case "updated":
      return "事件信息更新"
    case "confirmed":
      return "事件确认"
    case "resolved":
      return "事件结束"
    default:
      return state
  }
}

const maintenanceSnapshotFields = new Set([
  "投资解读",
  "投资评分",
  "赛道标签",
  "结构化完整度",
])

function getTimelineChangedFields(metadata?: Record<string, unknown>) {
  if (!Array.isArray(metadata?.changedFields)) return []
  return metadata.changedFields.filter(field => typeof field === "string") as string[]
}

function isMaintenanceOnlySnapshotChange(changedFields: string[]) {
  return changedFields.length > 0 && changedFields.every(field => maintenanceSnapshotFields.has(field))
}

function summarizeTimelineLabel(
  entry: Pick<EventTimelineEntry, "stateTo" | "reason">,
  metadata?: Record<string, unknown>,
) {
  if (entry.reason === "canonical_identity_merge")
    return "重复事件归并"
  if (entry.reason === "event_snapshot_changed") {
    if (isMaintenanceOnlySnapshotChange(getTimelineChangedFields(metadata)))
      return "维护性更新"
    return "事件信息更新"
  }
  return summarizeTimelineState(entry.stateTo)
}

function summarizeTimelineReason(reason?: string, metadata?: Record<string, unknown>) {
  const sourceId = typeof metadata?.sourceId === "string" ? metadata.sourceId : undefined
  const sourceName = sourceId ? sources[sourceId as keyof typeof sources]?.name ?? sourceId : undefined
  const mergedEventTitle = typeof metadata?.mergedEventTitle === "string" ? metadata.mergedEventTitle : undefined
  const mergedEventId = typeof metadata?.mergedEventId === "string" ? metadata.mergedEventId : undefined
  const changedFields = getTimelineChangedFields(metadata)
  const changedLabel = changedFields.length
    ? changedFields.join("、")
    : "投资解读、评分或标签"

  switch (reason) {
    case "new_event":
      return sourceName ? `首次由 ${sourceName} 识别到该事件` : "系统首次识别到该事件"
    case "event_snapshot_changed":
      if (isMaintenanceOnlySnapshotChange(changedFields))
        return "维护性重算"
      return sourceName ? `来自 ${sourceName} 的新证据刷新了${changedLabel}` : `${changedLabel}发生变化`
    case "authoritative_source_confirmation":
      return sourceName ? `${sourceName} 作为更高权威来源加入，事件可信度提升` : "更高权威来源加入，事件可信度提升"
    case "multi_source_confirmation":
      return sourceName ? `新增 ${sourceName} 证据，事件从单一来源转为多源确认` : "事件已转为多源确认"
    case "canonical_identity_merge":
      return mergedEventTitle
        ? `系统将重复事件《${mergedEventTitle}》归并到当前事件`
        : mergedEventId
          ? `系统将一条历史重复事件归并到当前事件（原记录已清理）`
          : "系统将一条重复事件归并到当前事件"
    default:
      return undefined
  }
}

function compressTimeline(entries: InvestmentTimelineEntry[]) {
  const filtered = orderTimelineForDisplay(filterDuplicateInitialDetections(entries))
  const merged: InvestmentTimelineEntry[] = []

  for (const entry of filtered) {
    const prev = merged[merged.length - 1]
    if (
      prev
      && prev.label === entry.label
      && prev.label === "重复事件归并"
    ) {
      const existingTitle = prev.relatedEventTitle
        ? prev.relatedEventTitle.split("；").map(item => item.trim()).filter(Boolean)
        : []
      const incomingTitle = entry.relatedEventTitle
        ? entry.relatedEventTitle.split("；").map(item => item.trim()).filter(Boolean)
        : []
      const titles = Array.from(new Set([...existingTitle, ...incomingTitle])).filter(Boolean)
      prev.relatedEventTitle = titles.join("；")
      prev.note = titles.length
        ? `系统将 ${titles.length} 条重复事件归并到当前事件：${titles.join("；")}`
        : "系统将多条重复事件归并到当前事件"
      if (!prev.relatedEventUrl) prev.relatedEventUrl = entry.relatedEventUrl
      continue
    }

    if (
      prev
      && prev.label === entry.label
      && prev.note === entry.note
      && prev.sourceName === entry.sourceName
    ) {
      continue
    }

    merged.push(entry)
  }

  return merged
}

const INITIAL_DETECTION_REORDER_WINDOW_MS = 5 * 1000

function filterDuplicateConfirmationEntries(entries: EventTimelineEntry[]) {
  const keep = new Array(entries.length).fill(true)
  let keptMultiSourceConfirmation = false
  let keptAuthoritativeConfirmation = false

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry.reason === "multi_source_confirmation") {
      if (!keptMultiSourceConfirmation && !keptAuthoritativeConfirmation) {
        keptMultiSourceConfirmation = true
        continue
      }
      keep[index] = false
      continue
    }

    if (entry.reason === "authoritative_source_confirmation") {
      if (!keptAuthoritativeConfirmation) {
        keptAuthoritativeConfirmation = true
        continue
      }
      keep[index] = false
    }
  }

  return entries.filter((_, index) => keep[index])
}

function filterDuplicateInitialDetections(entries: InvestmentTimelineEntry[]) {
  const keep = new Array(entries.length).fill(true)
  let seenInitialDetection = false

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry.label !== "首次识别") continue
    if (!seenInitialDetection) {
      seenInitialDetection = true
      continue
    }
    keep[index] = false
  }

  return entries.filter((_, index) => keep[index])
}

function orderTimelineForDisplay(entries: InvestmentTimelineEntry[]) {
  const ordered = [...entries]

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index]
    const next = ordered[index + 1]

    if (
      current.label === "首次识别"
      && next.label === "重复事件归并"
      && Math.abs(current.changedAt - next.changedAt) <= INITIAL_DETECTION_REORDER_WINDOW_MS
    ) {
      ordered[index] = next
      ordered[index + 1] = current
    }
  }

  return ordered
}

export function projectInvestmentEventBrief(event: EventRecord): InvestmentEventBrief {
  const eventFamily = getInvestmentEventFamily(event)
  const actionBucket = deriveActionBucket(event, eventFamily)
  const signalDirection = event.directionalView ?? "unknown"
  const tradableNow = deriveTradableNow(event.tradabilityScore, eventFamily)
  const whatToWatchNext = deriveWhatToWatchNext(event, eventFamily, event.directionalView ?? "unknown")
  const publisherInstitution = event.sourceIds[0] ? sources[event.sourceIds[0]]?.name : undefined
  const displayPrimaryEntityName = getDisplayPrimaryEntityName(event, publisherInstitution)
  const displayTitle = formatInvestmentDisplayTitle(event.title, {
    sourceKind: event.sourceKind,
    primaryEntityName: displayPrimaryEntityName ?? event.primaryEntityName ?? undefined,
  })
  const displayEvent = {
    ...event,
    title: displayTitle,
  }
  const primaryEntityType = displayPrimaryEntityName ? inferPrimaryEntityType(event, displayPrimaryEntityName) : undefined
  const affectedEntities = dedupeEntities([
    ...(displayPrimaryEntityName
      ? [{
          entityId: displayPrimaryEntityName,
          label: displayPrimaryEntityName,
          entityType: primaryEntityType!,
          entityTypeLabel: mapEntityTypeLabel(primaryEntityType!),
        }]
      : []),
    ...event.topicTags.map(tag => ({
      entityId: tag,
      label: industries[tag],
      entityType: "industry" as const,
      entityTypeLabel: mapEntityTypeLabel("industry"),
    })),
  ]).slice(0, 6)

  const whyItMatters = selectWhyItMatters(displayEvent, eventFamily)
  const affectedMarketLabels = event.affectedMarkets.map(formatAffectedMarketLabel)
  const primarySubject = derivePrimarySubject(affectedEntities, event.affectedMarkets)
  const whoIsAffected = deriveWhoIsAffected(affectedEntities, event.affectedMarkets)

  return {
    eventId: event.eventId,
    title: displayTitle,
    summary: event.summary,
    eventFamily,
    eventFamilyLabel: getInvestmentEventFamilyLabel(eventFamily),
    actionBucket,
    actionLabel: getInvestmentActionLabel(actionBucket),
    actionReason: deriveActionReason(event, eventFamily, actionBucket, whatToWatchNext),
    whatHappened: deriveWhatHappened({
      ...displayEvent,
    }, eventFamily),
    whoIsAffected,
    signalDirection,
    signalDirectionLabel: getDirectionalViewLabel(signalDirection),
    signalConfidence: event.directionalConfidence ?? 0,
    signalConfidenceInsight: toScoreInsight(event.directionalConfidence, "confidence"),
    materialityScore: event.materialityScore ?? 0,
    materialityInsight: toScoreInsight(event.materialityScore, "materiality"),
    tradabilityScore: event.tradabilityScore ?? 0,
    tradabilityInsight: toScoreInsight(event.tradabilityScore, "tradability"),
    authorityScore: event.authorityScore ?? 0,
    authorityInsight: toScoreInsight(event.authorityScore, "authority"),
    affectedMarkets: event.affectedMarkets,
    affectedMarketLabels,
    affectedEntities,
    primarySubject,
    subjectSummary: deriveSubjectSummary(primarySubject, whoIsAffected, affectedMarketLabels, publisherInstitution),
    publisherInstitution,
    whyItMatters,
    tradableNow,
    tradableNowLabel: getTradableNowLabel(tradableNow),
    whatToWatchNext,
    riskOfMisread: deriveRiskOfMisread(event, eventFamily),
    latestLifecycleState: event.latestLifecycleState,
    latestLifecycleAt: event.latestLifecycleAt,
    seriesKey: event.seriesKey,
    periodKey: event.periodKey,
    releaseCadence: event.releaseCadence,
    canonicalUrl: event.canonicalUrl,
    relatedTopics: event.topicTags,
    sourceSummary: {
      primarySourceId: event.sourceIds[0],
      primarySourceName: publisherInstitution,
      sourceKinds: event.sourceKind ? [event.sourceKind] : [],
    },
    publishedAt: event.publishedAt,
  }
}

export function projectInvestmentEventDetail(detail: EventDetail): InvestmentEventDetail {
  const orderedEntities = orderProjectedEntities(collapseDisplayEntities(dedupeEntities(detail.entities
    .filter(entity => !shouldSuppressDisplayEntityLink(detail, entity))
    .map(toInvestmentEntity))), detail.title)
  const entityMap = new Map<string, InvestmentEntityRef>()
  for (const entity of orderedEntities) {
    for (const key of collectEntityLookupKeys(entity)) {
      if (!entityMap.has(key)) entityMap.set(key, entity)
    }
  }

  const brief = projectInvestmentEventBrief({
    ...detail,
    primaryEntityName: orderedEntities[0]?.label ?? detail.primaryEntityName,
  })

  const evidence = detail.evidences
    .filter(item => item.title || item.url)
    .map(item => toInvestmentEvidence(item, {
      sourceKind: detail.sourceKind,
      primaryEntityName: orderedEntities[0]?.label ?? detail.primaryEntityName ?? undefined,
    }))

  const sourceKinds = detail.sourceKind ? [detail.sourceKind] : []
  const primaryEvidence = evidence[0]
  const projectedEntities = orderedEntities.length ? orderedEntities.slice(0, 8) : brief.affectedEntities
  const publisherInstitution = primaryEvidence?.sourceName ?? brief.publisherInstitution ?? brief.sourceSummary.primarySourceName
  const affectedMarketLabels = detail.affectedMarkets.map(formatAffectedMarketLabel)
  const whoIsAffected = deriveWhoIsAffected(projectedEntities, detail.affectedMarkets)
  const primarySubject = derivePrimarySubject(projectedEntities, detail.affectedMarkets) ?? brief.primarySubject
  const watchTargetCandidates = detail.watchTargetCandidates?.length
    ? detail.watchTargetCandidates
    : deriveWatchTargetCandidates({
      title: detail.title,
      summary: detail.summary,
      affectedEntities: projectedEntities,
      relatedTopics: detail.topicTags,
    })

  return {
    ...brief,
    affectedEntities: projectedEntities,
    primarySubject,
    whoIsAffected,
    affectedMarketLabels,
    subjectSummary: deriveSubjectSummary(primarySubject, whoIsAffected, affectedMarketLabels, publisherInstitution),
    publisherInstitution,
    sourceSummary: {
      primarySourceId: primaryEvidence?.sourceId ?? brief.sourceSummary.primarySourceId,
      primarySourceName: publisherInstitution ?? brief.sourceSummary.primarySourceName,
      sourceKinds,
    },
    thesis: deriveThesis(brief),
    keyFacts: detail.facts.map(fact => toInvestmentFact(fact, entityMap)),
    evidence,
    timelineSummary: compressTimeline(filterDuplicateConfirmationEntries(detail.timeline)
      .map((entry): InvestmentTimelineEntry => ({
        timelineId: entry.timelineId,
        changedAt: entry.changedAt,
        state: entry.stateTo,
        label: summarizeTimelineLabel(entry, entry.metadata),
        sourceName: typeof entry.metadata?.sourceId === "string" ? (sources[entry.metadata.sourceId as keyof typeof sources]?.name ?? entry.metadata.sourceId) : undefined,
        note: summarizeTimelineReason(entry.reason, entry.metadata),
        relatedEventId: typeof entry.metadata?.mergedEventId === "string" ? entry.metadata.mergedEventId : undefined,
        relatedEventTitle: typeof entry.metadata?.mergedEventTitle === "string"
          ? formatInvestmentDisplayTitle(entry.metadata.mergedEventTitle)
          : typeof entry.metadata?.mergedEventId === "string"
            ? "历史归并事件（原记录已清理）"
            : undefined,
        relatedEventUrl: typeof entry.metadata?.mergedEventUrl === "string" ? entry.metadata.mergedEventUrl : undefined,
      })),
    ),
    watchTargetCandidates,
    relatedTopics: detail.topicTags,
  }
}

export function getInvestmentRelatedSectionDisplayLabel(
  context: "entity" | "topic" | "market" | "family",
  label: string,
) {
  switch (context) {
    case "entity":
      return `同主体相关事件 · ${label}`
    case "topic":
      return `同赛道相关事件 · ${industries[label as keyof typeof industries] ?? label}`
    case "market":
      return `同市场相关事件 · ${formatAffectedMarketLabel(label)}`
    case "family":
      return `同类事件 · ${label}`
    default:
      return label
  }
}
