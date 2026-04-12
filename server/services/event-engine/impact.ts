import type { AffectedMarket, DirectionalView, EventProfile } from "@shared/event-profile"
import type { EventSubType, EventType } from "@shared/types"
import type { EventFactRow } from "#/types"

function getAuthorityScore(profile?: EventProfile) {
  switch (profile?.authorityLevel) {
    case "official":
      return 95
    case "exchange":
      return 90
    case "association":
      return 75
    case "media":
      return 60
    default:
      return 50
  }
}

function getFreshnessScore(publishedAt?: number) {
  if (!publishedAt) return 40
  const ageMs = Math.max(Date.now() - publishedAt, 0)
  if (ageMs <= 15 * 60 * 1000) return 95
  if (ageMs <= 60 * 60 * 1000) return 85
  if (ageMs <= 6 * 60 * 60 * 1000) return 70
  if (ageMs <= 24 * 60 * 60 * 1000) return 55
  return 35
}

export interface EventImpactSnapshot {
  directionalView: DirectionalView
  directionalConfidence: number
  materialityScore: number
  tradabilityScore: number
  authorityScore: number
  freshnessScore: number
  surpriseScore: number
  affectedMarkets: AffectedMarket[]
  impactSummary: string[]
  degraded: boolean
}

function parseNumber(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(Math.round(value), min), max)
}

function formatDirectionalNarrative(value: DirectionalView) {
  switch (value) {
    case "positive":
      return "当前信号偏正向"
    case "negative":
      return "当前信号偏负向"
    case "neutral":
      return "当前信号偏中性"
    case "mixed":
      return "当前信号存在分歧"
    default:
      return "当前方向仍待确认"
  }
}

function buildMediaFastLead(metricName: string, text: string, eventSubType: EventSubType) {
  const hasRumorClarification = /传言|谣言|辟谣|澄清|回应称|回复称|不属实|不存在上述情况|是否属实/.test(text)
  const hasIndexRebalance = /纳入.*指数|成分股|纳斯达克100|msci|沪深300|中证1000/.test(text)

  if (eventSubType === "analysis_signal" || metricName === "analysis_signal") {
    return "媒体解读提供了公司或赛道跟踪线索"
  }

  if (eventSubType === "contract" && hasRumorClarification) {
    return "公司就订单/交付相关传闻作出回应"
  }

  switch (metricName) {
    case "macro_rate_signal":
      return "快讯涉及利率或资金面线索"
    case "policy_signal":
      return "快讯涉及政策或流动性线索"
    case "market_move_signal":
      if (hasIndexRebalance)
        return "快讯涉及指数纳入/调出线索"
      return "快讯提示盘中市场异动"
    case "announcement_signal":
      return "快讯涉及公告或经营层面线索"
    default:
      return "快讯提供了新增交易线索"
  }
}

function buildMacroRateImpact(facts: EventFactRow[]) {
  const rateFact = facts.find(fact => fact.fact_type === "macro_rate")
  if (!rateFact) return undefined

  const delta = parseNumber(rateFact.delta)
  const magnitude = delta === null ? 0 : Math.abs(delta)
  const impactSummary = [
    `利率指标 ${rateFact.metric_name}${rateFact.value ? ` 报 ${rateFact.value}${rateFact.unit ?? ""}` : ""}`,
  ]

  if (delta === null) {
    return {
      directionalView: "neutral" as const,
      directionalConfidence: 20,
      materialityScore: 72,
      tradabilityScore: 70,
      surpriseScore: 45,
      impactSummary,
    }
  }

  impactSummary.push(`${rateFact.metric_name} 较前值${delta > 0 ? "上行" : delta < 0 ? "下行" : "持平"} ${magnitude}bp`)

  return {
    directionalView: delta > 0 ? "negative" as const : delta < 0 ? "positive" as const : "neutral" as const,
    directionalConfidence: clamp(55 + magnitude * 2, 20, 92),
    materialityScore: clamp(72 + magnitude * 1.8, 40, 96),
    tradabilityScore: clamp(68 + magnitude * 1.5, 35, 94),
    surpriseScore: clamp(45 + magnitude * 2, 20, 95),
    impactSummary,
  }
}

