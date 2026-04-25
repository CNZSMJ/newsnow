import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import type { InvestmentEventBrief, InvestmentEventDetail } from "@shared/types"
import {
  EVENT_PROJECTION_SQL_DECLARATIONS,
  EventProjectionTable,
  REQUIRED_EVENT_QUERY_INDEX_NAMES,
} from "#/database/event-projections"
import { assertSqlAccessDeclarations } from "#/database/sql-ownership"

const cleanupPaths: string[] = []

afterEach(() => {
  while (cleanupPaths.length) {
    const path = cleanupPaths.pop()
    if (!path) continue
    rmSync(path, { recursive: true, force: true })
  }
})

function createProjectionTable() {
  const cwd = mkdtempSync(join(tmpdir(), "newsnow-event-projection-db-"))
  cleanupPaths.push(cwd)
  const db = createDatabase(sqliteConnector({
    cwd,
    name: "event-projection-test",
  }))
  return { db, table: new EventProjectionTable(db) }
}

function brief(overrides: Partial<InvestmentEventBrief> = {}): InvestmentEventBrief {
  return {
    eventId: overrides.eventId ?? "evt_1",
    title: overrides.title ?? "政策发布",
    eventFamily: overrides.eventFamily ?? "policy",
    eventFamilyLabel: "政策",
    actionBucket: overrides.actionBucket ?? "watch",
    actionLabel: "重点观察",
    actionReason: "需要跟踪正式文件",
    whatHappened: "发布政策",
    whoIsAffected: ["产业赛道：AI"],
    signalDirection: overrides.signalDirection ?? "positive",
    signalDirectionLabel: "偏正向",
    signalConfidence: 70,
    signalConfidenceInsight: { band: "中高", note: "方向较清晰" },
    materialityScore: overrides.materialityScore ?? 80,
    materialityInsight: { band: "高", note: "重要" },
    tradabilityScore: overrides.tradabilityScore ?? 55,
    tradabilityInsight: { band: "中等", note: "观察" },
    authorityScore: overrides.authorityScore ?? 90,
    authorityInsight: { band: "高", note: "官方" },
    affectedMarkets: overrides.affectedMarkets ?? ["A"],
    affectedMarketLabels: ["A股"],
    affectedEntities: [{
      entityId: "人工智能",
      label: "人工智能",
      entityType: "industry",
      entityTypeLabel: "产业赛道",
    }],
    subjectSummary: "核心赛道：人工智能",
    whyItMatters: "影响产业政策预期",
    tradableNow: "watch",
    tradableNowLabel: "先观察",
    whatToWatchNext: ["跟踪正式文件"],
    riskOfMisread: [],
    latestLifecycleAt: overrides.latestLifecycleAt ?? 2000,
    relatedTopics: overrides.relatedTopics ?? ["ai-computing"],
    sourceSummary: {
      primarySourceId: "wallstreetcn-quick",
      primarySourceName: "华尔街见闻",
      sourceKinds: ["media_fast_feed"],
    },
    publishedAt: overrides.publishedAt ?? 1500,
    ingestedAt: overrides.ingestedAt ?? 1600,
    ...overrides,
  }
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

describe("eventProjectionTable", () => {
  it("declares investment-event ownership and required query indexes", () => {
    expect(() => assertSqlAccessDeclarations(EVENT_PROJECTION_SQL_DECLARATIONS)).not.toThrow()
    expect(REQUIRED_EVENT_QUERY_INDEX_NAMES).toEqual(expect.arrayContaining([
      "latest",
      "search",
      "entity",
      "topic",
      "source",
      "market",
      "watchlist",
      "detail",
      "related",
    ]))
  })

  it("stores projection rows and query indexes for latest/search/entity/detail surfaces", async () => {
    const { table } = createProjectionTable()
    await table.init()

    await table.upsertProjection({
      eventId: "evt_1",
      canonicalUpdatedAt: 1600,
      canonicalChecksum: "checksum-1",
      brief: brief(),
      detail: detail(),
      eventType: "policy",
      eventSubType: "industrial_policy",
      sourceKind: "media_fast_feed",
      sourceIds: ["wallstreetcn-quick"],
      seriesKey: "policy-ai",
      periodKey: "2026",
      indexedEntities: ["人工智能"],
      relatedEventIds: ["evt_related"],
      watchlistKeys: ["wl_ai"],
    })
    await table.upsertProjection({
      eventId: "evt_related",
      canonicalUpdatedAt: 1500,
      canonicalChecksum: "checksum-related",
      brief: brief({
        eventId: "evt_related",
        title: "相关政策跟踪",
        latestLifecycleAt: 1500,
      }),
      detail: detail(brief({
        eventId: "evt_related",
        title: "相关政策跟踪",
        latestLifecycleAt: 1500,
      })),
      eventType: "policy",
      eventSubType: "industrial_policy",
      sourceKind: "media_fast_feed",
      sourceIds: ["wallstreetcn-quick"],
      indexedEntities: ["人工智能"],
    })

    await expect(table.getProjection("evt_1")).resolves.toMatchObject({
      eventId: "evt_1",
      canonicalChecksum: "checksum-1",
      brief: expect.objectContaining({
        eventId: "evt_1",
        eventFamily: "policy",
      }),
      detail: expect.objectContaining({
        eventId: "evt_1",
        thesis: "先观察政策落地",
      }),
    })
    await expect(table.listIndexEntries("latest", "all")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "evt_1" }),
      expect.objectContaining({ eventId: "evt_related" }),
    ]))
    await expect(table.listIndexEntries("entity", "人工智能")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "evt_1" }),
      expect.objectContaining({ eventId: "evt_related" }),
    ]))
    await expect(table.listIndexEntries("topic", "ai-computing")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "evt_1" }),
      expect.objectContaining({ eventId: "evt_related" }),
    ]))
    await expect(table.listIndexEntries("source", "wallstreetcn-quick")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "evt_1" }),
      expect.objectContaining({ eventId: "evt_related" }),
    ]))
    await expect(table.listIndexEntries("market", "A")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "evt_1" }),
      expect.objectContaining({ eventId: "evt_related" }),
    ]))
    await expect(table.listIndexEntries("detail", "evt_1")).resolves.toMatchObject([
      { eventId: "evt_1" },
    ])
    await expect(table.listIndexEntries("watchlist", "wl_ai")).resolves.toMatchObject([
      { eventId: "evt_1" },
    ])
    await expect(table.listIndexEntries("related", "evt_1")).resolves.toMatchObject([
      { eventId: "evt_related", metadata: { relatedTo: "evt_1" } },
    ])
    await expect(table.listProjections({
      indexName: "latest",
      indexValue: "all",
      eventType: "policy",
      eventSubType: "industrial_policy",
      sourceId: "wallstreetcn-quick",
      topic: "ai-computing",
      market: "A",
      seriesKey: "policy-ai",
      periodKey: "2026",
      limit: 5,
    })).resolves.toMatchObject([
      { eventId: "evt_1" },
    ])
    await expect(table.listProjections({
      indexName: "entity",
      indexValue: "人工智能",
      limit: 5,
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "evt_1" }),
      expect.objectContaining({ eventId: "evt_related" }),
    ]))
    await expect(table.listProjections({
      indexName: "watchlist",
      indexValue: "wl_ai",
      limit: 5,
    })).resolves.toMatchObject([
      { eventId: "evt_1" },
    ])
    await expect(table.listProjections({
      indexName: "related",
      indexValue: "evt_1",
      limit: 5,
    })).resolves.toMatchObject([
      { eventId: "evt_related" },
    ])
    await expect(table.countProjections({
      q: "政策",
      limit: 5,
    })).resolves.toBe(2)
  })

  it("keeps deferred future publications below currently observable latest events", async () => {
    const { table } = createProjectionTable()
    await table.init()
    const now = Date.now()

    await table.upsertProjection({
      eventId: "evt_future_publish",
      canonicalUpdatedAt: now - 10 * 60 * 1000,
      canonicalChecksum: "checksum-future",
      brief: brief({
        eventId: "evt_future_publish",
        title: "未来发布时间事件",
        publishedAt: now + 2 * 60 * 60 * 1000,
        latestLifecycleAt: now - 10 * 60 * 1000,
        ingestedAt: now - 10 * 60 * 1000,
      }),
      eventType: "policy",
      sourceKind: "media_fast_feed",
      sourceIds: ["wallstreetcn-quick"],
    })
    await table.upsertProjection({
      eventId: "evt_current",
      canonicalUpdatedAt: now - 5 * 60 * 1000,
      canonicalChecksum: "checksum-current",
      brief: brief({
        eventId: "evt_current",
        title: "当前已发布事件",
        publishedAt: now - 5 * 60 * 1000,
        latestLifecycleAt: now - 5 * 60 * 1000,
        ingestedAt: now - 5 * 60 * 1000,
      }),
      eventType: "policy",
      sourceKind: "media_fast_feed",
      sourceIds: ["wallstreetcn-quick"],
    })

    await expect(table.listProjections({
      indexName: "latest",
      indexValue: "all",
      sortBy: "latest",
      limit: 2,
    })).resolves.toMatchObject([
      { eventId: "evt_current" },
      { eventId: "evt_future_publish" },
    ])
  })
})
