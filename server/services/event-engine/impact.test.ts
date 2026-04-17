import { describe, expect, it, vi } from "vitest"
import { buildImpactSnapshot } from "#/services/event-engine/impact"
import type { EventFactRow } from "#/types"

function createFact(overrides: Partial<EventFactRow>): EventFactRow {
  return {
    fact_id: "fact_test",
    event_id: "evt_test",
    evidence_id: "raw_test",
    fact_type: "macro_rate",
    metric_name: "FDR007",
    value: "1.45",
    unit: "%",
    previous_value: "1.50",
    delta: "-5",
    direction: "down",
    effective_at: Date.UTC(2026, 3, 12, 11, 30, 0),
    entity_id: null,
    confidence: 0.95,
    payload_json: "{}",
    ...overrides,
  }
}

function createExchangeAnnouncementFact(payloadOverrides: Record<string, unknown> = {}, factOverrides: Partial<EventFactRow> = {}): EventFactRow {
  return createFact({
    fact_type: "exchange_announcement",
    metric_name: "announcement_meta",
    value: null,
    unit: null,
    delta: null,
    direction: null,
    payload_json: JSON.stringify({
      announcementTitle: "关于交易所公告",
      announcementTypeName: "交易所公告",
      securityCode: "603501",
      securityName: "豪威集团",
      market: "A",
      isFormalDisclosure: true,
      ...payloadOverrides,
    }),
    ...factOverrides,
  })
}