function buildCentralBankOperationImpact(facts: EventFactRow[]) {
  const operationFact = facts.find(fact => fact.fact_type === "central_bank_operation")
  if (!operationFact) return undefined

  const amount = parseNumber(operationFact.value)
  const payload = JSON.parse(operationFact.payload_json || "{}") as {
    netDirection?: string | null
  }
  const impactSummary = [
    `${operationFact.metric_name.toUpperCase()}${amount !== null ? ` 操作规模 ${amount}${operationFact.unit ?? ""}` : ""}`.trim(),
  ]

  let directionalView: DirectionalView = "neutral"
  let directionalConfidence = 30

  if (payload.netDirection === "up") {
    directionalView = "positive"
    directionalConfidence = 82
    impactSummary.push("净投放偏正向，缓和资金面压力")
  } else if (payload.netDirection === "down") {
    directionalView = "negative"
    directionalConfidence = 82
    impactSummary.push("净回笼偏负向，资金面边际收紧")
  } else if (amount !== null && amount > 0) {
    directionalView = "positive"
    directionalConfidence = 48
    impactSummary.push("存在正规模操作，但净方向未完全确认")
  }

  const scaledAmount = amount === null ? 0 : Math.min(amount / 50, 25)

  return {
    directionalView,
    directionalConfidence,
    materialityScore: clamp(78 + scaledAmount, 40, 98),
    tradabilityScore: clamp(72 + scaledAmount, 35, 96),
    surpriseScore: clamp(50 + scaledAmount, 20, 95),
    impactSummary,
  }
}

function buildMediaFastImpact(facts: EventFactRow[], eventSubType: EventSubType) {
  const signalFact = facts.find(fact => fact.fact_type === "media_fast_signal")
  if (!signalFact) return undefined

  const payload = JSON.parse(signalFact.payload_json || "{}") as {
    market?: AffectedMarket
    text?: string
  }
  const isAnalysisSignal = eventSubType === "analysis_signal" || signalFact.metric_name === "analysis_signal"
  const text = typeof payload.text === "string" ? payload.text : ""
  const hasRumorClarification = /传言|谣言|辟谣|澄清|回应称|回复称|不属实|不存在上述情况|是否属实/.test(text)
  const impactSummary = [buildMediaFastLead(signalFact.metric_name, text, eventSubType)]

  let directionalView: DirectionalView = "unknown"
  if (signalFact.direction === "up") directionalView = "positive"
  else if (signalFact.direction === "down") directionalView = "negative"
  else if (signalFact.direction === "flat") directionalView = "neutral"

  const magnitude = parseNumber(signalFact.value)
  if (directionalView === "unknown" && signalFact.metric_name === "policy_signal" && signalFact.unit === "CNY_100M" && magnitude !== null && magnitude > 0) {
    directionalView = "positive"
  }

  if (eventSubType === "contract" && hasRumorClarification) {
    impactSummary.push("当前更像传闻澄清，作用在于修正预期，后续仍要看订单、交付和供应链数据验证。")
  } else if (eventSubType === "analysis_signal" || signalFact.metric_name === "analysis_signal") {
    impactSummary.push("这类媒体解读通常在梳理旧线索、行业逻辑或潜在受益标的，本身不等于新的正式披露或经营确认。")
  } else if (signalFact.metric_name === "market_move_signal" && /纳入.*指数|成分股|纳斯达克100|msci|沪深300|中证1000/.test(text)) {
    impactSummary.push("指数纳入/调出更偏被动资金、主题情绪和板块扩散线索，短线交易价值高于中长期基本面含义。")
  } else if (signalFact.metric_name === "market_move_signal") {
    impactSummary.push("这类信息时效高，但持续性要结合成交额、板块扩散和后续公告确认。")
  } else if (signalFact.metric_name === "policy_signal") {
    impactSummary.push("若后续出现正式政策文件或官方口径，事件权重会明显提升。")
  } else if (signalFact.metric_name === "macro_rate_signal") {
    impactSummary.push("需要结合资金利率、债券收益率和后续官方数据确认影响强度。")
  } else {
    impactSummary.push("当前更适合作为跟踪线索，是否形成交易机会还要等待二次验证。")
  }

  if (directionalView !== "unknown") impactSummary.push(formatDirectionalNarrative(directionalView))
  const scaledMagnitude = magnitude === null
    ? 0
    : isAnalysisSignal
      ? signalFact.unit === "%"
        ? Math.min(Math.abs(magnitude) / 3, 8)
        : signalFact.unit === "bp"
          ? Math.min(Math.abs(magnitude) / 4, 6)
          : Math.min(Math.abs(magnitude) / 50, 6)
      : signalFact.unit === "%"
        ? Math.min(Math.abs(magnitude) * 8, 24)
        : signalFact.unit === "bp"
          ? Math.min(Math.abs(magnitude) * 1.2, 24)
          : Math.min(Math.abs(magnitude) / 25, 18)
  const baseMateriality = isAnalysisSignal ? 44 : 50
  const baseTradability = isAnalysisSignal ? 30 : 48
  const maxMateriality = isAnalysisSignal ? 68 : 88
  const maxTradability = isAnalysisSignal ? 48 : 86

  return {
    directionalView,
    directionalConfidence: clamp(directionalView === "unknown" ? 25 : 45 + scaledMagnitude, 20, 85),
    materialityScore: clamp(baseMateriality + scaledMagnitude, 30, maxMateriality),
    tradabilityScore: clamp(baseTradability + scaledMagnitude, 25, maxTradability),
    surpriseScore: clamp(40 + scaledMagnitude, 20, 82),
    affectedMarkets: payload.market ? [payload.market] : [],
    impactSummary,
  }
}

