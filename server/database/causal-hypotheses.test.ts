import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import {
  CAUSAL_HYPOTHESIS_SQL_DECLARATIONS,
  CausalHypothesisTable,
} from "#/database/causal-hypotheses"
import { assertSqlAccessDeclarations } from "#/database/sql-ownership"

const cleanupPaths: string[] = []

afterEach(() => {
  while (cleanupPaths.length) {
    const path = cleanupPaths.pop()
    if (!path) continue
    rmSync(path, { recursive: true, force: true })
  }
})

function createCausalHypothesisTable() {
  const cwd = mkdtempSync(join(tmpdir(), "newsnow-causal-hypothesis-db-"))
  cleanupPaths.push(cwd)
  const db = createDatabase(sqliteConnector({
    cwd,
    name: "causal-hypothesis-test",
  }))
  return { db, table: new CausalHypothesisTable(db) }
}

function runInput(overrides: Partial<Parameters<CausalHypothesisTable["enqueueRun"]>[0]> = {}) {
  return {
    runId: "run_1",
    eventId: "evt_1",
    inputChecksum: "checksum_1",
    inputSnapshot: { title: "政策发布" },
    inputBuilderVersion: "builder-v1",
    outputSnapshot: {},
    modelProvider: "openai",
    modelName: "gpt-5.4-mini",
    promptVersion: "causal-hypothesis-generator-v1",
    triggerSource: "manual_backfill" as const,
    triggerReason: "test",
    attemptNumber: 1,
    nextAttemptAt: 1000,
    createdAt: 1000,
    metadata: {},
    ...overrides,
  }
}

