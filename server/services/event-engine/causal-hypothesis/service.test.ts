import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import type { EventDetail } from "@shared/types"
import { CausalHypothesisTable } from "#/database/causal-hypotheses"
import availableOutput from "#/services/event-engine/causal-hypothesis/__fixtures__/available-output.json"
import unknownOutput from "#/services/event-engine/causal-hypothesis/__fixtures__/unknown-output.json"
import { buildCausalHypothesisGenerationInput } from "#/services/event-engine/causal-hypothesis/input"
import { validateCausalHypothesisModelOutput } from "#/services/event-engine/causal-hypothesis/quality"
import type { CausalHypothesisGenerator } from "#/services/event-engine/causal-hypothesis/generator"
import {
  enqueueCausalHypothesisGeneration,
  enqueueCausalHypothesisRetry,
  processPendingCausalHypothesisRuns,
} from "#/services/event-engine/causal-hypothesis/service"

const cleanupPaths: string[] = []

afterEach(() => {
  while (cleanupPaths.length) {
    const path = cleanupPaths.pop()
    if (!path) continue
    rmSync(path, { recursive: true, force: true })
  }
})

function createCausalStore() {
  const cwd = mkdtempSync(join(tmpdir(), "newsnow-causal-service-db-"))
  cleanupPaths.push(cwd)
  const db = createDatabase(sqliteConnector({
    cwd,
    name: "causal-service-test",
  }))
  return new CausalHypothesisTable(db)
}

function eventDetail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    eventId: "evt_policy_sector_1",
    title: "主管部门发布供给调整措施，相关板块情绪升温",
    summary: "政策端释放供给约束放松信号，市场报道显示相关板块成交活跃。",
    eventType: "policy",
    eventSubType: "industrial_policy",
    sourceKind: "industry_policy_notice",
    publishedAt: 1770000000000,
    ingestedAt: 1770000001000,
    importance: "high",
    materialityScore: 82,
    tradabilityScore: 74,
    authorityScore: 91,
    affectedMarkets: ["A"],
    latestLifecycleState: "confirmed",
    latestLifecycleAt: 1770000003000,
    topicTags: ["photovoltaic"],
    evidenceCount: 2,
    sourceIds: ["cls-telegraph"],
    evidences: [
      {
        eventId: "evt_policy_sector_1",
        rawId: "ev_policy",
        sourceId: "cls-telegraph",
        sourceName: "主管部门",
        title: "主管部门发布调整措施",
        summary: "主管部门发布调整措施，提出优化供给节奏。",
        url: "https://example.com/policy",
        publishedAt: 1770000000000,
        fetchedAt: 1770000001000,
        sourcePriority: 100,
        authorityLevel: "official",
        extractionStatus: "ready",
      },
      {
        eventId: "evt_policy_sector_1",
        rawId: "ev_market",
        sourceId: "eastmoney-7x24",
        sourceName: "东方财富",
        title: "相关板块情绪升温",
        summary: "市场报道显示相关板块成交活跃。",
        url: "https://example.com/market",
        publishedAt: 1770000002000,
        fetchedAt: 1770000003000,
        sourcePriority: 60,
        authorityLevel: "market_media",
        extractionStatus: "ready",
      },
    ],
    entities: [],
    facts: [{
      factId: "fact_policy_support",
      eventId: "evt_policy_sector_1",
      evidenceId: "ev_policy",
      factType: "policy_notice",
      metricName: "policy_direction",
      value: "supply_adjustment",
      direction: "up",
      confidence: 0.88,
    }],
    timeline: [],
    ...overrides,
  }
}

function createGenerator(output: unknown): CausalHypothesisGenerator {
  return {
    provider: "openai",
    modelName: "gpt-5.4-mini",
    async generate(detail) {
      const generationInput = buildCausalHypothesisGenerationInput(detail, {
        modelProvider: "openai",
        modelName: "gpt-5.4-mini",
      })
      return this.generateFromInput(generationInput)
    },
    async generateFromInput(generationInput) {
      return {
        generationInput,
        validation: validateCausalHypothesisModelOutput(output, {
          selectedEvidenceIds: generationInput.inputSnapshot.evidence.map(evidence => evidence.evidenceId),
          selectedFactIds: generationInput.inputSnapshot.facts.map(fact => fact.factId),
        }),
      }
    },
  }
}

function createThrowingGenerator(error: Error): CausalHypothesisGenerator {
  return {
    provider: "openai",
    modelName: "gpt-5.4-mini",
    async generate(detail) {
      const generationInput = buildCausalHypothesisGenerationInput(detail, {
        modelProvider: "openai",
        modelName: "gpt-5.4-mini",
      })
      return this.generateFromInput(generationInput)
    },
    async generateFromInput() {
      throw error
    },
  }
}

