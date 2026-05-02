import { describe, expect, it } from "vitest"
import type { InvestmentEventBrief, InvestmentEventDetail } from "@shared/types"
import type { EventProjectionQueryOptions, EventProjectionRecord } from "#/database/event-projections"
import { InvestmentQueryService } from "#/services/investment-query/service"

class MemoryProjectionQueryStore {
  readonly listCalls: EventProjectionQueryOptions[] = []
  readonly countCalls: EventProjectionQueryOptions[] = []
  readonly getCalls: string[] = []

  constructor(
    private readonly records: EventProjectionRecord[],
    private readonly relatedIndex: Record<string, string[]> = {},
  ) {}

  private filterRecords(options: EventProjectionQueryOptions) {
    return this.records.filter((record) => {
      if (options.indexName === "entity" && options.indexValue) {
        const values = [
          ...record.brief.affectedEntities.flatMap(entity => [entity.entityId, entity.label, entity.code]),
          record.brief.primarySubject?.entityId,
          record.brief.primarySubject?.label,
          record.brief.primarySubject?.code,
        ].filter(Boolean).map(value => String(value).toLowerCase())
        if (!values.includes(options.indexValue.toLowerCase())) return false
      }
      if (options.indexName === "topic" && options.indexValue) {
        if (!(record.brief.relatedTopics as readonly string[]).includes(options.indexValue)) return false
      }
      if (options.indexName === "source" && options.indexValue) {
        if (!(record.sourceIds as readonly string[]).includes(options.indexValue)) return false
      }
      if (options.indexName === "market" && options.indexValue) {
        if (!(record.brief.affectedMarkets as readonly string[]).includes(options.indexValue)) return false
      }
      if (options.indexName === "related" && options.indexValue) {
        const relatedEventIds = this.relatedIndex[options.indexValue] ?? ["evt_related"]
        if (!relatedEventIds.includes(record.eventId)) return false
      }
      if (options.topic && !(record.brief.relatedTopics as readonly string[]).includes(options.topic)) return false
      if (options.market && !record.brief.affectedMarkets.includes(options.market)) return false
      if (options.sourceId && !record.sourceIds.includes(options.sourceId)) return false
      if (options.sourceIds?.length && !options.sourceIds.some(sourceId => record.sourceIds.includes(sourceId))) return false
      if (options.eventType && record.eventType !== options.eventType) return false
      if (options.eventSubType && record.eventSubType !== options.eventSubType) return false
      if (options.eventFamily && record.brief.eventFamily !== options.eventFamily) return false
      if (options.actionBuckets?.length && !options.actionBuckets.includes(record.brief.actionBucket)) return false
      if (options.directionalView && record.brief.signalDirection !== options.directionalView) return false
      if (options.minMaterialityScore !== undefined && record.brief.materialityScore < options.minMaterialityScore) return false
      if (options.minAuthorityScore !== undefined && record.brief.authorityScore < options.minAuthorityScore) return false
      return true
    })
  }

  async listProjections(options: EventProjectionQueryOptions) {
    this.listCalls.push(options)
    const rows = this.filterRecords(options)
    return rows.slice(0, options.limit)
  }

  async countProjections(options: EventProjectionQueryOptions) {
    this.countCalls.push(options)
    return this.filterRecords(options).length
  }

  async getProjection(eventId: string) {
    this.getCalls.push(eventId)
    return this.records.find(record => record.eventId === eventId)
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
    eventType: record.eventType,
    eventSubType: "industrial_policy",
    sourceKind: record.sourceKind,
    eventFamily: record.eventFamily,
    sourceIds: [record.sourceSummary.primarySourceId ?? "wallstreetcn-quick"],
    brief: record,
    detail: detail(record),
  }
}

function differentEntityBrief(overrides: Partial<InvestmentEventBrief> = {}): InvestmentEventBrief {
  return brief({
    affectedEntities: [{
      entityId: "other",
      label: "其他公司",
      entityType: "security",
      entityTypeLabel: "交易标的",
      code: "000001",
      market: "A",
    }],
    primarySubject: {
      entityId: "other",
      label: "其他公司",
      entityType: "security",
      entityTypeLabel: "交易标的",
      code: "000001",
      market: "A",
    },
    subjectSummary: "其他公司",
    ...overrides,
  })
}

