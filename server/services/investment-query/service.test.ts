import { describe, expect, it } from "vitest"
import type { InvestmentEventBrief } from "@shared/types"
import type { EventProjectionQueryOptions, EventProjectionRecord } from "#/database/event-projections"
import { InvestmentQueryService } from "#/services/investment-query/service"

class MemoryProjectionQueryStore {
  readonly listCalls: EventProjectionQueryOptions[] = []
  readonly countCalls: EventProjectionQueryOptions[] = []

  constructor(private readonly records: EventProjectionRecord[]) {}

  async listProjections(options: EventProjectionQueryOptions) {
    this.listCalls.push(options)
    return this.records.slice(0, options.limit)
  }

  async countProjections(options: EventProjectionQueryOptions) {
    this.countCalls.push(options)
    return this.records.length
  }
}

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
    signalDirection: "positive",
    signalDirectionLabel: "偏正向",
    signalConfidence: 78,
    signalConfidenceInsight: { band: "中高", note: "方向较清晰" },
    materialityScore: 86,
    materialityInsight: { band: "高", note: "重要" },
    tradabilityScore: 62,
    tradabilityInsight: { band: "中等", note: "观察" },
    authorityScore: 74,
    authorityInsight: { band: "中高", note: "可信" },
    affectedMarkets: ["A"],
    affectedMarketLabels: ["A股"],
    affectedEntities: [{
      entityId: "sh688256",
      label: "寒武纪",
      entityType: "security",
      entityTypeLabel: "交易标的",
      code: "688256",
      market: "A",
    }],
    primarySubject: {
      entityId: "sh688256",
      label: "寒武纪",
      entityType: "security",
      entityTypeLabel: "交易标的",
      code: "688256",
      market: "A",
    },
    subjectSummary: "寒武纪",
    whyItMatters: "影响 AI/算力产业预期",
    tradableNow: "watch",
    tradableNowLabel: "先观察",
    whatToWatchNext: ["跟踪正式文件"],
    riskOfMisread: [],
    relatedTopics: ["ai-computing"],
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

function projection(record = brief()): EventProjectionRecord {
  return {
    eventId: record.eventId,
    projectionVersion: 1,
    projectionUpdatedAt: 1700000010000,
    canonicalUpdatedAt: 1700000010000,
    canonicalChecksum: "checksum",
    repairStatus: "ok",
    brief: record,
  }
}

describe("investmentQueryService", () => {
  it("reads latest events from the projection latest index", async () => {
    const store = new MemoryProjectionQueryStore([projection()])
    const service = new InvestmentQueryService(store)

    await expect(service.listLatestEvents({
      limit: 10,
      topic: "ai-computing",
      sortBy: "investment",
    })).resolves.toMatchObject({
      items: [{ eventId: "evt_1", eventFamily: "policy_signal" }],
      totalCount: 1,
    })

    expect(store.listCalls[0]).toMatchObject({
      indexName: "latest",
      indexValue: "all",
      limit: 10,
      topic: "ai-computing",
      sortBy: "investment",
    })
    expect(store.countCalls[0]).toMatchObject({
      indexName: "latest",
      indexValue: "all",
      topic: "ai-computing",
    })
  })

  it("normalizes search and entity queries before reading projection indexes", async () => {
    const store = new MemoryProjectionQueryStore([projection()])
    const service = new InvestmentQueryService(store)

    await service.searchEvents({
      q: "  AI 政策  ",
      limit: 5,
      includeTotalCount: false,
    })
    await service.getEntityEvents({
      entity: " SH688256 ",
      limit: 5,
      includeTotalCount: false,
    })

    expect(store.listCalls[0]).toMatchObject({
      q: "ai 政策",
      limit: 5,
    })
    expect(store.listCalls[1]).toMatchObject({
      indexName: "entity",
      indexValue: "sh688256",
      limit: 5,
    })
    expect(store.countCalls).toHaveLength(0)
  })

  it("does not query the projection store for empty search or entity input", async () => {
    const store = new MemoryProjectionQueryStore([projection()])
    const service = new InvestmentQueryService(store)

    await expect(service.searchEvents({ q: "  " })).resolves.toMatchObject({
      items: [],
      totalCount: 0,
    })
    await expect(service.getEntityEvents({ entity: "  " })).resolves.toMatchObject({
      items: [],
      totalCount: 0,
    })
    expect(store.listCalls).toHaveLength(0)
    expect(store.countCalls).toHaveLength(0)
  })
})
