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

  it("surfaces industry follow-up subjects when only an investable chain clue survives", () => {
    const detail: EventDetail = {
      eventId: "evt_fiber_watch_targets",
      title: "国产光纤全球爆单 部分产品价格暴涨650%",
      summary: "行业价格与订单同时走强，但未点名具体上市公司。",
      eventType: "macro",
      eventSubType: "macro_data",
      sourceKind: "media_fast_feed",
      publishedAt: Date.UTC(2026, 3, 19, 10, 0, 0),
      ingestedAt: Date.UTC(2026, 3, 19, 10, 1, 0),
      importance: "medium",
      directionalView: "positive",
      directionalConfidence: 42,
      materialityScore: 58,
      tradabilityScore: 44,
      authorityScore: 35,
      freshnessScore: 77,
      surpriseScore: 51,
      affectedMarkets: ["A"],
      impactSummary: ["产业链价格和订单同步走强，需继续确认是否扩散到公司业绩。"],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["cls-telegraph"],
      evidences: [],
      entities: [{
        eventId: "evt_fiber_watch_targets",
        entityType: "industry",
        entityName: "光纤",
        confidence: 0.88,
        resolver: "llm-industry",
      }],
      facts: [],
      timeline: [],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.primarySubject?.entityType).toBe("industry")
    expect(projected.primarySubject?.label).toBe("光纤")
    expect(projected.subjectSummary).toBe("核心赛道：光纤")
    expect(projected.whoIsAffected).toEqual(["产业赛道：光纤"])
    expect(projected.affectedEntities).toEqual([
      expect.objectContaining({
        label: "光纤",
        entityType: "industry",
      }),
    ])
    expect(projected.watchTargetCandidates.map(item => item.entity.label)).toEqual([
      "长飞光纤",
      "亨通光电",
      "中天科技",
      "烽火通信",
    ])
  })

  it("prefers persisted watch-target candidates over projection-time fallback derivation", () => {
    const detail: EventDetail = {
      eventId: "evt_fiber_watch_targets_persisted",
      title: "国产光纤全球爆单 部分产品价格暴涨650%",
      summary: "行业价格与订单同时走强，但未点名具体上市公司。",
      eventType: "macro",
      eventSubType: "macro_data",
      sourceKind: "media_fast_feed",
      publishedAt: Date.UTC(2026, 3, 19, 10, 0, 0),
      ingestedAt: Date.UTC(2026, 3, 19, 10, 1, 0),
      importance: "medium",
      directionalView: "positive",
      directionalConfidence: 42,
      materialityScore: 58,
      tradabilityScore: 44,
      authorityScore: 35,
      freshnessScore: 77,
      surpriseScore: 51,
      affectedMarkets: ["A"],
      impactSummary: ["产业链价格和订单同步走强，需继续确认是否扩散到公司业绩。"],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["cls-telegraph"],
      evidences: [],
      entities: [{
        eventId: "evt_fiber_watch_targets_persisted",
        entityType: "industry",
        entityName: "光纤",
        confidence: 0.88,
        resolver: "llm-industry",
      }],
      facts: [],
      timeline: [],
      watchTargetCandidates: [{
        source: "llm-registry",
        matchedBy: "llm_hypothesis",
        reason: "光纤供需收紧时，光纤光缆龙头通常最先兑现业绩弹性。",
        confidence: 0.93,
        entity: {
          entityId: "sh601869",
          label: "长飞光纤",
          entityType: "security",
          entityTypeLabel: "交易标的",
          code: "601869",
          market: "A",
        },
      }],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.watchTargetCandidates).toEqual(detail.watchTargetCandidates)
  })

  it("suppresses broad market descriptors as follow-up subjects for market-move fast feeds", () => {
    const brief = projectInvestmentEventBrief({
      eventId: "evt_crypto_board_move",
      title: "加密货币板块集体走高 Strategy涨超12%",
      summary: "盘中异动",
      eventType: "market_move",
      eventSubType: "other",
      sourceKind: "media_fast_feed",
      primaryEntityName: "加密货币板块集体走高",
      publishedAt: Date.UTC(2026, 3, 17, 22, 33, 0),
      ingestedAt: Date.UTC(2026, 3, 17, 22, 34, 0),
      importance: "medium",
      directionalView: "positive",
      directionalConfidence: 69,
      materialityScore: 74,
      tradabilityScore: 72,
      authorityScore: 60,
      freshnessScore: 83,
      surpriseScore: 36,
      affectedMarkets: ["A", "HK"],
      impactSummary: ["这类信息时效高，但持续性要结合成交额、板块扩散和后续公告确认。"],
      degraded: false,
      topicTags: [],
      evidenceCount: 2,
      sourceIds: ["cls-telegraph", "eastmoney-7x24"],
    })

    expect(brief.affectedEntities).toEqual([])
    expect(brief.primarySubject?.entityType).toBe("market")
    expect(brief.primarySubject?.label).toBe("A股")
    expect(brief.subjectSummary).toBe("影响市场：A股")
    expect(brief.whoIsAffected).toEqual(["影响市场：A股", "影响市场：港股"])
  })

  it("filters broad market descriptor entity links out of detail follow-up targets", () => {
    const detail: EventDetail = {
      eventId: "evt_crypto_board_move_detail",
      title: "加密货币板块集体走高 Strategy涨超12%",
      summary: "盘中异动",
      eventType: "market_move",
      eventSubType: "other",
      sourceKind: "media_fast_feed",
      primaryEntityName: "加密货币板块集体走高",
      publishedAt: Date.UTC(2026, 3, 17, 22, 33, 0),
      ingestedAt: Date.UTC(2026, 3, 17, 22, 34, 0),
      importance: "medium",
      directionalView: "positive",
      directionalConfidence: 69,
      materialityScore: 74,
      tradabilityScore: 72,
      authorityScore: 60,
      freshnessScore: 83,
      surpriseScore: 36,
      affectedMarkets: ["A", "HK"],
      impactSummary: ["这类信息时效高，但持续性要结合成交额、板块扩散和后续公告确认。"],
      degraded: false,
      topicTags: [],
      evidenceCount: 2,
      sourceIds: ["cls-telegraph", "eastmoney-7x24"],
      evidences: [],
      entities: [{
        eventId: "evt_crypto_board_move_detail",
        entityType: "company",
        entityName: "加密货币板块集体走高",
        confidence: 0.65,
        resolver: "primary-entity-fallback",
      }],
      facts: [],
      timeline: [],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.affectedEntities).toEqual([])
    expect(projected.primarySubject?.entityType).toBe("market")
    expect(projected.subjectSummary).toBe("影响市场：A股")
    expect(projected.whoIsAffected).toEqual(["影响市场：A股", "影响市场：港股"])
  })

  it("keeps explicitly named offshore securities as follow-up targets and ranks title-mentioned names first", () => {
    const detail: EventDetail = {
      eventId: "evt_crypto_explicit_tickers",
      title: "加密货币板块集体走高 Strategy涨超12%",
      summary: "盘中异动",
      eventType: "market_move",
      eventSubType: "other",
      sourceKind: "media_fast_feed",
      primaryEntityName: "加密货币板块集体走高",
      publishedAt: Date.UTC(2026, 3, 17, 22, 33, 0),
      ingestedAt: Date.UTC(2026, 3, 17, 22, 34, 0),
      importance: "medium",
      directionalView: "positive",
      directionalConfidence: 69,
      materialityScore: 74,
      tradabilityScore: 72,
      authorityScore: 60,
      freshnessScore: 83,
      surpriseScore: 36,
      affectedMarkets: ["A", "HK"],
      impactSummary: ["这类信息时效高，但持续性要结合成交额、板块扩散和后续公告确认。"],
      degraded: false,
      topicTags: [],
      evidenceCount: 2,
      sourceIds: ["cls-telegraph", "eastmoney-7x24"],
      evidences: [],
      entities: [
        {
          eventId: "evt_crypto_explicit_tickers",
          entityType: "company",
          entityName: "加密货币板块集体走高",
          confidence: 0.65,
          resolver: "primary-entity-fallback",
        },
        {
          eventId: "evt_crypto_explicit_tickers",
          entityType: "stock",
          entityName: "Coinbase",
          code: "COIN",
          fullCode: "us:coin",
          confidence: 0.93,
          resolver: "explicit-ticker-mention",
        },
        {
          eventId: "evt_crypto_explicit_tickers",
          entityType: "stock",
          entityName: "Strategy",
          code: "MSTR",
          fullCode: "us:mstr",
          confidence: 0.93,
          resolver: "explicit-ticker-mention",
        },
        {
          eventId: "evt_crypto_explicit_tickers",
          entityType: "stock",
          entityName: "Bit Digital",
          code: "BTBT",
          fullCode: "us:btbt",
          confidence: 0.93,
          resolver: "explicit-ticker-mention",
        },
      ],
      facts: [],
      timeline: [],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.affectedEntities.slice(0, 3)).toEqual([
      expect.objectContaining({
        label: "Strategy",
        entityType: "security",
        market: "US",
        code: "MSTR",
      }),
      expect.objectContaining({
        label: "Bit Digital",
        entityType: "security",
        market: "US",
        code: "BTBT",
      }),
      expect.objectContaining({
        label: "Coinbase",
        entityType: "security",
        market: "US",
        code: "COIN",
      }),
    ])
    expect(projected.primarySubject?.label).toBe("Strategy")
    expect(projected.subjectSummary).toBe("核心主体：Strategy")
    expect(projected.watchTargetCandidates).toEqual([])
  })

  it("projects provisional institutions as institution follow-up subjects instead of issuers", () => {
    const detail: EventDetail = {
      eventId: "evt_openai_provisional_institution",
      title: "OpenAI 推出企业版智能体平台",
      summary: "高价值未映射主体样本",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "media_fast_feed",
      primaryEntityName: "OpenAI",
      publishedAt: Date.UTC(2026, 3, 18, 9, 0, 0),
      ingestedAt: Date.UTC(2026, 3, 18, 9, 1, 0),
      importance: "medium",
      directionalView: "unknown",
      directionalConfidence: 45,
      materialityScore: 68,
      tradabilityScore: 42,
      authorityScore: 60,
      freshnessScore: 88,
      surpriseScore: 52,
      affectedMarkets: ["global_macro"],
      impactSummary: ["企业版智能体平台发布，关注产业链和软件基础设施映射。"],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["cls-telegraph"],
      evidences: [],
      entities: [{
        eventId: "evt_openai_provisional_institution",
        entityType: "institution" as any,
        entityName: "OpenAI",
        confidence: 0.84,
        resolver: "llm-provisional-institution",
      }],
      facts: [],
      timeline: [],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.affectedEntities).toEqual([
      expect.objectContaining({
        label: "OpenAI",
        entityType: "institution",
        entityTypeLabel: "发布机构",
      }),
    ])
    expect(projected.primarySubject?.entityType).toBe("institution")
    expect(projected.primarySubject?.label).toBe("OpenAI")
    expect(projected.subjectSummary).toBe("发布机构：OpenAI")
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
    expect(projected.timelineSummary[0]?.label).toBe("维护性更新")
    expect(projected.timelineSummary[0]?.note).toBe("维护性重算")
  })

  it("keeps substantive snapshot refreshes visible in timeline notes", () => {
    const detail: EventDetail = {
      eventId: "evt_snapshot_substantive",
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
      evidences: [],
      entities: [],
      facts: [],
      timeline: [{
        timelineId: "tl_substantive",
        eventId: "evt_snapshot_substantive",
        stateTo: "updated",
        changedAt: Date.UTC(2026, 3, 12, 10, 0, 0),
        reason: "event_snapshot_changed",
        metadata: {
          sourceId: "caam-nev-news",
          changedFields: ["标题与摘要", "事件分类", "核心主体", "方向判断", "影响市场"],
        },
      }],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.timelineSummary[0]?.label).toBe("事件信息更新")
    expect(projected.timelineSummary[0]?.note).toContain("标题与摘要")
    expect(projected.timelineSummary[0]?.note).toContain("影响市场")
  })

  it("collapses duplicate security aliases into one follow-up target and keeps fact entity linkage", () => {
    const facts: EventFact[] = [{
      factId: "fact_alias",
      eventId: "evt_alias",
      evidenceId: "raw_alias",
      factType: "exchange_announcement",
      metricName: "shareholding_change",
      entityId: "603501",
      confidence: 0.9,
      payload: {
        announcementTypeName: "减持预披露",
        actionKind: "shareholding_change",
        announcementStage: "pre_disclosure",
        ownershipDirection: "decrease",
        isFormalDisclosure: true,
      },
    }]

    const detail: EventDetail = {
      eventId: "evt_alias",
      title: "豪威集团：关于召开2025年年度股东会的通知",
      summary: "股东会公告",
      eventType: "announcement",
      eventSubType: "buyback",
      sourceKind: "exchange_disclosure",
      publishedAt: Date.UTC(2026, 3, 16, 9, 0, 0),
      ingestedAt: Date.UTC(2026, 3, 16, 9, 1, 0),
      importance: "medium",
      directionalView: "unknown",
      directionalConfidence: 24,
      materialityScore: 68,
      tradabilityScore: 62,
      authorityScore: 90,
      freshnessScore: 80,
      surpriseScore: 32,
      affectedMarkets: ["A"],
      impactSummary: ["股本与限售流通变化需要结合解禁规模和流通盘评估冲击"],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["sse-latest"],
      evidences: [],
      entities: [
        {
          eventId: "evt_alias",
          entityType: "company",
          entityName: "豪威集团",
          code: "603501",
          fullCode: "sh603501",
          confidence: 0.98,
          resolver: "tdx-api-code",
        },
        {
          eventId: "evt_alias",
          entityType: "stock",
          entityName: "豪威集团",
          code: "603501",
          fullCode: "sh603501",
          confidence: 0.98,
          resolver: "tdx-api-code",
        },
        {
          eventId: "evt_alias",
          entityType: "stock",
          entityName: "603501",
          code: "603501",
          confidence: 0.75,
          resolver: "title-regex",
        },
      ],
      facts,
      timeline: [],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.affectedEntities).toEqual([{
      entityId: "sh603501",
      label: "豪威集团",
      entityType: "security",
      entityTypeLabel: "交易标的",
      code: "603501",
      market: "A",
    }])
    expect(projected.whoIsAffected).toEqual(["交易标的：豪威集团"])
    expect(projected.primarySubject?.label).toBe("豪威集团")
    expect(projected.keyFacts[0]?.label).toBe("交易所公告")
    expect(projected.keyFacts[0]?.metricName).toBe("股东持股变动")
    expect(projected.keyFacts[0]?.summary).toContain("减持")
    expect(projected.keyFacts[0]?.summary).toContain("预披露阶段")
    expect(projected.keyFacts[0]?.entity?.label).toBe("豪威集团")
    expect(projected.keyFacts[0]?.entity?.code).toBe("603501")
  })

  it("cleans machine-style exchange disclosure titles across briefs, evidence, and timeline", () => {
    const detail: EventDetail = {
      eventId: "evt_exchange_display",
      title: "春兰股份：600854_春兰股份_2025年_年度报告",
      summary: "年度报告",
      eventType: "announcement",
      eventSubType: "earnings",
      sourceKind: "exchange_disclosure",
      publishedAt: Date.UTC(2026, 3, 16, 8, 0, 0),
      ingestedAt: Date.UTC(2026, 3, 16, 8, 1, 0),
      importance: "high",
      directionalView: "unknown",
      directionalConfidence: 32,
      materialityScore: 82,
      tradabilityScore: 72,
      authorityScore: 90,
      freshnessScore: 86,
      surpriseScore: 40,
      affectedMarkets: ["A"],
      impactSummary: ["业绩公告对个股与板块定价敏感，等待具体数据进一步确认"],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["sse-latest"],
      evidences: [{
        eventId: "evt_exchange_display",
        rawId: "raw_exchange_display",
        sourceId: "sse-latest",
        sourceName: "上交所",
        sourceTitle: "最新公告",
        title: "春兰股份：600854_春兰股份_2025年_年度报告",
        url: "https://example.com/exchange-display",
        summary: "年度报告",
        publishedAt: Date.UTC(2026, 3, 16, 8, 0, 0),
        authorityLevel: "exchange",
        extractionStatus: "ready",
      }],
      entities: [{
        eventId: "evt_exchange_display",
        entityType: "stock",
        entityName: "春兰股份",
        code: "600854",
        fullCode: "sh600854",
        confidence: 0.98,
        resolver: "tdx-api-code",
      }],
      facts: [],
      timeline: [{
        timelineId: "tl_exchange_display",
        eventId: "evt_exchange_display",
        stateTo: "updated",
        changedAt: Date.UTC(2026, 3, 16, 8, 5, 0),
        reason: "canonical_identity_merge",
        metadata: {
          mergedEventId: "evt_exchange_display_old",
          mergedEventTitle: "春兰股份：600854_春兰股份_2025年_年度报告_摘要",
        },
      }],
    }

    const brief = projectInvestmentEventBrief(detail)
    const projected = projectInvestmentEventDetail(detail)

    expect(brief.title).toBe("春兰股份：2025年年度报告")
    expect(brief.whatHappened).toContain("春兰股份：2025年年度报告")
    expect(projected.evidence[0]?.title).toBe("春兰股份：2025年年度报告")
    expect(projected.timelineSummary[0]?.relatedEventTitle).toBe("春兰股份：2025年年度报告摘要")
  })

  it("prefers the publishing institution when official policy titles carry generic issue subjects", () => {
    const brief = projectInvestmentEventBrief({
      eventId: "evt_policy_subject",
      title: "国家税务总局 国家外汇管理局关于服务贸易等项目对外支付税务备案有关问题的补充公告",
      summary: "政策公告",
      eventType: "policy",
      eventSubType: "trade_policy",
      sourceKind: "official_policy_notice",
      publishedAt: Date.UTC(2026, 3, 12, 15, 56, 0),
      ingestedAt: Date.UTC(2026, 3, 12, 16, 0, 0),
      importance: "high",
      directionalView: "neutral",
      directionalConfidence: 40,
      materialityScore: 70,
      tradabilityScore: 60,
      authorityScore: 95,
      freshnessScore: 72,
      surpriseScore: 36,
      affectedMarkets: ["A", "CN_rates"],
      impactSummary: ["宏观/政策事件默认需要结合后续细则和市场反馈再确认方向"],
      degraded: false,
      primaryEntityName: "服务贸易等项目对外支付税务备案有关问题",
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["safe"],
    })

    expect(brief.primarySubject?.entityType).toBe("institution")
    expect(brief.primarySubject?.label).toBe("国家税务总局 / 国家外汇管理局")
    expect(brief.subjectSummary).toBe("发布机构：国家税务总局 / 国家外汇管理局")
    expect(brief.whoIsAffected).toContain("发布机构：国家税务总局 / 国家外汇管理局")
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

  it("keeps only the earliest initial detection in timeline summary", () => {
    const detail: EventDetail = {
      eventId: "evt_duplicate_initial_detection",
      title: "SEMI报告：2025年第二季度全球硅晶圆出货量同比增长10%",
      summary: "产业数据更新",
      eventType: "industry",
      eventSubType: "industry_data",
      sourceKind: "industry_stat_release",
      publishedAt: Date.UTC(2026, 3, 18, 8, 0, 0),
      ingestedAt: Date.UTC(2026, 3, 18, 8, 1, 0),
      importance: "medium",
      directionalView: "positive",
      directionalConfidence: 48,
      materialityScore: 70,
      tradabilityScore: 54,
      authorityScore: 75,
      freshnessScore: 80,
      surpriseScore: 42,
      affectedMarkets: ["A", "HK", "CN_macro"],
      impactSummary: ["产业数据更新：SEMI报告：2025年第二季度全球硅晶圆出货量同比增长10%"],
      degraded: false,
      topicTags: ["semiconductor", "ai-computing"],
      evidenceCount: 1,
      sourceIds: ["semi-data"],
      evidences: [],
      entities: [],
      facts: [],
      timeline: [
        {
          timelineId: "tl_updated",
          eventId: "evt_duplicate_initial_detection",
          stateTo: "updated",
          changedAt: Date.UTC(2026, 3, 18, 9, 0, 0),
          reason: "event_snapshot_changed",
          metadata: {
            sourceId: "semi-data",
            changedFields: ["赛道标签"],
          },
        },
        {
          timelineId: "tl_detected_latest",
          eventId: "evt_duplicate_initial_detection",
          stateTo: "detected",
          changedAt: Date.UTC(2026, 3, 18, 8, 30, 0),
          reason: "new_event",
          metadata: {
            sourceId: "semi-data",
          },
        },
        {
          timelineId: "tl_merge",
          eventId: "evt_duplicate_initial_detection",
          stateTo: "updated",
          changedAt: Date.UTC(2026, 3, 18, 8, 29, 59),
          reason: "canonical_identity_merge",
          metadata: {
            mergedEventId: "evt_old_duplicate",
          },
        },
        {
          timelineId: "tl_detected_earliest",
          eventId: "evt_duplicate_initial_detection",
          stateTo: "detected",
          changedAt: Date.UTC(2026, 3, 18, 8, 0, 0),
          reason: "new_event",
          metadata: {
            sourceId: "semi-data",
          },
        },
      ],
    }

    const projected = projectInvestmentEventDetail(detail)
    const initialDetections = projected.timelineSummary.filter(entry => entry.label === "首次识别")

    expect(initialDetections).toHaveLength(1)
    expect(initialDetections[0]?.timelineId).toBe("tl_detected_earliest")
  })

  it("shows duplicate merge provenance above initial detection when they happen together", () => {
    const detail: EventDetail = {
      eventId: "evt_simultaneous_origin",
      title: "SEMI报告：2025年第二季度全球硅晶圆出货量同比增长10%",
      summary: "产业数据更新",
      eventType: "industry",
      eventSubType: "industry_data",
      sourceKind: "industry_stat_release",
      publishedAt: Date.UTC(2026, 3, 18, 8, 0, 0),
      ingestedAt: Date.UTC(2026, 3, 18, 8, 1, 0),
      importance: "medium",
      directionalView: "positive",
      directionalConfidence: 48,
      materialityScore: 70,
      tradabilityScore: 54,
      authorityScore: 75,
      freshnessScore: 80,
      surpriseScore: 42,
      affectedMarkets: ["A", "HK", "CN_macro"],
      impactSummary: ["产业数据更新：SEMI报告：2025年第二季度全球硅晶圆出货量同比增长10%"],
      degraded: false,
      topicTags: ["semiconductor", "ai-computing"],
      evidenceCount: 1,
      sourceIds: ["semi-data"],
      evidences: [],
      entities: [],
      facts: [],
      timeline: [
        {
          timelineId: "tl_updated",
          eventId: "evt_simultaneous_origin",
          stateTo: "updated",
          changedAt: Date.UTC(2026, 3, 18, 9, 0, 0),
          reason: "event_snapshot_changed",
          metadata: {
            sourceId: "semi-data",
            changedFields: ["赛道标签"],
          },
        },
        {
          timelineId: "tl_detected",
          eventId: "evt_simultaneous_origin",
          stateTo: "detected",
          changedAt: Date.UTC(2026, 3, 18, 8, 0, 0) + 2,
          reason: "new_event",
          metadata: {
            sourceId: "semi-data",
          },
        },
        {
          timelineId: "tl_merge",
          eventId: "evt_simultaneous_origin",
          stateTo: "updated",
          changedAt: Date.UTC(2026, 3, 18, 8, 0, 0),
          reason: "canonical_identity_merge",
          metadata: {
            mergedEventId: "evt_old_duplicate",
          },
        },
      ],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.timelineSummary.map(entry => entry.label)).toEqual([
      "维护性更新",
      "重复事件归并",
      "首次识别",
    ])
  })

  it("keeps only the first confirmation and collapses repeated refreshes after an event is already confirmed", () => {
    const detail: EventDetail = {
      eventId: "evt_repeated_confirmation_noise",
      title: "盘中快讯：某产业链传来新进展",
      summary: "产业跟踪",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "media_fast_feed",
      publishedAt: Date.UTC(2026, 3, 18, 8, 0, 0),
      ingestedAt: Date.UTC(2026, 3, 18, 8, 1, 0),
      importance: "medium",
      directionalView: "unknown",
      directionalConfidence: 36,
      materialityScore: 52,
      tradabilityScore: 40,
      authorityScore: 48,
      freshnessScore: 85,
      surpriseScore: 30,
      affectedMarkets: ["A"],
      impactSummary: ["产业链快讯需要结合后续证据进一步确认"],
      degraded: false,
      topicTags: ["ai-computing"],
      evidenceCount: 2,
      sourceIds: ["cls-telegraph", "eastmoney-7x24"],
      evidences: [],
      entities: [],
      facts: [],
      timeline: [
        {
          timelineId: "tl_confirm_noise_latest",
          eventId: "evt_repeated_confirmation_noise",
          stateTo: "confirmed",
          changedAt: Date.UTC(2026, 3, 18, 8, 30, 0),
          reason: "multi_source_confirmation",
          metadata: {
            sourceId: "cls-telegraph",
          },
        },
        {
          timelineId: "tl_update_latest",
          eventId: "evt_repeated_confirmation_noise",
          stateTo: "updated",
          changedAt: Date.UTC(2026, 3, 18, 8, 30, 0),
          reason: "event_snapshot_changed",
          metadata: {
            sourceId: "cls-telegraph",
            changedFields: ["标题与摘要"],
          },
        },
        {
          timelineId: "tl_confirm_noise_mid",
          eventId: "evt_repeated_confirmation_noise",
          stateTo: "confirmed",
          changedAt: Date.UTC(2026, 3, 18, 8, 20, 0),
          reason: "multi_source_confirmation",
          metadata: {
            sourceId: "eastmoney-7x24",
          },
        },
        {
          timelineId: "tl_update_mid",
          eventId: "evt_repeated_confirmation_noise",
          stateTo: "updated",
          changedAt: Date.UTC(2026, 3, 18, 8, 20, 0),
          reason: "event_snapshot_changed",
          metadata: {
            sourceId: "cls-telegraph",
            changedFields: ["标题与摘要"],
          },
        },
        {
          timelineId: "tl_confirm_first",
          eventId: "evt_repeated_confirmation_noise",
          stateTo: "confirmed",
          changedAt: Date.UTC(2026, 3, 18, 8, 10, 0),
          reason: "multi_source_confirmation",
          metadata: {
            sourceId: "eastmoney-7x24",
          },
        },
        {
          timelineId: "tl_update_first",
          eventId: "evt_repeated_confirmation_noise",
          stateTo: "updated",
          changedAt: Date.UTC(2026, 3, 18, 8, 10, 0),
          reason: "event_snapshot_changed",
          metadata: {
            sourceId: "eastmoney-7x24",
            changedFields: ["标题与摘要"],
          },
        },
        {
          timelineId: "tl_detected",
          eventId: "evt_repeated_confirmation_noise",
          stateTo: "detected",
          changedAt: Date.UTC(2026, 3, 18, 8, 0, 0),
          reason: "new_event",
          metadata: {
            sourceId: "cls-telegraph",
          },
        },
      ],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.timelineSummary.map(entry => entry.label)).toEqual([
      "事件信息更新",
      "事件确认",
      "事件信息更新",
      "首次识别",
    ])
    expect(projected.timelineSummary[1]?.note).toContain("东方财富")
  })

  it("prefers the earlier authoritative confirmation over later multi-source duplicates", () => {
    const detail: EventDetail = {
      eventId: "evt_authoritative_first",
      title: "官方口径确认某政策安排",
      summary: "政策确认",
      eventType: "policy",
      eventSubType: "regulation",
      sourceKind: "official_policy_notice",
      publishedAt: Date.UTC(2026, 3, 18, 8, 0, 0),
      ingestedAt: Date.UTC(2026, 3, 18, 8, 1, 0),
      importance: "high",
      directionalView: "neutral",
      directionalConfidence: 52,
      materialityScore: 68,
      tradabilityScore: 44,
      authorityScore: 92,
      freshnessScore: 82,
      surpriseScore: 28,
      affectedMarkets: ["A"],
      impactSummary: ["官方政策确认"],
      degraded: false,
      topicTags: [],
      evidenceCount: 2,
      sourceIds: ["pbc-news", "eastmoney-7x24"],
      evidences: [],
      entities: [],
      facts: [],
      timeline: [
        {
          timelineId: "tl_multi_after_authoritative",
          eventId: "evt_authoritative_first",
          stateTo: "confirmed",
          changedAt: Date.UTC(2026, 3, 18, 8, 10, 0),
          reason: "multi_source_confirmation",
          metadata: {
            sourceId: "eastmoney-7x24",
          },
        },
        {
          timelineId: "tl_authoritative_first",
          eventId: "evt_authoritative_first",
          stateTo: "confirmed",
          changedAt: Date.UTC(2026, 3, 18, 8, 0, 0),
          reason: "authoritative_source_confirmation",
          metadata: {
            sourceId: "pbc-news",
          },
        },
        {
          timelineId: "tl_detected_authoritative_first",
          eventId: "evt_authoritative_first",
          stateTo: "detected",
          changedAt: Date.UTC(2026, 3, 18, 7, 55, 0),
          reason: "new_event",
          metadata: {
            sourceId: "eastmoney-7x24",
          },
        },
      ],
    }

    const projected = projectInvestmentEventDetail(detail)

    expect(projected.timelineSummary.map(entry => entry.label)).toEqual([
      "事件确认",
      "首次识别",
    ])
    expect(projected.timelineSummary[0]?.note).toContain("人民银行")
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

  it("keeps generic exchange disclosures in disclosure family instead of dropping to general news", () => {
    const brief = projectInvestmentEventBrief({
      eventId: "evt_generic_disclosure",
      title: "豪威集团：关于召开2026年第一次临时股东大会的通知",
      eventType: "announcement",
      eventSubType: "other",
      sourceKind: "exchange_disclosure",
      ingestedAt: Date.UTC(2026, 3, 12, 12, 0, 0),
      importance: "medium",
      directionalView: "unknown",
      directionalConfidence: 20,
      materialityScore: 55,
      tradabilityScore: 42,
      authorityScore: 90,
      freshnessScore: 78,
      surpriseScore: 34,
      affectedMarkets: ["A"],
      degraded: false,
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["cninfo-szse"],
    })

    expect(brief.eventFamily).toBe("disclosure_signal")
    expect(brief.eventFamilyLabel).toBe("公告线索")
    expect(brief.whatHappened).toContain("公告线索")
    expect(brief.actionBucket).toBe("watch")
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
    expect(brief.subjectSummary).toBe("发布机构：商务部")
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
      eventSubType: "industry_report",
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