function detail(input = brief()): InvestmentEventDetail {
  return {
    ...input,
    thesis: "先观察政策落地",
    keyFacts: [],
    evidence: [],
    timelineSummary: [],
    watchTargetCandidates: [],
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

  it("applies event family and focus filters inside the projection query model", async () => {
    const store = new MemoryProjectionQueryStore([
      projection(brief({ eventId: "evt_watch_policy", eventFamily: "policy_signal", actionBucket: "watch" })),
      projection(brief({ eventId: "evt_action_policy", eventFamily: "policy_signal", actionBucket: "actionable" })),
      projection(brief({ eventId: "evt_noise_policy", eventFamily: "policy_signal", actionBucket: "noise" })),
      projection(brief({ eventId: "evt_action_earnings", eventFamily: "earnings", actionBucket: "actionable" })),
    ])
    const service = new InvestmentQueryService(store)

    await expect(service.listLatestEvents({
      limit: 10,
      eventFamily: "policy_signal",
      focus: "watchable",
    })).resolves.toMatchObject({
      items: [
        expect.objectContaining({ eventId: "evt_watch_policy" }),
        expect.objectContaining({ eventId: "evt_action_policy" }),
      ],
      totalCount: 2,
    })
    expect(store.listCalls[0]).toMatchObject({
      eventFamily: "policy_signal",
      actionBuckets: ["actionable", "watch"],
    })
    expect(store.countCalls[0]).toMatchObject({
      eventFamily: "policy_signal",
      actionBuckets: ["actionable", "watch"],
    })
  })

  it("reads detail and related sections from projection records", async () => {
    const store = new MemoryProjectionQueryStore([
      projection(),
      projection(brief({
        eventId: "evt_related",
        title: "人工智能算力投资跟踪",
      })),
    ])
    const service = new InvestmentQueryService(store)

    const eventDetail = await service.getEventDetail("evt_1")

    expect(eventDetail).toMatchObject({
      eventId: "evt_1",
      thesis: "先观察政策落地",
      relatedEvents: [
        expect.objectContaining({
          context: "entity",
          items: [expect.objectContaining({ eventId: "evt_related" })],
        }),
      ],
    })
    expect(store.getCalls).toEqual(["evt_1"])
    expect(store.listCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexName: "related", indexValue: "evt_1" }),
      expect.objectContaining({ indexName: "entity", indexValue: "sh688256" }),
      expect.objectContaining({ topic: "ai-computing" }),
      expect.objectContaining({ market: "A" }),
      expect.objectContaining({ eventFamily: "policy_signal" }),
    ]))
  })

  it("orders related sections, prioritizes indexed related, dedupes across sections, and clamps limits", async () => {
    const store = new MemoryProjectionQueryStore([
      projection(),
      projection(brief({
        eventId: "evt_related",
        title: "索引相关事件",
      })),
      projection(brief({
        eventId: "evt_entity",
        title: "同主体事件",
        eventFamily: "earnings",
        relatedTopics: ["medicine"],
        affectedMarkets: ["HK"],
      })),
      projection(differentEntityBrief({
        eventId: "evt_topic",
        title: "同主题事件",
        eventFamily: "industry_data",
        relatedTopics: ["ai-computing"],
        affectedMarkets: ["global_macro"],
      })),
      projection(differentEntityBrief({
        eventId: "evt_market",
        title: "同市场事件",
        eventFamily: "financing",
        relatedTopics: ["steel"],
        affectedMarkets: ["A"],
      })),
      projection(differentEntityBrief({
        eventId: "evt_family",
        title: "同事件族事件",
        eventFamily: "policy_signal",
        relatedTopics: ["medicine"],
        affectedMarkets: ["HK"],
      })),
    ], {
      evt_1: ["evt_related"],
    })
    const service = new InvestmentQueryService(store)

    const sections = await service.getRelatedEvents(detail(), {
      limitPerSection: 0,
      sortBy: "latest",
    })

    expect(sections.map(section => section.context)).toEqual(["entity", "topic", "market", "family"])
    expect(sections.map(section => section.items.map(item => item.eventId))).toEqual([
      ["evt_related"],
      ["evt_topic"],
      ["evt_market"],
      ["evt_family"],
    ])
    expect(sections.flatMap(section => section.items.map(item => item.eventId))).not.toContain("evt_1")
    expect(store.listCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexName: "related", indexValue: "evt_1", limit: 6, sortBy: "latest" }),
      expect.objectContaining({ indexName: "entity", indexValue: "sh688256", limit: 6, sortBy: "latest" }),
      expect.objectContaining({ topic: "ai-computing", limit: 6, sortBy: "latest" }),
      expect.objectContaining({ market: "A", limit: 6, sortBy: "latest" }),
      expect.objectContaining({ eventFamily: "policy_signal", limit: 6, sortBy: "latest" }),
    ]))
  })

  it("matches watchlist event-read through projection records without canonical fanout", async () => {
    const store = new MemoryProjectionQueryStore([
      projection(),
      projection(brief({
        eventId: "evt_unmatched",
        title: "消费政策",
        relatedTopics: ["medicine"],
        affectedEntities: [{
          entityId: "medicine",
          label: "医药",
          entityType: "industry",
          entityTypeLabel: "产业赛道",
        }],
      })),
    ])
    const service = new InvestmentQueryService(store)

    await expect(service.getWatchlistEvents({
      entities: ["寒武纪"],
      topics: ["ai-computing"],
      sourceIds: ["wallstreetcn-quick"],
      markets: ["A"],
      directionalViews: ["positive"],
      minMaterialityScore: 80,
    }, {
      limit: 5,
      sortBy: "investment",
    })).resolves.toMatchObject({
      items: [expect.objectContaining({ eventId: "evt_1" })],
      totalCount: 1,
    })
    expect(store.listCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexName: "entity", indexValue: "寒武纪", sortBy: "investment" }),
      expect.objectContaining({ indexName: "topic", indexValue: "ai-computing", sortBy: "investment" }),
      expect.objectContaining({ indexName: "source", indexValue: "wallstreetcn-quick", sortBy: "investment" }),
      expect.objectContaining({ indexName: "market", indexValue: "A", sortBy: "investment" }),
    ]))
    expect(store.listCalls).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ indexName: "latest", indexValue: "all" }),
    ]))
  })

  it("counts filtered watchlist matches before applying the response limit", async () => {
    const store = new MemoryProjectionQueryStore([
      projection(brief({ eventId: "evt_action_new", actionBucket: "actionable", latestLifecycleAt: 1700000040000 })),
      projection(brief({ eventId: "evt_watch", actionBucket: "watch", latestLifecycleAt: 1700000030000 })),
      projection(brief({ eventId: "evt_noise", actionBucket: "noise", latestLifecycleAt: 1700000020000 })),
      projection(brief({ eventId: "evt_action_old", actionBucket: "actionable", latestLifecycleAt: 1700000010000 })),
    ])
    const service = new InvestmentQueryService(store)

    await expect(service.getWatchlistEvents({
      topics: ["ai-computing"],
    }, {
      limit: 2,
      focus: "watchable",
      sortBy: "latest",
    })).resolves.toMatchObject({
      items: [
        expect.objectContaining({ eventId: "evt_action_new" }),
        expect.objectContaining({ eventId: "evt_watch" }),
      ],
      totalCount: 3,
    })
    expect(store.listCalls[0]).toMatchObject({
      indexName: "topic",
      indexValue: "ai-computing",
      actionBuckets: ["actionable", "watch"],
    })
  })

  it("queries indexed watchlist seeds instead of bounded global latest slices", async () => {
    const store = new MemoryProjectionQueryStore([
      projection(brief({
        eventId: "evt_hot",
        title: "热门但无关事件",
        affectedEntities: [{
          entityId: "hot",
          label: "热门公司",
          entityType: "security",
          entityTypeLabel: "交易标的",
        }],
        primarySubject: {
          entityId: "hot",
          label: "热门公司",
          entityType: "security",
          entityTypeLabel: "交易标的",
        },
        subjectSummary: "热门公司",
        relatedTopics: ["steel"],
        latestLifecycleAt: 1700000030000,
      })),
      projection(brief({
        eventId: "evt_cold",
        title: "冷门公司事件",
        affectedEntities: [{
          entityId: "cold",
          label: "冷门公司",
          entityType: "security",
          entityTypeLabel: "交易标的",
        }],
        primarySubject: {
          entityId: "cold",
          label: "冷门公司",
          entityType: "security",
          entityTypeLabel: "交易标的",
        },
        subjectSummary: "冷门公司",
        latestLifecycleAt: 1700000001000,
      })),
    ])
    const service = new InvestmentQueryService(store)

    await expect(service.getWatchlistEvents({
      entities: ["冷门公司"],
    }, {
      limit: 1,
      scanLimit: 1,
      sortBy: "latest",
    })).resolves.toMatchObject({
      items: [expect.objectContaining({ eventId: "evt_cold" })],
      totalCount: 1,
    })
    expect(store.listCalls).toEqual([
      expect.objectContaining({
        indexName: "entity",
        indexValue: "冷门公司",
        limit: 1,
        sortBy: "latest",
      }),
    ])
  })
})