function buildIndustryFactImpact(facts: EventFactRow[], eventSubType: EventSubType, parserFamily?: string) {
  const releaseFact = facts.find(fact => ["industry_release", "industry_report", "policy_notice", "industry_news"].includes(fact.fact_type))
  if (!releaseFact) return undefined

  const payload = JSON.parse(releaseFact.payload_json || "{}") as {
    cadence?: string
  }
  const impactSummary = [
    `${releaseFact.fact_type === "industry_report"
      ? "行业报告"
      : releaseFact.fact_type === "industry_news"
        ? "行业动态"
        : releaseFact.fact_type === "industry_release"
          ? payload.cadence === "event" ? "行业动态" : "产业数据发布"
          : "产业政策动向"}：${releaseFact.metric_name}`,
  ]

  let materialityBase = releaseFact.fact_type === "industry_report" ? 64 : releaseFact.fact_type === "industry_release" ? 58 : releaseFact.fact_type === "industry_news" ? 54 : 52
  let tradabilityBase = releaseFact.fact_type === "industry_report" ? 34 : releaseFact.fact_type === "industry_release" ? 44 : releaseFact.fact_type === "industry_news" ? 48 : 38

  switch (payload.cadence) {
    case "monthly":
      materialityBase += 10
      tradabilityBase += 8
      impactSummary.push("月度口径，具有较强景气跟踪价值")
      break
    case "quarterly":
      materialityBase += 12
      tradabilityBase += 10
      impactSummary.push("季度口径，景气变化权重更高")
      break
    case "annual":
    case "semiannual":
      materialityBase += releaseFact.fact_type === "industry_report" ? 12 : 8
      tradabilityBase += releaseFact.fact_type === "industry_report" ? 4 : 6
      impactSummary.push(releaseFact.fact_type === "industry_report" ? "研究型材料，更适合作为中期配置和赛道验证参考" : "中长期口径，偏中期配置参考")
      break
    case "weekly":
      materialityBase += 6
      tradabilityBase += 5
      impactSummary.push("周频口径，偏短周期跟踪")
      break
    case "event":
      impactSummary.push("属于事件型行业信息，更适合作为主题催化线索，需等待销量、产量、订单等硬数据确认。")
      break
    default:
      break
  }

  let directionalView: DirectionalView = "unknown"
  if (releaseFact.direction === "up") directionalView = "positive"
  else if (releaseFact.direction === "down") directionalView = "negative"
  else if (releaseFact.direction === "flat") directionalView = "neutral"
  if (releaseFact.fact_type === "industry_news" && payload.cadence !== "monthly" && payload.cadence !== "quarterly" && payload.cadence !== "annual" && payload.cadence !== "semiannual") {
    impactSummary.push("优先关注是否影响订单、价格、产能、补贴或供应链，这些因素更容易转化为交易机会。")
  }
  if (releaseFact.fact_type === "industry_report" || parserFamily === "industry_report") {
    impactSummary.push("这类内容更偏研究框架和赛道验证，适合中期判断，不宜直接当成即时交易触发器。")
  }
  if (eventSubType === "industrial_policy" && payload.cadence === "event") {
    impactSummary.push("优先观察政策是否扩散到补贴、准入、税收或资本开支链条。")
  }
  if (directionalView !== "unknown") impactSummary.push(formatDirectionalNarrative(directionalView))

  return {
    directionalView,
    directionalConfidence: clamp(directionalView === "unknown" ? 24 : 48, 20, 80),
    materialityScore: clamp(materialityBase, 35, 90),
    tradabilityScore: clamp(tradabilityBase, 25, 82),
    surpriseScore: clamp(releaseFact.fact_type === "industry_release" ? 42 : releaseFact.fact_type === "industry_news" ? 40 : 36, 20, 78),
    impactSummary,
  }
}