describe("causal hypothesis table", () => {
  it("declares investment-event ownership", () => {
    expect(() => assertSqlAccessDeclarations(CAUSAL_HYPOTHESIS_SQL_DECLARATIONS)).not.toThrow()
  })

  it("creates causal hypothesis tables and queue indexes", async () => {
    const { db, table } = createCausalHypothesisTable()
    await table.init()

    expect(await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'event_causal_hypotheses'").get()).toBeTruthy()
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'event_causal_hypothesis_runs'").get()).toBeTruthy()
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_event_causal_hypothesis_runs_pending'").get()).toBeTruthy()
  })

  it("supersedes older pending runs for the same event generation scope", async () => {
    const { table } = createCausalHypothesisTable()
    await table.init()

    await table.enqueueRun(runInput({ runId: "run_old", inputChecksum: "checksum_old", createdAt: 1000 }))
    await table.enqueueRun(runInput({ runId: "run_new", inputChecksum: "checksum_new", createdAt: 2000 }))

    await expect(table.supersedeOlderPendingRunsForEvent({
      eventId: "evt_1",
      promptVersion: "causal-hypothesis-generator-v1",
      modelName: "gpt-5.4-mini",
      keepRunId: "run_new",
      now: 2100,
    })).resolves.toBe(1)

    await expect(table.getRun("run_old")).resolves.toMatchObject({
      status: "superseded",
      errorCode: "causal_hypothesis_pending_superseded",
      finishedAt: 2100,
      nextAttemptAt: undefined,
    })
    await expect(table.getRun("run_new")).resolves.toMatchObject({
      status: "pending",
    })
  })

  it("compacts pending runs by keeping only the newest pending run per event generation scope", async () => {
    const { table } = createCausalHypothesisTable()
    await table.init()

    await table.enqueueRun(runInput({ runId: "run_evt1_old", eventId: "evt_1", inputChecksum: "checksum_1_old", createdAt: 1000 }))
    await table.enqueueRun(runInput({ runId: "run_evt1_new", eventId: "evt_1", inputChecksum: "checksum_1_new", createdAt: 2000 }))
    await table.enqueueRun(runInput({ runId: "run_evt2_only", eventId: "evt_2", inputChecksum: "checksum_2", createdAt: 1500 }))

    await expect(table.compactPendingRuns({
      now: 2100,
      limit: 100,
    })).resolves.toBe(1)

    await expect(table.getRun("run_evt1_old")).resolves.toMatchObject({
      status: "superseded",
      errorCode: "causal_hypothesis_pending_superseded",
    })
    await expect(table.getRun("run_evt1_new")).resolves.toMatchObject({
      status: "pending",
    })
    await expect(table.getRun("run_evt2_only")).resolves.toMatchObject({
      status: "pending",
    })
  })

  it("claims the newest due pending run first", async () => {
    const { table } = createCausalHypothesisTable()
    await table.init()

    await table.enqueueRun(runInput({ runId: "run_old", eventId: "evt_old", createdAt: 1000, nextAttemptAt: 1000 }))
    await table.enqueueRun(runInput({ runId: "run_new", eventId: "evt_new", createdAt: 2000, nextAttemptAt: 2000 }))

    await expect(table.claimNextPendingRun({
      now: 3000,
      lockOwner: "worker-a",
      leaseMs: 120000,
    })).resolves.toMatchObject({
      runId: "run_new",
      eventId: "evt_new",
      status: "running",
    })
  })

  it("enqueues, de-duplicates, claims, and finishes runs with active hypotheses", async () => {
    const { table } = createCausalHypothesisTable()
    await table.init()

    await table.enqueueRun(runInput())
    await expect(table.findExistingRunForKey({
      eventId: "evt_1",
      inputChecksum: "checksum_1",
      promptVersion: "causal-hypothesis-generator-v1",
      modelName: "gpt-5.4-mini",
    })).resolves.toMatchObject({
      runId: "run_1",
      status: "pending",
      startedAt: undefined,
      createdAt: 1000,
    })

    const claimed = await table.claimNextPendingRun({
      now: 1100,
      lockOwner: "worker-a",
      leaseMs: 120000,
    })
    expect(claimed).toMatchObject({
      runId: "run_1",
      status: "running",
      lockOwner: "worker-a",
      startedAt: 1100,
    })

    await expect(table.finishRunSucceeded({
      runId: "run_1",
      lockOwner: "worker-a",
      now: 1200,
      outputSnapshot: { status: "available" },
      metadata: { acceptedHypothesisCount: 1 },
    })).resolves.toBe(true)

    await table.replaceActiveHypotheses({
      eventId: "evt_1",
      generationRunId: "run_1",
      inputChecksum: "checksum_1",
      modelProvider: "openai",
      modelName: "gpt-5.4-mini",
      promptVersion: "causal-hypothesis-generator-v1",
      generatedAt: 1200,
      hypotheses: [{
        hypothesisId: "hyp_1",
        statement: "政策文件直接推动行业预期改善",
        causeType: "policy_or_regulation",
        causeTypeLabel: "政策/监管",
        basis: "stated",
        basisLabel: "证据显示",
        confidence: 0.86,
        rationale: "证据标题和摘要均指向政策发布。",
        evidenceIds: ["raw_1"],
        factIds: [],
        evidenceSpans: [{
          evidenceId: "raw_1",
          field: "title",
          snippet: "政策发布",
          offset: 0,
        }],
      }],
    })

    await expect(table.readCausalProjection("evt_1")).resolves.toMatchObject({
      causalStatus: "available",
      causalHypotheses: [{
        hypothesisId: "hyp_1",
        basis: "stated",
        evidenceIds: ["raw_1"],
      }],
    })
  })

  it("derives unknown and failed event-level status from latest runs", async () => {
    const { table } = createCausalHypothesisTable()
    await table.init()

    await table.enqueueRun(runInput({ runId: "run_unknown", eventId: "evt_unknown" }))
    const unknownRun = await table.claimNextPendingRun({ now: 1100, lockOwner: "worker-a", leaseMs: 120000 })
    expect(unknownRun?.runId).toBe("run_unknown")
    await table.finishRunUnknown({
      runId: "run_unknown",
      lockOwner: "worker-a",
      now: 1200,
      outputSnapshot: { status: "unknown", unknownReason: "材料不足" },
      metadata: { unknownReason: "材料不足" },
    })

    await table.enqueueRun(runInput({ runId: "run_failed", eventId: "evt_failed" }))
    const failedRun = await table.claimNextPendingRun({ now: 1300, lockOwner: "worker-a", leaseMs: 120000 })
    expect(failedRun?.runId).toBe("run_failed")
    await table.finishRunFailed({
      runId: "run_failed",
      lockOwner: "worker-a",
      now: 1400,
      errorCode: "causal_hypothesis_invalid_references",
      nextAttemptAt: 2000,
      outputSnapshot: { parseStatus: "schema_invalid" },
      metadata: {},
    })

    await expect(table.readCausalProjection("evt_unknown")).resolves.toMatchObject({ causalStatus: "unknown" })
    await expect(table.readCausalProjection("evt_failed")).resolves.toMatchObject({ causalStatus: "failed" })
  })

  it("marks timed-out running runs and lists due failed runs for retry", async () => {
    const { table } = createCausalHypothesisTable()
    await table.init()

    await table.enqueueRun(runInput({ runId: "run_timeout" }))
    await table.claimNextPendingRun({ now: 1100, lockOwner: "worker-a", leaseMs: 50 })

    await expect(table.markTimedOutRuns({ now: 1200, limit: 10 })).resolves.toBe(1)
    await expect(table.getRun("run_timeout")).resolves.toMatchObject({
      status: "failed",
      errorCode: "causal_hypothesis_worker_timeout",
      finishedAt: 1150,
      nextAttemptAt: 1200,
      lockOwner: undefined,
    })
    await expect(table.listDueFailedRunsForRetry({ now: 1200, limit: 10 })).resolves.toEqual([
      expect.objectContaining({ runId: "run_timeout" }),
    ])
  })
})
