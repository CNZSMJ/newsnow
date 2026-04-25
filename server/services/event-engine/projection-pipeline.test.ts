import { describe, expect, it } from "vitest"
import type { EventDetail } from "@shared/types"
import type { EventProjectionInput, EventProjectionRecord } from "#/database/event-projections"
import {
  backfillInvestmentProjections,
  checkInvestmentProjectionConsistency,
  computeInvestmentProjectionChecksum,
  refreshInvestmentProjectionForEvent,
  writeInvestmentProjection,
} from "#/services/event-engine/projection-pipeline"

class MemoryProjectionStore {
  readonly upserts: EventProjectionInput[] = []
  readonly records = new Map<string, EventProjectionRecord>()

  async upsertProjection(input: EventProjectionInput) {
    this.upserts.push(input)
    this.records.set(input.eventId, {
      eventId: input.eventId,
      projectionVersion: this.upserts.length,
      projectionUpdatedAt: Date.now(),
      canonicalUpdatedAt: input.canonicalUpdatedAt,
      canonicalChecksum: input.canonicalChecksum,
      repairStatus: "ok",
      brief: input.brief,
      detail: input.detail,
    })
  }

  async getProjection(eventId: string) {
    return this.records.get(eventId)
  }
}

function canonicalEvent(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    eventId: "evt_1",
    title: "人工智能政策发布",
    summary: "人工智能产业政策发布，需跟踪算力和应用链条。",
    eventType: "policy",
    eventSubType: "industrial_policy",
    sourceKind: "media_fast_feed",
    publishedAt: 1700000000000,
    ingestedAt: 1700000005000,
    canonicalUrl: "https://example.com/evt_1",
    primaryEntityName: "人工智能",
    importance: "high",
    sentiment: "positive",
    directionalView: "positive",
    directionalConfidence: 78,
    materialityScore: 86,
    tradabilityScore: 62,
    authorityScore: 74,
    freshnessScore: 80,
    surpriseScore: 35,
    affectedMarkets: ["A"],
    impactSummary: ["政策可能改善 AI/算力产业预期"],
    degraded: false,
    latestLifecycleState: "confirmed",
    latestLifecycleAt: 1700000010000,
    topicTags: ["ai-computing"],
    evidenceCount: 1,
    sourceIds: ["wallstreetcn-quick"],
    evidences: [{
      eventId: "evt_1",
      rawId: "raw_1",
      sourceId: "wallstreetcn-quick",
      sourceName: "华尔街见闻",
      title: "人工智能政策发布",
      url: "https://example.com/raw_1",
      summary: "政策发布",
      publishedAt: 1700000000000,
      fetchedAt: 1700000005000,
      authorityLevel: "media",
      extractionStatus: "ready",
    }],
    entities: [{
      eventId: "evt_1",
      entityType: "industry",
      entityName: "人工智能",
      confidence: 0.92,
      resolver: "test",
    }, {
      eventId: "evt_1",
      entityType: "stock",
      entityName: "寒武纪",
      code: "688256",
      fullCode: "sh688256",
      confidence: 0.86,
      resolver: "test",
    }],
    facts: [{
      factId: "fact_1",
      eventId: "evt_1",
      factType: "policy_signal",
      metricName: "policy_direction",
      value: "AI",
      confidence: 0.8,
    }],
    timeline: [{
      timelineId: "tl_1",
      eventId: "evt_1",
      stateTo: "confirmed",
      changedAt: 1700000010000,
      actor: "event-engine",
      reason: "new_event",
      metadata: { sourceId: "wallstreetcn-quick" },
    }],
    ...overrides,
  }
}

describe("investment projection pipeline", () => {
  it("writes backend-owned investment semantics from canonical detail into projection store", async () => {
    const store = new MemoryProjectionStore()
    const detail = canonicalEvent()

    const input = await writeInvestmentProjection(detail, store, {
      relatedEventIds: ["evt_related"],
      watchlistKeys: ["watchlist:ai"],
    })

    expect(input).toMatchObject({
      eventId: "evt_1",
      canonicalUpdatedAt: 1700000010000,
      canonicalChecksum: computeInvestmentProjectionChecksum(detail),
      brief: expect.objectContaining({
        eventId: "evt_1",
        eventFamily: "policy_signal",
        actionBucket: "watch",
      }),
      detail: expect.objectContaining({
        eventId: "evt_1",
        thesis: expect.any(String),
      }),
      indexedEntities: expect.arrayContaining(["人工智能", "寒武纪", "688256", "sh688256"]),
      relatedEventIds: ["evt_related"],
      watchlistKeys: ["watchlist:ai"],
    })
    expect(store.upserts).toHaveLength(1)
    await expect(store.getProjection("evt_1")).resolves.toMatchObject({
      eventId: "evt_1",
      canonicalChecksum: input.canonicalChecksum,
    })
  })

  it("refreshes projection from canonical store after a canonical event is available", async () => {
    const detail = canonicalEvent()
    const store = new MemoryProjectionStore()
    const canonicalStore = {
      async getEventDetail(eventId: string) {
        return eventId === detail.eventId ? detail : undefined
      },
    }

    await expect(refreshInvestmentProjectionForEvent("missing", canonicalStore, store)).resolves.toMatchObject({
      eventId: "missing",
      status: "missing_canonical",
    })
    await expect(refreshInvestmentProjectionForEvent("evt_1", canonicalStore, store)).resolves.toMatchObject({
      eventId: "evt_1",
      status: "ok",
      expectedChecksum: computeInvestmentProjectionChecksum(detail),
    })
    expect(store.upserts).toHaveLength(1)
  })

  it("detects missing and stale projections by deterministic canonical checksum", async () => {
    const detail = canonicalEvent()
    const store = new MemoryProjectionStore()

    await expect(checkInvestmentProjectionConsistency(detail, store)).resolves.toMatchObject({
      eventId: "evt_1",
      status: "missing",
      expectedChecksum: computeInvestmentProjectionChecksum(detail),
    })

    await writeInvestmentProjection(detail, store)
    await expect(checkInvestmentProjectionConsistency(detail, store)).resolves.toMatchObject({
      eventId: "evt_1",
      status: "ok",
    })

    const record = store.records.get("evt_1")
    expect(record).toBeDefined()
    store.records.set("evt_1", {
      ...record!,
      canonicalChecksum: "old-checksum",
    })

    await expect(checkInvestmentProjectionConsistency(detail, store)).resolves.toMatchObject({
      eventId: "evt_1",
      status: "stale",
      expectedChecksum: computeInvestmentProjectionChecksum(detail),
      actualChecksum: "old-checksum",
    })
  })

  it("backfills missing projection rows from canonical event list", async () => {
    const detail = canonicalEvent()
    const store = new MemoryProjectionStore()
    const canonicalStore = {
      async listEvents() {
        return [{ eventId: detail.eventId }, { eventId: "missing" }]
      },
      async getEventDetail(eventId: string) {
        return eventId === detail.eventId ? detail : undefined
      },
    }

    await expect(backfillInvestmentProjections(canonicalStore, store, {
      limit: 10,
    })).resolves.toEqual({
      scanned: 2,
      written: 1,
      skipped: 0,
      missingCanonical: 1,
    })
    expect(store.upserts).toHaveLength(1)

    await expect(backfillInvestmentProjections(canonicalStore, store, {
      limit: 10,
    })).resolves.toEqual({
      scanned: 2,
      written: 0,
      skipped: 1,
      missingCanonical: 1,
    })
  })
})