export function buildImpactSnapshot(input: {
  eventType: EventType
  eventSubType: EventSubType
  profile?: EventProfile
  publishedAt?: number
  facts?: EventFactRow[]
  degraded?: boolean
}): EventImpactSnapshot {
  const authorityScore = getAuthorityScore(input.profile)
  const freshnessScore = getFreshnessScore(input.publishedAt)
  const facts = input.facts ?? []

  let directionalView: DirectionalView = "unknown"
  let directionalConfidence = 20
  let materialityScore = 45
  let tradabilityScore = 40
  const surpriseScore = 50
  let impactSummary: string[] = []

  const factDrivenImpact = input.eventSubType === "rate_fixing"
    ? buildMacroRateImpact(facts)
    : input.eventSubType === "monetary_policy"
      ? buildCentralBankOperationImpact(facts) ?? buildMediaFastImpact(facts, input.eventSubType)
      : input.eventType === "industry" || input.eventSubType === "industrial_policy"
        ? buildIndustryFactImpact(facts, input.eventSubType, input.profile?.parserFamily)
        : input.profile?.parserFamily === "media_fast"
          ? buildMediaFastImpact(facts, input.eventSubType)
          : undefined

  if (factDrivenImpact) {
    directionalView = factDrivenImpact.directionalView
    directionalConfidence = factDrivenImpact.directionalConfidence
    materialityScore = factDrivenImpact.materialityScore
    tradabilityScore = factDrivenImpact.tradabilityScore
    impactSummary = factDrivenImpact.impactSummary
  } else {
    if (input.eventSubType === "monetary_policy") {
      directionalView = "neutral"
      directionalConfidence = 35
      materialityScore = 90
      tradabilityScore = 85
      impactSummary = ["货币政策事件默认视为高影响，优先关注利率与流动性市场"]
    } else if (input.eventSubType === "rate_fixing") {
      directionalView = "neutral"
      directionalConfidence = 30
      materialityScore = 78
      tradabilityScore = 75
      impactSummary = ["利率定盘事件默认影响资金面与利率资产定价"]
    } else if (input.eventSubType === "earnings") {
      directionalView = "unknown"
      directionalConfidence = 25
      materialityScore = 82
      tradabilityScore = 72
      impactSummary = ["业绩公告对个股与板块定价敏感，等待具体数据进一步确认"]
    } else if (input.eventSubType === "analysis_signal") {
      directionalView = "unknown"
      directionalConfidence = 22
      materialityScore = 46
      tradabilityScore = 36
      impactSummary = ["媒体解读更适合作为跟踪线索，关键是确认是否出现新的正式披露、经营数据或高权威催化。"]
    } else if (input.eventSubType === "listing_status") {
      directionalView = "unknown"
      directionalConfidence = 20
      materialityScore = 88
      tradabilityScore = 90
      impactSummary = ["停复牌/上市状态变化直接影响交易可达性与价格发现"]
    } else if (input.eventSubType === "financing") {
      directionalView = "unknown"
      directionalConfidence = 22
      materialityScore = 66
      tradabilityScore = 58
      impactSummary = ["融资与发行类公告需要结合规模、价格与稀释影响判断交易价值"]
    } else if (input.eventSubType === "shareholding_change") {
      directionalView = "unknown"
      directionalConfidence = 24
      materialityScore = 68
      tradabilityScore = 62
      impactSummary = ["股本与限售流通变化需要结合解禁规模和流通盘评估冲击"]
    } else if (input.eventSubType === "buyback") {
      directionalView = "positive"
      directionalConfidence = 60
      materialityScore = 70
      tradabilityScore = 65
      impactSummary = ["回购事件通常提供股价支撑，但仍需结合规模与执行节奏"]
    } else if (input.eventSubType === "regulation") {
      directionalView = "negative"
      directionalConfidence = 55
      materialityScore = 80
      tradabilityScore = 60
      impactSummary = ["监管事件默认偏负向，需要结合处罚力度与主体范围判断"]
    } else if (input.eventType === "industry") {
      directionalView = "unknown"
      directionalConfidence = 20
      materialityScore = 60
      tradabilityScore = 45
      impactSummary = ["产业事件默认对行业景气判断更有价值"]
    } else if (input.eventType === "policy" || input.eventType === "macro") {
      directionalView = "neutral"
      directionalConfidence = 25
      materialityScore = 70
      tradabilityScore = 60
      impactSummary = ["宏观/政策事件默认需要结合后续细则和市场反馈再确认方向"]
    }
  }

  const affectedMarkets = factDrivenImpact
    && "affectedMarkets" in factDrivenImpact
    && Array.isArray(factDrivenImpact.affectedMarkets)
    && factDrivenImpact.affectedMarkets.length
    ? factDrivenImpact.affectedMarkets as AffectedMarket[]
    : input.profile ? [...input.profile.markets] : []

  return {
    directionalView,
    directionalConfidence,
    materialityScore,
    tradabilityScore,
    authorityScore,
    freshnessScore,
    surpriseScore: factDrivenImpact?.surpriseScore ?? surpriseScore,
    affectedMarkets,
    impactSummary,
    degraded: input.degraded === true,
  }
}