describe("causal hypothesis service", () => {
  it("enqueues one pending run per event input key and skips duplicates", async () => {
    const causalStore = createCausalStore()
    await causalStore.init()
    const detail = eventDetail()
    const eventStore = {
      getEventDetail: vi.fn(async () => detail),
    }
    const generator = createGenerator(availableOutput)

    const first = await enqueueCausalHypothesisGeneration({
      eventId: detail.eventId,
      triggerSource: "manual_backfill",
      triggerReason: "test",
      now: 1000,
    }, {
      causalStore,
      eventStore,
      generator,
    })
    expect(first).toMatchObject({
      status: "queued",
      queued: true,
      eventId: detail.eventId,
    })

    const second = await enqueueCausalHypothesisGeneration({
      eventId: detail.eventId,
      triggerSource: "manual_backfill",
      triggerReason: "duplicate",
      now: 1001,
    }, {
      causalStore,
      eventStore,
      generator,
    })
    expect(second).toMatchObject({
      status: "skipped_existing",
      queued: false,
      eventId: detail.eventId,
    })

    const claimed = await causalStore.claimNextPendingRun({
      now: 1002,
      lockOwner: "test",
      leaseMs: 120000,
    })
    expect(claimed).toMatchObject({
      eventId: detail.eventId,
      modelName: "gpt-5.4-mini",
      triggerSource: "manual_backfill",
      inputBuilderVersion: "causal-hypothesis-input-v1",
      startedAt: 1002,
    })
    expect(claimed?.inputChecksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it("supersedes stale pending runs when the same event is queued with newer input", async () => {
    const causalStore = createCausalStore()
    await causalStore.init()
    let detail = eventDetail({ summary: "第一版事件摘要。" })
    const eventStore = {
      getEventDetail: vi.fn(async () => detail),
    }
    const generator = createGenerator(availableOutput)

    const first = await enqueueCausalHypothesisGeneration({
      eventId: detail.eventId,
      triggerSource: "auto_event_ingest",
      triggerReason: "new_event",
      now: 1000,
    }, {
      causalStore,
      eventStore,
      generator,
    })
    if (first.status !== "queued") throw new Error("expected first run")

    detail = eventDetail({
      summary: "第二版事件摘要，新增市场反应。",
      latestLifecycleAt: 1770000004000,
    })
    const second = await enqueueCausalHypothesisGeneration({
      eventId: detail.eventId,
      triggerSource: "auto_event_ingest",
      triggerReason: "event_updated",
      now: 1100,
    }, {
      causalStore,
      eventStore,
      generator,
    })
    if (second.status !== "queued") throw new Error("expected second run")

    await expect(causalStore.getRun(first.runId)).resolves.toMatchObject({
      status: "superseded",
      errorCode: "causal_hypothesis_pending_superseded",
      finishedAt: 1100,
    })
    await expect(causalStore.getRun(second.runId)).resolves.toMatchObject({
      status: "pending",
    })
  })

  it("does not write a pending run when the generator is unavailable", async () => {
    const causalStore = createCausalStore()
    await causalStore.init()
    const detail = eventDetail()

    const result = await enqueueCausalHypothesisGeneration({
      eventId: detail.eventId,
      triggerSource: "auto_event_ingest",
      triggerReason: "new_event",
      now: 1000,
    }, {
      causalStore,
      eventStore: {
        getEventDetail: vi.fn(async () => detail),
      },
      generator: undefined,
    })

    expect(result).toEqual({
      status: "blocked_by_generator_config",
      queued: false,
      eventId: detail.eventId,
      missingConfig: [],
    })
    await expect(causalStore.claimNextPendingRun({
      now: 1001,
      lockOwner: "test",
      leaseMs: 120000,
    })).resolves.toBeUndefined()
  })

  it("processes a pending run, stores active hypotheses, and refreshes projection", async () => {
    const causalStore = createCausalStore()
    await causalStore.init()
    const detail = eventDetail()
    const eventStore = {
      getEventDetail: vi.fn(async () => detail),
    }
    const projectionStore = {
      upsertProjection: vi.fn(async () => {}),
      getProjection: vi.fn(async () => undefined),
    }
    const generator = createGenerator(availableOutput)

    await enqueueCausalHypothesisGeneration({
      eventId: detail.eventId,
      triggerSource: "manual_backfill",
      triggerReason: "test",
      now: 1000,
    }, {
      causalStore,
      eventStore,
      generator,
    })

    const result = await processPendingCausalHypothesisRuns({
      lockOwner: "worker-a",
      now: 1100,
    }, {
      causalStore,
      eventStore,
      projectionStore,
      generator,
    })

    expect(result).toMatchObject({
      claimedCount: 1,
      succeededCount: 1,
      unknownCount: 0,
      failedCount: 0,
      processedRunIds: [expect.stringMatching(/^chr_/)],
    })
    const projection = await causalStore.readCausalProjection(detail.eventId)
    expect(projection.causalStatus).toBe("available")
    expect(projection.causalHypotheses[0]).toMatchObject({
      causeType: "policy_or_regulation",
      basis: "stated",
      causeTypeLabel: "政策或监管",
      basisLabel: "明示原因",
      evidenceIds: ["ev_policy"],
    })
    expect(projectionStore.upsertProjection).toHaveBeenCalledTimes(1)
  })

  it("processes pending runs in a bounded batch", async () => {
    const causalStore = createCausalStore()
    await causalStore.init()
    const details = [
      eventDetail({ eventId: "evt_batch_1", summary: "第一条批量事件。" }),
      eventDetail({ eventId: "evt_batch_2", summary: "第二条批量事件。" }),
      eventDetail({ eventId: "evt_batch_3", summary: "第三条批量事件。" }),
    ]
    const eventStore = {
      getEventDetail: vi.fn(async (eventId: string) => details.find(detail => detail.eventId === eventId)),
    }
    const generator = createGenerator(availableOutput)

    for (let index = 0; index < details.length; index += 1) {
      await enqueueCausalHypothesisGeneration({
        eventId: details[index]!.eventId,
        triggerSource: "manual_backfill",
        triggerReason: "test",
        now: 1000 + index,
      }, {
        causalStore,
        eventStore,
        generator,
      })
    }

    const result = await processPendingCausalHypothesisRuns({
      lockOwner: "worker-a",
      now: 1100,
      limit: 3,
      concurrency: 2,
      compactPendingLimit: 100,
    }, {
      causalStore,
      eventStore,
      generator,
    })

    expect(result).toMatchObject({
      claimedCount: 3,
      succeededCount: 3,
      unknownCount: 0,
      failedCount: 0,
      supersededCount: 0,
    })
    expect(result.processedRunIds).toHaveLength(3)
  })

  it("processes unknown output by clearing active hypotheses without inventing a cause", async () => {
    const causalStore = createCausalStore()
    await causalStore.init()
    const detail = eventDetail()
    const eventStore = {
      getEventDetail: vi.fn(async () => detail),
    }
    const generator = createGenerator(unknownOutput)

    await enqueueCausalHypothesisGeneration({
      eventId: detail.eventId,
      triggerSource: "manual_backfill",
      triggerReason: "test",
      now: 1000,
    }, {
      causalStore,
      eventStore,
      generator,
    })

    await processPendingCausalHypothesisRuns({
      lockOwner: "worker-a",
      now: 1100,
    }, {
      causalStore,
      eventStore,
      generator,
    })

    await expect(causalStore.readCausalProjection(detail.eventId)).resolves.toMatchObject({
      causalStatus: "unknown",
      causalHypotheses: [],
    })
  })

  it("records provider failures as failed runs without interrupting the worker", async () => {
    const causalStore = createCausalStore()
    await causalStore.init()
    const detail = eventDetail()
    const eventStore = {
      getEventDetail: vi.fn(async () => detail),
    }
    const projectionStore = {
      upsertProjection: vi.fn(async () => {}),
      getProjection: vi.fn(async () => undefined),
    }
    const generator = createThrowingGenerator(new Error("provider unavailable"))

    await enqueueCausalHypothesisGeneration({
      eventId: detail.eventId,
      triggerSource: "manual_backfill",
      triggerReason: "test",
      now: 1000,
    }, {
      causalStore,
      eventStore,
      generator,
    })

    const result = await processPendingCausalHypothesisRuns({
      lockOwner: "worker-a",
      now: 1100,
    }, {
      causalStore,
      eventStore,
      projectionStore,
      generator,
    })
    expect(result).toMatchObject({
      claimedCount: 1,
      failedCount: 1,
      processedRunIds: [expect.stringMatching(/^chr_/)],
    })

    const failedRun = await causalStore.getRun(result.processedRunIds[0]!)
    expect(failedRun).toMatchObject({
      status: "failed",
      errorCode: "causal_hypothesis_provider_transient_error",
    })
    await expect(causalStore.readCausalProjection(detail.eventId)).resolves.toMatchObject({
      causalStatus: "failed",
      causalHypotheses: [],
    })
    expect(projectionStore.upsertProjection).toHaveBeenCalledTimes(1)
  })

  it("creates retry runs from a failed run's saved input identity", async () => {
    const causalStore = createCausalStore()
    await causalStore.init()
    const detail = eventDetail()
    const eventStore = {
      getEventDetail: vi.fn(async () => detail),
    }
    const generator = createGenerator({
      status: "available",
      confidence: 0.7,
      hypotheses: [{
        statement: "引用不存在的证据。",
        causeType: "external_event",
        basis: "inferred",
        confidence: 0.6,
        rationale: "引用不存在。",
        evidenceIds: ["missing_evidence"],
        factIds: [],
        evidenceSpans: [],
      }],
      unknownReason: null,
    })

    const enqueue = await enqueueCausalHypothesisGeneration({
      eventId: detail.eventId,
      triggerSource: "manual_backfill",
      triggerReason: "test",
      now: 1000,
    }, {
      causalStore,
      eventStore,
      generator,
    })
    if (enqueue.status !== "queued") throw new Error("expected initial run")

    await processPendingCausalHypothesisRuns({
      lockOwner: "worker-a",
      now: 1100,
    }, {
      causalStore,
      eventStore,
      generator,
    })
    const failedRun = await causalStore.getRun(enqueue.runId)
    expect(failedRun).toMatchObject({
      status: "failed",
      attemptNumber: 1,
      nextAttemptAt: 301100,
    })

    const retry = await enqueueCausalHypothesisRetry({
      runId: enqueue.runId,
      now: 301100,
    }, {
      causalStore,
      generator,
    })
    expect(retry).toMatchObject({
      status: "queued",
      queued: true,
      eventId: detail.eventId,
      inputChecksum: enqueue.inputChecksum,
    })
    if (retry.status !== "queued") throw new Error("expected retry")

    const retryRun = await causalStore.getRun(retry.runId)
    expect(retryRun).toMatchObject({
      triggerSource: "retry",
      retryOfRunId: enqueue.runId,
      attemptNumber: 2,
      inputChecksum: enqueue.inputChecksum,
    })
  })

  it("does not retry an older failed run when newer event input is already pending", async () => {
    const causalStore = createCausalStore()
    await causalStore.init()
    let detail = eventDetail({ summary: "旧版事件摘要。" })
    const eventStore = {
      getEventDetail: vi.fn(async () => detail),
    }
    const invalidGenerator = createGenerator({
      status: "available",
      confidence: 0.7,
      hypotheses: [{
        statement: "引用不存在的证据。",
        causeType: "external_event",
        basis: "inferred",
        confidence: 0.6,
        rationale: "引用不存在。",
        evidenceIds: ["missing_evidence"],
        factIds: [],
        evidenceSpans: [],
      }],
      unknownReason: null,
    })

    const initial = await enqueueCausalHypothesisGeneration({
      eventId: detail.eventId,
      triggerSource: "manual_backfill",
      triggerReason: "test",
      now: 1000,
    }, {
      causalStore,
      eventStore,
      generator: invalidGenerator,
    })
    if (initial.status !== "queued") throw new Error("expected initial run")

    await processPendingCausalHypothesisRuns({
      lockOwner: "worker-a",
      now: 1100,
    }, {
      causalStore,
      eventStore,
      generator: invalidGenerator,
    })
    await expect(causalStore.getRun(initial.runId)).resolves.toMatchObject({
      status: "failed",
      nextAttemptAt: 301100,
    })

    detail = eventDetail({
      summary: "新版事件摘要，新增市场反应。",
      latestLifecycleAt: 1770000004000,
    })
    const newer = await enqueueCausalHypothesisGeneration({
      eventId: detail.eventId,
      triggerSource: "auto_event_ingest",
      triggerReason: "event_updated",
      now: 2000,
    }, {
      causalStore,
      eventStore,
      generator: createGenerator(availableOutput),
    })
    if (newer.status !== "queued") throw new Error("expected newer run")

    const retry = await enqueueCausalHypothesisRetry({
      runId: initial.runId,
      now: 301100,
    }, {
      causalStore,
      generator: createGenerator(availableOutput),
    })
    expect(retry).toMatchObject({
      status: "skipped_existing",
      queued: false,
      eventId: detail.eventId,
      existingRunId: newer.runId,
      existingStatus: "pending",
      inputChecksum: newer.inputChecksum,
    })
  })
})