describe("buildImpactSnapshot", () => {
  it("maps falling rate fixing to positive CN rates impact", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-12T12:00:00.000Z"))

    const snapshot = buildImpactSnapshot({
      eventType: "macro",
      eventSubType: "rate_fixing",
      profile: {
        sourceKind: "official_rate_fixing",
        defaultEventType: "macro",
        authorityLevel: "official",
        parserFamily: "macro_rate",
        assetClasses: ["rates"],
        markets: ["CN_rates"],
      },
      publishedAt: Date.UTC(2026, 3, 12, 11, 30, 0),
      facts: [createFact({})],
    })

    expect(snapshot.directionalView).toBe("positive")
    expect(snapshot.affectedMarkets).toContain("CN_rates")
    expect(snapshot.materialityScore).toBeGreaterThanOrEqual(75)
    expect(snapshot.impactSummary.join(" ")).toContain("FDR007")
    vi.useRealTimers()
  })

  it("maps net liquidity injection to positive monetary policy impact", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "policy",
      eventSubType: "monetary_policy",
      profile: {
        sourceKind: "official_central_bank_operation",
        defaultEventType: "policy",
        authorityLevel: "official",
        parserFamily: "central_bank_operation",
        assetClasses: ["rates", "credit"],
        markets: ["CN_rates", "CN_macro"],
      },
      facts: [
        createFact({
          fact_type: "central_bank_operation",
          metric_name: "omo",
          value: "1200",
          unit: "CNY_100M",
          delta: null,
          direction: null,
          payload_json: JSON.stringify({ netDirection: "up" }),
        }),
      ],
    })

    expect(snapshot.directionalView).toBe("positive")
    expect(snapshot.directionalConfidence).toBeGreaterThanOrEqual(80)
    expect(snapshot.tradabilityScore).toBeGreaterThanOrEqual(80)
    expect(snapshot.impactSummary.join(" ")).toContain("净投放")
  })

  it("derives industry release impact from cadence and direction", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "industry",
      eventSubType: "industry_data",
      profile: {
        sourceKind: "industry_stat_release",
        defaultEventType: "industry",
        authorityLevel: "association",
        parserFamily: "industry_stat",
        assetClasses: ["equity", "commodity"],
        markets: ["A", "CN_macro"],
      },
      facts: [
        createFact({
          fact_type: "industry_release",
          metric_name: "粗钢产量月报",
          value: null,
          unit: "monthly",
          delta: null,
          direction: "up",
          payload_json: JSON.stringify({ cadence: "monthly" }),
        }),
      ],
    })

    expect(snapshot.directionalView).toBe("positive")
    expect(snapshot.materialityScore).toBeGreaterThanOrEqual(65)
    expect(snapshot.tradabilityScore).toBeGreaterThanOrEqual(50)
    expect(snapshot.impactSummary.join(" ")).toContain("月度口径")
  })

  it("renders media fast rumor clarification in investor-readable language", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "announcement",
      eventSubType: "contract",
      profile: {
        sourceKind: "media_fast_feed",
        defaultEventType: "news",
        authorityLevel: "media",
        parserFamily: "media_fast",
        assetClasses: ["equity"],
        markets: ["A", "HK"],
      },
      facts: [
        createFact({
          fact_type: "media_fast_signal",
          metric_name: "media_fast_signal",
          value: null,
          unit: null,
          delta: null,
          direction: "flat",
          payload_json: JSON.stringify({
            market: "A",
            text: "中际旭创回应称市场传言不属实，公司订单获取及产品交付均在正常有序进行。",
          }),
        }),
      ],
    })

    expect(snapshot.directionalView).toBe("neutral")
    expect(snapshot.impactSummary.join(" ")).toContain("传闻")
    expect(snapshot.impactSummary.join(" ")).toContain("偏中性")
    expect(snapshot.impactSummary.join(" ")).not.toContain("media_fast_signal")
    expect(snapshot.impactSummary.join(" ")).not.toContain("neutral")
  })

  it("keeps media interpretation signals below direct trading priority", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "news",
      eventSubType: "analysis_signal",
      profile: {
        sourceKind: "media_fast_feed",
        defaultEventType: "news",
        authorityLevel: "media",
        parserFamily: "media_fast",
        assetClasses: ["equity"],
        markets: ["A", "HK"],
      },
      facts: [
        createFact({
          fact_type: "media_fast_signal",
          metric_name: "analysis_signal",
          value: "18.35",
          unit: "%",
          delta: null,
          direction: null,
          payload_json: JSON.stringify({
            text: "《电报解读》追踪到储能电芯供不应求，本文提及鹏辉能源，其4日最高涨18.35%。",
          }),
        }),
      ],
    })

    expect(snapshot.materialityScore).toBeLessThan(70)
    expect(snapshot.tradabilityScore).toBeLessThan(45)
    expect(snapshot.impactSummary.join(" ")).toContain("媒体解读")
    expect(snapshot.impactSummary.join(" ")).toContain("不等于新的正式披露")
  })

  it("uses announcement facts to mark equity financing as negative and materially relevant", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "announcement",
      eventSubType: "financing",
      profile: {
        sourceKind: "exchange_disclosure",
        defaultEventType: "announcement",
        authorityLevel: "exchange",
        parserFamily: "exchange_announcement",
        assetClasses: ["equity"],
        markets: ["A"],
      },
      facts: [
        createExchangeAnnouncementFact({
          announcementTitle: "关于向特定对象发行股票预案的公告",
          announcementTypeName: "再融资",
          actionKind: "equity_issuance",
          financingPath: "equity_issuance",
          announcementStage: "preliminary",
        }),
      ],
    })

    expect(snapshot.directionalView).toBe("negative")
    expect(snapshot.materialityScore).toBeGreaterThanOrEqual(68)
    expect(snapshot.tradabilityScore).toBeGreaterThanOrEqual(50)
    expect(snapshot.impactSummary.join(" ")).toContain("豪威集团")
    expect(snapshot.impactSummary.join(" ")).toContain("再融资")
    expect(snapshot.impactSummary.join(" ")).toContain("稀释压力")
  })

  it("keeps buyback announcements positive but still bounded on tradability", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "announcement",
      eventSubType: "buyback",
      profile: {
        sourceKind: "exchange_disclosure",
        defaultEventType: "announcement",
        authorityLevel: "exchange",
        parserFamily: "exchange_announcement",
        assetClasses: ["equity"],
        markets: ["A"],
      },
      facts: [
        createExchangeAnnouncementFact({
          announcementTitle: "关于回购股份方案的公告",
          announcementTypeName: "回购",
          actionKind: "buyback",
        }),
      ],
    })

    expect(snapshot.directionalView).toBe("positive")
    expect(snapshot.materialityScore).toBeGreaterThanOrEqual(70)
    expect(snapshot.tradabilityScore).toBeGreaterThanOrEqual(60)
    expect(snapshot.impactSummary.join(" ")).toContain("回购")
    expect(snapshot.impactSummary.join(" ")).toContain("正式披露")
  })

  it("marks dividend announcements positive but not as an immediate trigger", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "announcement",
      eventSubType: "dividend",
      profile: {
        sourceKind: "exchange_disclosure",
        defaultEventType: "announcement",
        authorityLevel: "exchange",
        parserFamily: "exchange_announcement",
        assetClasses: ["equity"],
        markets: ["A"],
      },
      facts: [
        createExchangeAnnouncementFact({
          announcementTitle: "关于2025年度利润分配预案的公告",
          announcementTypeName: "权益分派",
          actionKind: "dividend",
          announcementStage: "proposal",
        }),
      ],
    })

    expect(snapshot.directionalView).toBe("positive")
    expect(snapshot.materialityScore).toBeGreaterThanOrEqual(60)
    expect(snapshot.tradabilityScore).toBeGreaterThanOrEqual(40)
    expect(snapshot.impactSummary.join(" ")).toContain("分红")
    expect(snapshot.impactSummary.join(" ")).toContain("前置披露阶段")
  })

  it("uses ownership direction to distinguish shareholding increases from decreases", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "announcement",
      eventSubType: "shareholding_change",
      profile: {
        sourceKind: "exchange_disclosure",
        defaultEventType: "announcement",
        authorityLevel: "exchange",
        parserFamily: "exchange_announcement",
        assetClasses: ["equity"],
        markets: ["A"],
      },
      facts: [
        createExchangeAnnouncementFact({
          announcementTitle: "关于控股股东减持股份预披露公告",
          announcementTypeName: "股东持股变动",
          ownershipDirection: "decrease",
          actionKind: "shareholding_change",
        }),
      ],
    })

    expect(snapshot.directionalView).toBe("negative")
    expect(snapshot.materialityScore).toBeGreaterThanOrEqual(65)
    expect(snapshot.tradabilityScore).toBeGreaterThanOrEqual(55)
    expect(snapshot.impactSummary.join(" ")).toContain("减持")
    expect(snapshot.impactSummary.join(" ")).toContain("持股变动")
  })

  it("keeps generic exchange announcements conservative while preserving disclosure priority", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "announcement",
      eventSubType: "other",
      profile: {
        sourceKind: "exchange_disclosure",
        defaultEventType: "announcement",
        authorityLevel: "exchange",
        parserFamily: "exchange_announcement",
        assetClasses: ["equity"],
        markets: ["A"],
      },
      facts: [
        createExchangeAnnouncementFact({
          announcementTitle: "关于收到问询函的公告",
          announcementTypeName: "交易所公告",
          announcementStage: "implementation",
        }),
      ],
    })

    expect(snapshot.directionalView).toBe("neutral")
    expect(snapshot.materialityScore).toBeGreaterThanOrEqual(55)
    expect(snapshot.tradabilityScore).toBeGreaterThanOrEqual(40)
    expect(snapshot.impactSummary.join(" ")).toContain("正式披露")
    expect(snapshot.impactSummary.join(" ")).toContain("信息确认度更高")
  })

  it("treats event-cadence industry releases as theme catalysts instead of statistical prints", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "industry",
      eventSubType: "industry_data",
      profile: {
        sourceKind: "industry_stat_release",
        defaultEventType: "industry",
        authorityLevel: "association",
        parserFamily: "industry_stat",
        assetClasses: ["equity", "commodity"],
        markets: ["A", "HK", "CN_macro"],
      },
      facts: [
        createFact({
          fact_type: "industry_release",
          metric_name: "日本或将对国产电动汽车电池和半导体实行税收减免",
          value: null,
          unit: "event",
          delta: null,
          direction: null,
          payload_json: JSON.stringify({ cadence: "event" }),
        }),
      ],
    })

    expect(snapshot.impactSummary.join(" ")).toContain("行业动态")
    expect(snapshot.impactSummary.join(" ")).toContain("主题催化线索")
  })

  it("treats industry news facts as industry dynamics rather than data releases", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "industry",
      eventSubType: "industry_news",
      profile: {
        sourceKind: "industry_news_feed",
        defaultEventType: "industry",
        defaultEventSubType: "industry_news",
        authorityLevel: "association",
        parserFamily: "industry_news",
        assetClasses: ["equity", "commodity"],
        markets: ["A", "HK", "CN_macro"],
      },
      facts: [
        createFact({
          fact_type: "industry_news",
          metric_name: "日本或将对国产电动汽车电池和半导体实行税收减免",
          value: null,
          unit: "event",
          delta: null,
          direction: null,
          payload_json: JSON.stringify({ cadence: "event" }),
        }),
      ],
    })

    expect(snapshot.impactSummary.join(" ")).toContain("行业动态")
    expect(snapshot.impactSummary.join(" ")).toContain("订单、价格、产能、补贴或供应链")
    expect(snapshot.impactSummary.join(" ")).not.toContain("产业数据发布")
  })

  it("treats industry report facts as research material rather than trading triggers", () => {
    const snapshot = buildImpactSnapshot({
      eventType: "industry",
      eventSubType: "industry_data",
      profile: {
        sourceKind: "industry_report_release",
        defaultEventType: "industry",
        defaultEventSubType: "industry_data",
        authorityLevel: "association",
        parserFamily: "industry_report",
        assetClasses: ["equity", "commodity"],
        markets: ["A", "HK", "CN_macro"],
      },
      facts: [
        createFact({
          fact_type: "industry_report",
          metric_name: "中国算力发展指数白皮书（2026年）",
          value: null,
          unit: "annual",
          delta: null,
          direction: null,
          payload_json: JSON.stringify({ cadence: "annual" }),
        }),
      ],
    })

    expect(snapshot.impactSummary.join(" ")).toContain("行业报告")
    expect(snapshot.impactSummary.join(" ")).toContain("研究型材料")
    expect(snapshot.tradabilityScore).toBeLessThanOrEqual(40)
  })
})
