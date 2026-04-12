import { describe, expect, it } from "vitest"
import type { EventDetail, EventEvidence, EventFact, EventTimelineEntry } from "@shared/types"
import { matchesInvestmentEventFamily, projectInvestmentEventBrief, projectInvestmentEventDetail } from "#/services/event-engine/investment-view"

describe("investment event projection", () => {
  it("projects list events into investment briefs", () => {
    const brief = projectInvestmentEventBrief({
      eventId: "evt_rates",
      title: "FDR007 下降 5bp",
      summary: "资金利率回落",
      eventType: "macro",
      eventSubType: "rate_fixing",
      sourceKind: "official_rate_fixing",
      publishedAt: Date.UTC(2026, 3, 12, 11, 30, 0),
      ingestedAt: Date.UTC(2026, 3, 12, 11, 31, 0),
      importance: "high",
      directionalView: "positive",
      directionalConfidence: 82,
      materialityScore: 88,
      tradabilityScore: 84,
      authorityScore: 95,
      freshnessScore: 90,
      surpriseScore: 70,
      affectedMarkets: ["CN_rates"],
      impactSummary: ["利率指标 FDR007 报 1.45%", "FDR007 较前值下行 5bp"],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["chinamoney-fdr007"],
    })

    expect(brief.eventFamily).toBe("rates_liquidity")
    expect(brief.eventFamilyLabel).toBe("资金与利率")
    expect(brief.actionBucket).toBe("actionable")
    expect(brief.actionLabel).toBe("优先处理")
    expect(brief.whatHappened).toContain("利率/资金指标更新")
    expect(brief.whoIsAffected).toEqual(["影响市场：中国资金面"])
    expect(brief.subjectSummary).toBe("影响市场：中国资金面")
    expect(brief.signalDirectionLabel).toBe("偏正向")
    expect(brief.affectedMarketLabels).toEqual(["中国资金面"])
    expect(brief.tradableNow).toBe("yes")
    expect(brief.tradableNowLabel).toBe("可交易")
    expect(brief.whyItMatters).toContain("FDR007")
    expect(brief.materialityInsight.band).toBe("高")
    expect(brief.authorityInsight.band).toBe("高")
    expect(brief.sourceSummary.primarySourceName).toBeTruthy()
  })

  it("projects detail events with facts, evidence and readable timeline", () => {
    const evidences: EventEvidence[] = [{
      eventId: "evt_detail",
      rawId: "raw_1",
      sourceId: "caam-nev-news",
      sourceName: "中汽协",
      sourceTitle: "新能源汽车行业新闻",
      title: "新能源汽车行业出现新变化",
      url: "https://example.com/1",
      summary: "行业动态",
      publishedAt: Date.UTC(2026, 3, 12, 9, 0, 0),
      authorityLevel: "association",
      extractionStatus: "ready",
    }]
    const facts: EventFact[] = [{
      factId: "fact_1",
      eventId: "evt_detail",
      evidenceId: "raw_1",
      factType: "industry_news",
      metricName: "新能源汽车行业出现新变化",
      confidence: 0.82,
      payload: {},
    }]
    const timeline: EventTimelineEntry[] = [{
      timelineId: "tl_1",
      eventId: "evt_detail",
      stateTo: "updated",
      changedAt: Date.UTC(2026, 3, 12, 10, 0, 0),
      reason: "event_snapshot_changed",
      metadata: {
        sourceId: "caam-nev-news",
        changedFields: ["投资解读"],
      },
    }]

    const detail: EventDetail = {
      eventId: "evt_detail",
      title: "新能源汽车行业出现新变化",
      summary: "行业动态",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "industry_news_feed",
      publishedAt: Date.UTC(2026, 3, 12, 9, 0, 0),
      ingestedAt: Date.UTC(2026, 3, 12, 9, 1, 0),
      importance: "medium",
      directionalView: "unknown",
      directionalConfidence: 28,
      materialityScore: 56,
      tradabilityScore: 48,
      authorityScore: 75,
      freshnessScore: 85,
      surpriseScore: 40,
      affectedMarkets: ["A", "HK"],
      impactSummary: ["行业动态：新能源汽车行业出现新变化"],
      degraded: false,
      topicTags: ["new-energy-vehicle"],
      evidenceCount: 1,
      sourceIds: ["caam-nev-news"],
      evidences,
      entities: [],
      facts,
      timeline,
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.eventFamily).toBe("industry_news")
    expect(projected.actionBucket).toBe("watch")
    expect(projected.actionLabel).toBe("重点观察")
    expect(projected.affectedEntities.some(item => item.label === "新能源车")).toBe(true)
    expect(projected.subjectSummary).toBe("核心赛道：新能源车")
    expect(projected.whatHappened).toContain("行业动态")
    expect(projected.whoIsAffected).toContain("产业赛道：新能源车")
    expect(projected.keyFacts[0]?.label).toBe("行业动态")
    expect(projected.evidence[0]?.authorityLabel).toBe("协会/行业组织")
    expect(projected.evidence[0]?.extractionStatusLabel).toBe("已结构化")
    expect(projected.evidence[0]?.sourceName).toBe("中汽协")
    expect(projected.timelineSummary[0]?.label).toBe("事件信息更新")
    expect(projected.timelineSummary[0]?.note).toContain("刷新了")
  })

  it("renders canonical merges as readable timeline entries with merged event context", () => {
    const detail: EventDetail = {
      eventId: "evt_merge",
      title: "某主题事件",
      eventType: "market_move",
      eventSubType: "other",
      sourceKind: "media_analysis",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "medium",
      directionalView: "neutral",
      directionalConfidence: 40,
      materialityScore: 52,
      tradabilityScore: 44,
      authorityScore: 60,
      freshnessScore: 70,
      surpriseScore: 35,
      affectedMarkets: ["A"],
      impactSummary: ["市场异动线索"],
      degraded: false,
      topicTags: ["semiconductor"],
      evidenceCount: 1,
      sourceIds: ["sina"],
      evidences: [],
      entities: [],
      facts: [],
      timeline: [{
        timelineId: "tl_merge",
        eventId: "evt_merge",
        stateTo: "updated",
        changedAt: Date.UTC(2026, 3, 12, 12, 30, 0),
        reason: "canonical_identity_merge",
        metadata: {
          mergedEventId: "evt_old",
          mergedEventTitle: "旧事件标题",
          mergedEventUrl: "https://example.com/old",
        },
      }],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.timelineSummary[0]?.label).toBe("重复事件归并")
    expect(projected.timelineSummary[0]?.note).toContain("旧事件标题")
    expect(projected.timelineSummary[0]?.relatedEventTitle).toBe("旧事件标题")
    expect(projected.timelineSummary[0]?.relatedEventUrl).toBe("https://example.com/old")
  })

  it("keeps historical merge entries readable even when only the merged event id remains", () => {
    const detail: EventDetail = {
      eventId: "evt_merge_legacy",
      title: "某政策事件",
      eventType: "policy",
      eventSubType: "regulation",
      sourceKind: "official_policy_notice",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "medium",
      directionalView: "neutral",
      directionalConfidence: 36,
      materialityScore: 58,
      tradabilityScore: 40,
      authorityScore: 90,
      freshnessScore: 72,
      surpriseScore: 35,
      affectedMarkets: ["A"],
      impactSummary: ["政策变化具备较高权威和重要性，值得优先纳入盘前或盘中判断。"],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["pbc-omo"],
      evidences: [],
      entities: [],
      facts: [],
      timeline: [{
        timelineId: "tl_merge_legacy",
        eventId: "evt_merge_legacy",
        stateTo: "updated",
        changedAt: Date.UTC(2026, 3, 12, 12, 30, 0),
        reason: "canonical_identity_merge",
        metadata: {
          mergedEventId: "evt_missing_legacy",
        },
      }],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.timelineSummary[0]?.label).toBe("重复事件归并")
    expect(projected.timelineSummary[0]?.note).toContain("历史重复事件")
    expect(projected.timelineSummary[0]?.relatedEventTitle).toBe("历史归并事件（原记录已清理）")
  })

  it("compresses repeated duplicate-merge timeline entries into one readable summary", () => {
    const detail: EventDetail = {
      eventId: "evt_merge_many",
      title: "某主题事件",
      eventType: "market_move",
      eventSubType: "other",
      sourceKind: "media_analysis",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "medium",
      directionalView: "neutral",
      directionalConfidence: 40,
      materialityScore: 52,
      tradabilityScore: 44,
      authorityScore: 60,
      freshnessScore: 70,
      surpriseScore: 35,
      affectedMarkets: ["A"],
      impactSummary: ["市场异动线索"],
      degraded: false,
      topicTags: ["semiconductor"],
      evidenceCount: 1,
      sourceIds: ["sina"],
      evidences: [],
      entities: [],
      facts: [],
      timeline: [
        {
          timelineId: "tl_merge_1",
          eventId: "evt_merge_many",
          stateTo: "updated",
          changedAt: Date.UTC(2026, 3, 12, 12, 30, 0),
          reason: "canonical_identity_merge",
          metadata: {
            mergedEventId: "evt_old_1",
            mergedEventTitle: "旧事件A",
          },
        },
        {
          timelineId: "tl_merge_2",
          eventId: "evt_merge_many",
          stateTo: "updated",
          changedAt: Date.UTC(2026, 3, 12, 12, 20, 0),
          reason: "canonical_identity_merge",
          metadata: {
            mergedEventId: "evt_old_2",
            mergedEventTitle: "旧事件B",
          },
        },
      ],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.timelineSummary).toHaveLength(1)
    expect(projected.timelineSummary[0]?.note).toContain("2 条重复事件")
    expect(projected.timelineSummary[0]?.relatedEventTitle).toBe("旧事件A；旧事件B")
  })

  it("projects low-value generic events into the noise bucket", () => {
    const brief = projectInvestmentEventBrief({
      eventId: "evt_noise",
      title: "一般行业资讯",
      eventType: "news",
      eventSubType: "other",
      sourceKind: "media_analysis",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "low",
      directionalView: "unknown",
      directionalConfidence: 10,
      materialityScore: 22,
      tradabilityScore: 18,
      authorityScore: 35,
      freshnessScore: 40,
      surpriseScore: 20,
      affectedMarkets: [],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["zhihu"],
    })

    expect(brief.eventFamily).toBe("general_news")
    expect(brief.actionBucket).toBe("noise")
    expect(brief.tradableNow).toBe("no")
  })

  it("projects financing events with investor-oriented next checks and risk notes", () => {
    const brief = projectInvestmentEventBrief({
      eventId: "evt_financing",
      title: "某公司向特定对象发行股票预案",
      eventType: "announcement",
      eventSubType: "financing",
      sourceKind: "exchange_disclosure",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "medium",
      directionalView: "unknown",
      directionalConfidence: 18,
      materialityScore: 66,
      tradabilityScore: 58,
      authorityScore: 90,
      freshnessScore: 72,
      surpriseScore: 45,
      affectedMarkets: ["A"],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["cninfo-szse"],
    })

    expect(brief.eventFamily).toBe("financing")
    expect(brief.whyItMatters).toContain("股权融资")
    expect(brief.whatToWatchNext.join(" ")).toContain("发行价格")
    expect(brief.riskOfMisread.join(" ")).toContain("关键条款")
  })

  it("treats media fast policy items as policy signals instead of confirmed policy events", () => {
    const brief = projectInvestmentEventBrief({
      eventId: "evt_policy_signal",
      title: "市场传闻称新一轮设备更新补贴政策正在研究",
      eventType: "policy",
      eventSubType: "industrial_policy",
      sourceKind: "media_fast_feed",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "medium",
      directionalView: "unknown",
      directionalConfidence: 24,
      materialityScore: 54,
      tradabilityScore: 44,
      authorityScore: 60,
      freshnessScore: 70,
      surpriseScore: 40,
      affectedMarkets: ["A"],
      degraded: false,
      topicTags: ["semiconductor"],
      evidenceCount: 1,
      sourceIds: ["cls-telegraph"],
    })

    expect(brief.eventFamily).toBe("policy_signal")
    expect(brief.eventFamilyLabel).toBe("政策线索")
    expect(brief.whyItMatters).toContain("媒体政策线索")
    expect(brief.whatToWatchNext.join(" ")).toContain("正式政策文件")
  })

  it("projects media interpretation items into a separate watch-only family", () => {
    const brief = projectInvestmentEventBrief({
      eventId: "evt_analysis_signal",
      title: "季报高增长，一季度净利润同比实现翻倍！这家公司受益于旺季到来",
      summary: "《电报解读》追踪到储能电芯供不应求，本文提及鹏辉能源，其4日最高涨18.35%。",
      eventType: "news",
      eventSubType: "analysis_signal",
      sourceKind: "media_fast_feed",
      primaryEntityName: "鹏辉能源",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "medium",
      directionalView: "unknown",
      directionalConfidence: 24,
      materialityScore: 46,
      tradabilityScore: 36,
      authorityScore: 60,
      freshnessScore: 70,
      surpriseScore: 42,
      affectedMarkets: ["A"],
      impactSummary: ["媒体解读提供了公司或赛道跟踪线索"],
      degraded: false,
      topicTags: ["non-ferrous"],
      evidenceCount: 1,
      sourceIds: ["cls-telegraph"],
    })

    expect(brief.eventFamily).toBe("media_interpretation")
    expect(brief.eventFamilyLabel).toBe("媒体解读")
    expect(brief.actionBucket).toBe("watch")
    expect(brief.tradableNow).toBe("watch")
    expect(brief.primarySubject?.label).toBe("鹏辉能源")
    expect(brief.whatHappened).toContain("媒体解读")
    expect(brief.riskOfMisread.join(" ")).toContain("历史涨跌幅")
  })

  it("marks official policy institutions as institutions instead of issuers", () => {
    const brief = projectInvestmentEventBrief({
      eventId: "evt_policy_official",
      title: "商务部就相关措施答记者问",
      eventType: "policy",
      eventSubType: "trade_policy",
      sourceKind: "official_policy_notice",
      primaryEntityName: "商务部",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "high",
      directionalView: "unknown",
      directionalConfidence: 20,
      materialityScore: 72,
      tradabilityScore: 50,
      authorityScore: 95,
      freshnessScore: 80,
      surpriseScore: 40,
      affectedMarkets: ["A", "HK"],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["mofcom-spokesperson"],
    })

    expect(brief.primarySubject?.entityType).toBe("institution")
    expect(brief.subjectSummary).toBe("核心主体：商务部")
  })

  it("matches canonical event family for projected filters", () => {
    const brief = projectInvestmentEventBrief({
      eventId: "evt_family",
      title: "中汽协发布新能源汽车行业新闻",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "industry_news_feed",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "medium",
      directionalView: "unknown",
      directionalConfidence: 22,
      materialityScore: 48,
      tradabilityScore: 36,
      authorityScore: 78,
      freshnessScore: 60,
      surpriseScore: 28,
      affectedMarkets: ["A"],
      degraded: false,
      topicTags: ["new-energy-vehicle"],
      evidenceCount: 1,
      sourceIds: ["caam-nev-news"],
    })

    expect(matchesInvestmentEventFamily(brief, "industry_news")).toBe(true)
    expect(matchesInvestmentEventFamily(brief, "policy")).toBe(false)
  })

  it("projects industry report feeds into a separate family with research-oriented guidance", () => {
    const brief = projectInvestmentEventBrief({
      eventId: "evt_report",
      title: "中国算力发展指数白皮书（2026年）发布",
      eventType: "industry",
      eventSubType: "industry_data",
      sourceKind: "industry_report_release",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "medium",
      directionalView: "unknown",
      directionalConfidence: 24,
      materialityScore: 62,
      tradabilityScore: 34,
      authorityScore: 78,
      freshnessScore: 60,
      surpriseScore: 28,
      affectedMarkets: ["A"],
      degraded: false,
      topicTags: ["ai-computing"],
      evidenceCount: 1,
      sourceIds: ["caict-ai-reports"],
    })

    expect(brief.eventFamily).toBe("industry_report")
    expect(brief.eventFamilyLabel).toBe("行业报告")
    expect(brief.whatHappened).toContain("行业报告发布")
    expect(brief.whyItMatters).toContain("中期研究")
    expect(brief.whatToWatchNext.join(" ")).toContain("关键假设")
  })

  it("adds a readable summary for event-style facts", () => {
    const evidences: EventEvidence[] = [{
      eventId: "evt_fact_summary",
      rawId: "raw_fact_summary",
      sourceId: "safe-latest",
      sourceName: "外汇局",
      sourceTitle: "外汇动态",
      title: "中国人民银行令〔2025〕第13号（银行间外汇市场管理规定）",
      url: "https://example.com/policy",
      authorityLevel: "official",
      extractionStatus: "ready",
    }]
    const facts: EventFact[] = [{
      factId: "fact_policy",
      eventId: "evt_fact_summary",
      evidenceId: "raw_fact_summary",
      factType: "policy_notice",
      metricName: "中国人民银行令〔2025〕第13号（银行间外汇市场管理规定）",
      confidence: 0.72,
      unit: "event",
      payload: {},
    }]

    const projected = projectInvestmentEventDetail({
      eventId: "evt_fact_summary",
      title: "中国人民银行令〔2025〕第13号（银行间外汇市场管理规定）",
      eventType: "policy",
      eventSubType: "regulation",
      sourceKind: "official_policy_notice",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "medium",
      directionalView: "neutral",
      directionalConfidence: 36,
      materialityScore: 58,
      tradabilityScore: 40,
      authorityScore: 90,
      freshnessScore: 72,
      surpriseScore: 35,
      affectedMarkets: ["A"],
      impactSummary: ["政策变化具备较高权威和重要性，值得优先纳入盘前或盘中判断。"],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["safe-latest"],
      evidences,
      entities: [],
      facts,
      timeline: [],
    })

    expect(projected.keyFacts[0]?.summary).toContain("正式政策/监管文件")
  })
})
