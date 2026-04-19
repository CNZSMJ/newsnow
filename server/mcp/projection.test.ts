import { describe, expect, it } from "vitest"
import type { EventRecord, InvestmentEventDetail, WatchlistDetail } from "@shared/types"
import { toMcpEventBrief, toMcpEventDetail, toMcpWatchlistDetail } from "./projection"

function makeInvestmentDetail(): InvestmentEventDetail {
  return {
    eventId: "evt_1",
    title: "FDR007 下行",
    summary: "资金面改善",
    eventFamily: "rates_liquidity",
    eventFamilyLabel: "资金与利率",
    actionBucket: "actionable",
    actionLabel: "优先处理",
    actionReason: "高权威资金/利率信号已经落地，短线对资金面和利率资产更有直接交易意义。",
    whatHappened: "利率/资金指标更新：FDR007 下行",
    whoIsAffected: ["中国资金面"],
    signalDirection: "positive",
    signalDirectionLabel: "偏正向",
    signalConfidence: 82,
    signalConfidenceInsight: {
      band: "高",
      note: "方向较清晰，可直接用于排序和观察重点。",
    },
    materialityScore: 88,
    materialityInsight: {
      band: "高",
      note: "足以明显改变市场或主体预期，通常应优先处理。",
    },
    tradabilityScore: 84,
    tradabilityInsight: {
      band: "高",
      note: "可以直接进入交易或风控优先队列。",
    },
    authorityScore: 95,
    authorityInsight: {
      band: "高",
      note: "官方、交易所或法定披露级别，通常可作为一手依据。",
    },
    affectedMarkets: ["CN_rates"],
    affectedMarketLabels: ["中国资金面"],
    affectedEntities: [{
      entityId: "CN_rates",
      label: "中国资金面",
      entityType: "market",
      entityTypeLabel: "影响市场",
      market: "CN_rates",
    }],
    primarySubject: {
      entityId: "CN_rates",
      label: "中国资金面",
      entityType: "market",
      entityTypeLabel: "影响市场",
      market: "CN_rates",
    },
    subjectSummary: "影响市场：中国资金面",
    publisherInstitution: "中国货币网",
    whyItMatters: "资金利率回落有助于改善流动性预期。",
    tradableNow: "yes",
    tradableNowLabel: "可交易",
    whatToWatchNext: ["逆回购续作", "DR007/FDR007 后续走势"],
    riskOfMisread: ["单日利率回落可能只是季末扰动缓解"],
    latestLifecycleState: "confirmed",
    latestLifecycleAt: Date.UTC(2026, 3, 12, 11, 31, 0),
    seriesKey: "official_rate_fixing|fdr007",
    periodKey: "2026-04-12",
    releaseCadence: "daily",
    canonicalUrl: "https://example.com/rate",
    relatedTopics: [],
    sourceSummary: {
      primarySourceId: "chinamoney-fdr007",
      primarySourceName: "中国货币网",
      sourceKinds: ["official_rate_fixing"],
    },
    publishedAt: Date.UTC(2026, 3, 12, 11, 30, 0),
    thesis: "利率下行改善短端资金价格预期。",
    keyFacts: [{
      factType: "macro_rate",
      label: "FDR007 利率",
      metricName: "FDR007",
      value: 1.45,
      previousValue: 1.5,
      delta: -0.05,
      unit: "%",
      direction: "down",
      directionLabel: "下行/走弱",
      effectiveAt: Date.UTC(2026, 3, 12, 11, 30, 0),
      confidence: 0.95,
      entity: null,
      evidenceId: "raw_1",
    }],
    evidence: [{
      evidenceId: "raw_1",
      sourceId: "chinamoney-fdr007",
      sourceName: "中国货币网",
      sourceTitle: "FDR007",
      authorityLevel: "official",
      authorityLabel: "官方",
      sourceKind: "official_rate_fixing",
      title: "FDR007 报 1.45%",
      summary: "较前值下行 5bp",
      url: "https://example.com/evidence",
      publishedAt: Date.UTC(2026, 3, 12, 11, 30, 0),
      extractionStatus: "ready",
      extractionStatusLabel: "已结构化",
    }],
    timelineSummary: [{
      timelineId: "tl_1",
      changedAt: Date.UTC(2026, 3, 12, 11, 31, 0),
      state: "confirmed",
      label: "高权威来源确认",
      note: "中国货币网更新当日 FDR007",
      sourceName: "中国货币网",
    }],
    watchTargetCandidates: [],
  }
}

describe("mcp investment projection", () => {
  it("keeps default event detail structured but hides debug internals", () => {
    const detail = toMcpEventDetail(makeInvestmentDetail())

    expect(detail.eventId).toBe("evt_1")
    expect(detail.whatHappened).toContain("利率/资金指标更新")
    expect(detail.whoIsAffected).toEqual(["中国资金面"])
    expect(detail.subjectSummary).toBe("影响市场：中国资金面")
    expect(detail.actionLabel).toBe("优先处理")
    expect(detail.eventFamilyLabel).toBe("资金与利率")
    expect(detail.seriesKey).toBe("official_rate_fixing|fdr007")
    expect(detail.periodKey).toBe("2026-04-12")
    expect(detail.releaseCadence).toBe("daily")
    expect(detail.seriesSummary).toBe("日度序列，当前期次：2026-04-12")
    expect(detail.keyFacts[0]?.label).toBe("FDR007 利率")
    expect(detail.keyFacts[0]?.debug).toBeUndefined()
    expect(detail.evidence[0]?.debug).toBeUndefined()
    expect(detail.timelineSummary[0]?.debug).toBeUndefined()
    expect(detail.sourceSummary.debug).toBeUndefined()
  })

  it("includes debug internals only when debug mode is enabled", () => {
    const detail = toMcpEventDetail(makeInvestmentDetail(), true)

    expect(detail.keyFacts[0]?.debug?.factType).toBe("macro_rate")
    expect(detail.keyFacts[0]?.debug?.evidenceId).toBe("raw_1")
    expect(detail.seriesSummary).toBe("日度序列，当前期次：2026-04-12")
    expect(detail.evidence[0]?.debug?.evidenceId).toBe("raw_1")
    expect(detail.evidence[0]?.debug?.extractionStatus).toBe("ready")
    expect(detail.timelineSummary[0]?.debug?.timelineId).toBe("tl_1")
    expect(detail.sourceSummary.debug?.sourceKinds).toEqual(["official_rate_fixing"])
  })

  it("projects briefs and watchlist details through the same default-safe contract", () => {
    const detail = makeInvestmentDetail()
    const recentEvent: EventRecord = {
      eventId: "evt_1",
      title: "FDR007 下行",
      eventType: "macro",
      eventSubType: "rate_fixing",
      sourceKind: "official_rate_fixing",
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
      topicTags: [],
      evidenceCount: 1,
      sourceIds: ["chinamoney-fdr007"],
    }
    const brief = toMcpEventBrief(detail)
    const watchlist = toMcpWatchlistDetail({
      watchlistId: "wl_1",
      name: "Rates",
      query: {
        markets: ["CN_rates"],
      },
      createdAt: 1,
      updatedAt: 2,
      recentEvents: [recentEvent],
    } as WatchlistDetail)

    expect(brief.actionBucket).toBe("actionable")
    expect(brief.actionLabel).toBe("优先处理")
    expect(brief.seriesSummary).toBe("日度序列，当前期次：2026-04-12")
    expect(watchlist.recentEvents[0]?.eventId).toBe("evt_1")
    expect(watchlist.recentEvents[0]?.sourceSummary.debug).toBeUndefined()
  })
})
