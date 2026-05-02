import { describe, expect, it } from "vitest"
import type { InvestmentEventBrief } from "@shared/types"
import {
  buildInvestmentListResponse,
  parseInvestmentListQuery,
  parseInvestmentSort,
  parseTimestampQuery,
  resolveLifecycleAfter,
} from "../server/api/investment-events/query-adapter"

function brief(overrides: Partial<InvestmentEventBrief> = {}): InvestmentEventBrief {
  return {
    eventId: overrides.eventId ?? "evt_1",
    title: overrides.title ?? "人工智能政策发布",
    eventFamily: overrides.eventFamily ?? "policy_signal",
    eventFamilyLabel: "政策信号",
    actionBucket: overrides.actionBucket ?? "watch",
    actionLabel: "重点观察",
    actionReason: "需要跟踪正式文件",
    whatHappened: "政策发布",
    whoIsAffected: ["产业赛道：AI/算力"],
    signalDirection: overrides.signalDirection ?? "positive",
    signalDirectionLabel: "偏正向",
    signalConfidence: 78,
    signalConfidenceInsight: { band: "中高", note: "方向较清晰" },
    materialityScore: overrides.materialityScore ?? 86,
    materialityInsight: { band: "高", note: "重要" },
    tradabilityScore: overrides.tradabilityScore ?? 62,
    tradabilityInsight: { band: "中等", note: "观察" },
    authorityScore: overrides.authorityScore ?? 74,
    authorityInsight: { band: "中高", note: "可信" },
    affectedMarkets: overrides.affectedMarkets ?? ["A"],
    affectedMarketLabels: ["A股"],
    affectedEntities: [],
    subjectSummary: "AI/算力",
    whyItMatters: "影响产业政策预期",
    tradableNow: overrides.tradableNow ?? "watch",
    tradableNowLabel: "先观察",
    whatToWatchNext: ["跟踪正式文件"],
    riskOfMisread: [],
    relatedTopics: overrides.relatedTopics ?? ["ai-computing"],
    sourceSummary: {
      primarySourceId: "wallstreetcn-quick",
      primarySourceName: "华尔街见闻",
      sourceKinds: ["media_fast_feed"],
    },
    publishedAt: 1700000000000,
    ingestedAt: 1700000005000,
    latestLifecycleAt: 1700000010000,
    ...overrides,
  }
}

describe("investment events query adapter", () => {
  it("parses timestamp query values exactly like the existing routes", () => {
    expect(parseTimestampQuery("1700000000000")).toBe(1700000000000)
    expect(parseTimestampQuery("2026-04-26T00:00:00.000Z")).toBe(Date.parse("2026-04-26T00:00:00.000Z"))
    expect(parseTimestampQuery("   ")).toBeUndefined()
    expect(parseTimestampQuery("not-a-date")).toBeUndefined()
    expect(parseTimestampQuery(["1700000000001", "1700000000002"])).toBe(1700000000001)
    expect(parseTimestampQuery(1700000000000)).toBeUndefined()
  })

  it("resolves list sort and lifecycle timestamps with the current precedence", () => {
    expect(parseInvestmentSort({ sort: "changed" })).toBe("changed")
    expect(parseInvestmentSort({ sort: "latest" })).toBe("latest")
    expect(parseInvestmentSort({ sort: "investment" })).toBe("investment")
    expect(parseInvestmentSort({ latest: "true" })).toBe("latest")
    expect(parseInvestmentSort({ sort: "unknown", latest: "false" })).toBe("investment")

    expect(resolveLifecycleAfter({
      changed_since: "1700000000000",
      lifecycle_after: "1700000000100",
    })).toBe(1700000000100)
    expect(resolveLifecycleAfter({ changed_since: "1700000000000" })).toBe(1700000000000)
  })

  it("parses shared list query options without changing defaults or clamps", () => {
    expect(parseInvestmentListQuery({})).toMatchObject({
      limit: 20,
      focus: "all",
      sortBy: "investment",
    })
    expect(parseInvestmentListQuery({ limit: "not-a-number" }).limit).toBe(20)
    expect(parseInvestmentListQuery({ limit: "-10" }).limit).toBe(1)
    expect(parseInvestmentListQuery({ limit: "999" }).limit).toBe(400)
    expect(parseInvestmentListQuery({
      focus: "actionable",
      event_family: "policy_signal",
      min_materiality_score: "80",
      min_authority_score: "70",
      changed_since: "1700000000000",
      lifecycle_after: "1700000000100",
      market: "A",
      directional_view: "positive",
      series_key: " policy-ai ",
      period_key: " 2026 ",
    })).toMatchObject({
      focus: "actionable",
      eventFamily: "policy_signal",
      minMaterialityScore: 80,
      minAuthorityScore: 70,
      changedSince: 1700000000000,
      lifecycleAfter: 1700000000100,
      market: "A",
      directionalView: "positive",
      seriesKey: "policy-ai",
      periodKey: "2026",
    })
  })

  it("builds the provider event-list response from query-model-filtered results", () => {
    const response = buildInvestmentListResponse({
      updatedAt: 1700000020000,
      totalCount: 3,
      items: [
        brief({ eventId: "evt_watch", actionBucket: "watch", eventFamily: "policy_signal" }),
        brief({ eventId: "evt_trade", actionBucket: "actionable", eventFamily: "policy_signal" }),
        brief({ eventId: "evt_other", actionBucket: "actionable", eventFamily: "earnings" }),
      ],
    })

    expect(response).toMatchObject({
      status: "success",
      updatedTime: 1700000020000,
      totalCount: 3,
      displayedCount: 3,
      hasMore: false,
    })
    expect(response.contract).toMatchObject({
      surface: "event_list",
      projection: "investment",
    })
    expect(response.items.map(item => item.eventId)).toEqual(["evt_watch", "evt_trade", "evt_other"])
  })
})
