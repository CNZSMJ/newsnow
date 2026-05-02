import { afterEach, describe, expect, it, vi } from "vitest"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { InvestmentEventBrief, InvestmentProviderEventListResponse } from "@shared/types"
import { buildInvestmentProviderMeta } from "#/services/event-engine/provider"
import { getServer } from "./server"

type ToolHandler = (args: Record<string, unknown>, extra: Record<string, unknown>) => Promise<CallToolResult>

function getToolHandler(name: string): ToolHandler {
  const server = getServer() as unknown as {
    _registeredTools: Record<string, { handler: ToolHandler }>
  }
  return server._registeredTools[name].handler
}

function brief(overrides: Partial<InvestmentEventBrief> = {}): InvestmentEventBrief {
  return {
    eventId: overrides.eventId ?? "evt_1",
    title: overrides.title ?? "人工智能政策发布",
    eventFamily: overrides.eventFamily ?? "policy_signal",
    eventFamilyLabel: "政策信号",
    actionBucket: overrides.actionBucket ?? "actionable",
    actionLabel: "优先处理",
    actionReason: "需要评估交易影响",
    whatHappened: "政策发布",
    whoIsAffected: ["产业赛道：AI/算力"],
    signalDirection: overrides.signalDirection ?? "positive",
    signalDirectionLabel: "偏正向",
    signalConfidence: 78,
    signalConfidenceInsight: { band: "中高", note: "方向较清晰" },
    materialityScore: overrides.materialityScore ?? 86,
    materialityInsight: { band: "高", note: "重要" },
    tradabilityScore: overrides.tradabilityScore ?? 70,
    tradabilityInsight: { band: "中高", note: "可跟踪" },
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

function listResponse(items: InvestmentEventBrief[]): InvestmentProviderEventListResponse {
  return {
    status: "success",
    updatedTime: 1700000020000,
    contract: buildInvestmentProviderMeta("event_list"),
    items,
    totalCount: items.length,
    displayedCount: items.length,
    hasMore: false,
  }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "$fetch")
})

describe("mcp investment event tools", () => {
  it("keeps event_get_latest_events structured focus aligned with the query focus", async () => {
    const fetch = vi.fn(async (url: string) => {
      expect(url).toContain("focus=actionable")
      return listResponse([brief({ eventId: "evt_action", actionBucket: "actionable" })])
    })
    ;(globalThis as unknown as Record<string, unknown>).$fetch = fetch

    const result = await getToolHandler("event_get_latest_events")({
      count: 1,
      focus: "actionable",
    }, {})

    expect(result.structuredContent).toMatchObject({
      focus: "actionable",
      focusLabel: "优先处理",
      summary: {
        actionable: 1,
        watch: 0,
        noise: 0,
      },
    })
  })

  it("keeps watchlist_get_events structured focus aligned with the query focus", async () => {
    const fetch = vi.fn(async (url: string) => {
      expect(url).toContain("focus=watchable")
      return listResponse([brief({ eventId: "evt_watch", actionBucket: "watch" })])
    })
    ;(globalThis as unknown as Record<string, unknown>).$fetch = fetch

    const result = await getToolHandler("watchlist_get_events")({
      watchlist_id: "wl_ai",
      count: 1,
      focus: "watchable",
    }, {})

    expect(result.structuredContent).toMatchObject({
      focus: "watchable",
      focusLabel: "优先处理 + 重点观察",
      summary: {
        actionable: 0,
        watch: 1,
        noise: 0,
      },
    })
  })
})
