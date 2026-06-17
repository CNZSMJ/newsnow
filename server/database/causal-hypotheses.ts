import { AsyncLocalStorage } from "node:async_hooks"
import process from "node:process"
import type {
  InvestmentCausalHypothesis,
  InvestmentCausalHypothesisBasis,
  InvestmentCausalHypothesisCauseType,
  InvestmentCausalStatus,
  InvestmentEvidenceSpan,
} from "@shared/types"
import type { Database } from "db0"
import { getRows, parseJSON } from "#/database/sqlite"
import { declareSqlAccess } from "#/database/sql-ownership"

export const CAUSAL_HYPOTHESIS_SQL_DECLARATIONS = [
  declareSqlAccess({
    name: "causal_hypothesis_schema",
    owner: "investment-event",
    tables: ["event_causal_hypotheses", "event_causal_hypothesis_runs"],
    decisionRefs: ["TD-29", "TD-30", "TD-166"],
  }),
  declareSqlAccess({
    name: "causal_hypothesis_run_queue",
    owner: "investment-event",
    tables: ["event_causal_hypothesis_runs"],
    decisionRefs: ["TD-31", "TD-132"],
  }),
  declareSqlAccess({
    name: "causal_hypothesis_projection_read",
    owner: "investment-event",
    tables: ["event_causal_hypotheses", "event_causal_hypothesis_runs"],
    decisionRefs: ["TD-8", "TD-24"],
  }),
] as const

export type CausalHypothesisStatus = "active" | "superseded" | "retracted" | "failed"
export type CausalHypothesisRunStatus = "pending" | "running" | "succeeded" | "unknown" | "failed" | "superseded"
export type CausalHypothesisTriggerSource = "auto_event_ingest" | "facts_updated" | "manual_backfill" | "manual_repair" | "retry"

export interface CausalHypothesisRunRecord {
  runId: string
  eventId: string
  inputChecksum: string
  inputSnapshot: Record<string, unknown>
  inputBuilderVersion: string
  outputSnapshot: Record<string, unknown>
  modelProvider?: string
  modelName?: string
  promptVersion?: string
  triggerSource: CausalHypothesisTriggerSource
  triggerReason?: string
  retryOfRunId?: string
  status: CausalHypothesisRunStatus
  errorCode?: string
  attemptNumber: number
  nextAttemptAt?: number
  lockedAt?: number
  lockOwner?: string
  leaseExpiresAt?: number
  createdAt: number
  startedAt?: number
  finishedAt?: number
  metadata: Record<string, unknown>
}

export interface CausalHypothesisDedupeKey {
  eventId: string
  inputChecksum: string
  promptVersion?: string
  modelName?: string
}

export interface CausalHypothesisGenerationScopeKey {
  eventId: string
  promptVersion?: string
  modelName?: string
}

export interface CausalHypothesisRunInsertInput extends CausalHypothesisDedupeKey {
  runId: string
  inputSnapshot: Record<string, unknown>
  inputBuilderVersion: string
  outputSnapshot?: Record<string, unknown>
  modelProvider?: string
  triggerSource: CausalHypothesisTriggerSource
  triggerReason?: string
  retryOfRunId?: string
  attemptNumber?: number
  nextAttemptAt?: number
  createdAt?: number
  metadata?: Record<string, unknown>
}

export interface CausalHypothesisRunSuccessInput {
  runId: string
  lockOwner: string
  now: number
  outputSnapshot: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface CausalHypothesisRunUnknownInput extends CausalHypothesisRunSuccessInput {}

export interface CausalHypothesisRunFailureInput extends CausalHypothesisRunSuccessInput {
  errorCode: string
  nextAttemptAt?: number | null
}

export interface SupersedePendingCausalHypothesisRunsInput {
  eventId: string
  promptVersion?: string
  modelName?: string
  keepRunId: string
  now: number
}

export interface CompactPendingCausalHypothesisRunsInput {
  now: number
  limit: number
}

export interface ReplaceActiveCausalHypothesisInput {
  eventId: string
  generationRunId: string
  inputChecksum: string
  modelProvider?: string
  modelName?: string
  promptVersion?: string
  generatedAt: number
  hypotheses: Array<Omit<InvestmentCausalHypothesis, "generatedAt">>
}

export interface CausalHypothesisProjection {
  causalStatus: InvestmentCausalStatus
  causalHypotheses: InvestmentCausalHypothesis[]
}

export interface CausalHypothesisOpsStatus {
  pendingRunCount: number
  runningRunCount: number
  availableEventCount: number
  failedEventCount: number
  unknownEventCount: number
  permanentProviderErrorCount: number
  latestPermanentProviderErrorAt: number | null
}

interface CausalHypothesisRunRow {
  run_id: string
  event_id: string
  input_checksum: string
  input_snapshot_json: string
  input_builder_version: string
  output_snapshot_json: string
  model_provider: string | null
  model_name: string | null
  prompt_version: string | null
  trigger_source: CausalHypothesisTriggerSource
  trigger_reason: string | null
  retry_of_run_id: string | null
  status: CausalHypothesisRunStatus
  error_code: string | null
  attempt_number: number
  next_attempt_at: number | null
  locked_at: number | null
  lock_owner: string | null
  lease_expires_at: number | null
  created_at: number
  started_at: number | null
  finished_at: number | null
  metadata_json: string
}

interface CausalHypothesisRow {
  hypothesis_id: string
  event_id: string
  statement: string
  cause_type: InvestmentCausalHypothesisCauseType
  cause_type_label: string
  basis: InvestmentCausalHypothesisBasis
  basis_label: string
  confidence: number
  rationale: string
  evidence_ids_json: string
  fact_ids_json: string
  evidence_spans_json: string
  model_provider: string | null
  model_name: string | null
  prompt_version: string | null
  input_checksum: string
  generation_run_id: string | null
  status: CausalHypothesisStatus
  created_at: number
  superseded_at: number | null
  metadata_json: string
}

function optionalString(value: string | null | undefined) {
  return value ?? undefined
}

function optionalNumber(value: number | null | undefined) {
  return typeof value === "number" ? value : undefined
}

function toRunRecord(row: CausalHypothesisRunRow): CausalHypothesisRunRecord {
  return {
    runId: row.run_id,
    eventId: row.event_id,
    inputChecksum: row.input_checksum,
    inputSnapshot: parseJSON<Record<string, unknown>>(row.input_snapshot_json, {}),
    inputBuilderVersion: row.input_builder_version,
    outputSnapshot: parseJSON<Record<string, unknown>>(row.output_snapshot_json, {}),
    modelProvider: optionalString(row.model_provider),
    modelName: optionalString(row.model_name),
    promptVersion: optionalString(row.prompt_version),
    triggerSource: row.trigger_source,
    triggerReason: optionalString(row.trigger_reason),
    retryOfRunId: optionalString(row.retry_of_run_id),
    status: row.status,
    errorCode: optionalString(row.error_code),
    attemptNumber: Number(row.attempt_number) || 1,
    nextAttemptAt: optionalNumber(row.next_attempt_at),
    lockedAt: optionalNumber(row.locked_at),
    lockOwner: optionalString(row.lock_owner),
    leaseExpiresAt: optionalNumber(row.lease_expires_at),
    createdAt: row.created_at,
    startedAt: optionalNumber(row.started_at),
    finishedAt: optionalNumber(row.finished_at),
    metadata: parseJSON<Record<string, unknown>>(row.metadata_json, {}),
  }
}

function toInvestmentCausalHypothesis(row: CausalHypothesisRow): InvestmentCausalHypothesis {
  return {
    hypothesisId: row.hypothesis_id,
    statement: row.statement,
    causeType: row.cause_type,
    causeTypeLabel: row.cause_type_label,
    basis: row.basis,
    basisLabel: row.basis_label,
    confidence: Number(row.confidence) || 0,
    rationale: row.rationale,
    evidenceIds: parseJSON<string[]>(row.evidence_ids_json, []),
    factIds: parseJSON<string[]>(row.fact_ids_json, []),
    evidenceSpans: parseJSON<InvestmentEvidenceSpan[]>(row.evidence_spans_json, []),
    generatedAt: row.created_at,
  }
}

function serialize(value: Record<string, unknown> | unknown[]) {
  return JSON.stringify(value)
}

export class CausalHypothesisTable {
  private db
  private transactionDepth = 0
  private transactionLock: Promise<void> = Promise.resolve()
  private transactionContext = new AsyncLocalStorage<boolean>()

  constructor(db: Database) {
    this.db = db
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.transactionContext.getStore()) {
      return this.runTransaction(fn)
    }

    const releaseLock = await this.acquireTransactionLock()
    try {
      return await this.transactionContext.run(true, () => this.runTransaction(fn))
    } finally {
      releaseLock()
    }
  }

  private async acquireTransactionLock() {
    let releaseLock = () => {}
    const previousLock = this.transactionLock
    this.transactionLock = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    await previousLock
    return releaseLock
  }

  private async runTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const transactionId = this.transactionDepth
    const savepointName = `causal_hypothesis_tx_${transactionId}`

    if (this.transactionDepth === 0) {
      await this.db.prepare("BEGIN IMMEDIATE").run()
    } else {
      await this.db.prepare(`SAVEPOINT ${savepointName}`).run()
    }

    this.transactionDepth += 1
    try {
      const result = await fn()
      this.transactionDepth -= 1
      if (this.transactionDepth === 0) {
        await this.db.prepare("COMMIT").run()
      } else {
        await this.db.prepare(`RELEASE SAVEPOINT ${savepointName}`).run()
      }
      return result
    } catch (error) {
      this.transactionDepth -= 1
      if (this.transactionDepth === 0) {
        await this.db.prepare("ROLLBACK").run()
      } else {
        await this.db.prepare(`ROLLBACK TO SAVEPOINT ${savepointName}`).run()
        await this.db.prepare(`RELEASE SAVEPOINT ${savepointName}`).run()
      }
      throw error
    }
  }

  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS event_causal_hypotheses (
        hypothesis_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        statement TEXT NOT NULL,
        cause_type TEXT NOT NULL,
        cause_type_label TEXT NOT NULL,
        basis TEXT NOT NULL,
        basis_label TEXT NOT NULL,
        confidence REAL NOT NULL,
        rationale TEXT NOT NULL,
        evidence_ids_json TEXT NOT NULL DEFAULT '[]',
        fact_ids_json TEXT NOT NULL DEFAULT '[]',
        evidence_spans_json TEXT NOT NULL DEFAULT '[]',
        model_provider TEXT,
        model_name TEXT,
        prompt_version TEXT,
        input_checksum TEXT NOT NULL,
        generation_run_id TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        superseded_at INTEGER,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
    `).run()
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS event_causal_hypothesis_runs (
        run_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        input_checksum TEXT NOT NULL,
        input_snapshot_json TEXT NOT NULL DEFAULT '{}',
        input_builder_version TEXT NOT NULL,
        output_snapshot_json TEXT NOT NULL DEFAULT '{}',
        model_provider TEXT,
        model_name TEXT,
        prompt_version TEXT,
        trigger_source TEXT NOT NULL,
        trigger_reason TEXT,
        retry_of_run_id TEXT,
        status TEXT NOT NULL,
        error_code TEXT,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        next_attempt_at INTEGER,
        locked_at INTEGER,
        lock_owner TEXT,
        lease_expires_at INTEGER,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
    `).run()
    await this.ensureColumn("event_causal_hypotheses", "cause_type_label", "TEXT NOT NULL DEFAULT ''")
    await this.ensureColumn("event_causal_hypotheses", "basis_label", "TEXT NOT NULL DEFAULT ''")
    await this.ensureColumn("event_causal_hypothesis_runs", "created_at", "INTEGER NOT NULL DEFAULT 0")
    await this.ensureColumn("event_causal_hypothesis_runs", "started_at", "INTEGER")
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_causal_hypotheses_event_active
      ON event_causal_hypotheses(event_id, status, confidence DESC);
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_causal_hypotheses_event_checksum
      ON event_causal_hypotheses(event_id, input_checksum);
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_causal_hypotheses_generation_run
      ON event_causal_hypotheses(generation_run_id);
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_causal_hypothesis_runs_event_created
      ON event_causal_hypothesis_runs(event_id, created_at DESC);
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_causal_hypothesis_runs_checksum_status
      ON event_causal_hypothesis_runs(input_checksum, status);
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_causal_hypothesis_runs_dedupe
      ON event_causal_hypothesis_runs(event_id, input_checksum, prompt_version, model_name, status);
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_causal_hypothesis_runs_pending
      ON event_causal_hypothesis_runs(status, next_attempt_at, created_at, run_id);
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_causal_hypothesis_runs_pending_recent
      ON event_causal_hypothesis_runs(status, next_attempt_at, created_at DESC, run_id DESC);
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_causal_hypothesis_runs_lease
      ON event_causal_hypothesis_runs(status, lease_expires_at);
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_causal_hypothesis_runs_pending_scope
      ON event_causal_hypothesis_runs(event_id, prompt_version, model_name, status, created_at DESC, run_id DESC);
    `).run()
  }

  async enqueueRun(input: CausalHypothesisRunInsertInput): Promise<CausalHypothesisRunRecord> {
    const createdAt = input.createdAt ?? Date.now()
    await this.db.prepare(`
      INSERT INTO event_causal_hypothesis_runs (
        run_id,
        event_id,
        input_checksum,
        input_snapshot_json,
        input_builder_version,
        output_snapshot_json,
        model_provider,
        model_name,
        prompt_version,
        trigger_source,
        trigger_reason,
        retry_of_run_id,
        status,
        error_code,
        attempt_number,
        next_attempt_at,
        locked_at,
        lock_owner,
        lease_expires_at,
        created_at,
        started_at,
        finished_at,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?)
    `).run(
      input.runId,
      input.eventId,
      input.inputChecksum,
      serialize(input.inputSnapshot),
      input.inputBuilderVersion,
      serialize(input.outputSnapshot ?? {}),
      input.modelProvider ?? null,
      input.modelName ?? null,
      input.promptVersion ?? null,
      input.triggerSource,
      input.triggerReason ?? null,
      input.retryOfRunId ?? null,
      input.attemptNumber ?? 1,
      input.nextAttemptAt ?? createdAt,
      createdAt,
      serialize(input.metadata ?? {}),
    )

    const run = await this.getRun(input.runId)
    if (!run) throw new Error(`Failed to enqueue causal hypothesis run: ${input.runId}`)
    return run
  }

  async getRun(runId: string): Promise<CausalHypothesisRunRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT *
      FROM event_causal_hypothesis_runs
      WHERE run_id = ?
    `).get(runId) as CausalHypothesisRunRow | undefined
    return row ? toRunRecord(row) : undefined
  }

  async findExistingRunForKey(input: CausalHypothesisDedupeKey): Promise<CausalHypothesisRunRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT *
      FROM event_causal_hypothesis_runs
      WHERE event_id = ?
        AND input_checksum = ?
        AND COALESCE(prompt_version, '') = COALESCE(?, '')
        AND COALESCE(model_name, '') = COALESCE(?, '')
        AND status IN ('pending', 'running', 'succeeded', 'unknown')
      ORDER BY created_at DESC, run_id DESC
      LIMIT 1
    `).get(
      input.eventId,
      input.inputChecksum,
      input.promptVersion ?? null,
      input.modelName ?? null,
    ) as CausalHypothesisRunRow | undefined
    return row ? toRunRecord(row) : undefined
  }

  async findLatestRunForGenerationScope(input: CausalHypothesisGenerationScopeKey): Promise<CausalHypothesisRunRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT *
      FROM event_causal_hypothesis_runs
      WHERE event_id = ?
        AND COALESCE(prompt_version, '') = COALESCE(?, '')
        AND COALESCE(model_name, '') = COALESCE(?, '')
        AND status <> 'superseded'
      ORDER BY created_at DESC, run_id DESC
      LIMIT 1
    `).get(
      input.eventId,
      input.promptVersion ?? null,
      input.modelName ?? null,
    ) as CausalHypothesisRunRow | undefined
    return row ? toRunRecord(row) : undefined
  }

  async supersedeOlderPendingRunsForEvent(input: SupersedePendingCausalHypothesisRunsInput): Promise<number> {
    const rows = getRows<CausalHypothesisRunRow>(await this.db.prepare(`
      UPDATE event_causal_hypothesis_runs
      SET status = 'superseded',
          error_code = 'causal_hypothesis_pending_superseded',
          output_snapshot_json = ?,
          metadata_json = ?,
          next_attempt_at = NULL,
          finished_at = ?,
          locked_at = NULL,
          lock_owner = NULL,
          lease_expires_at = NULL
      WHERE event_id = ?
        AND COALESCE(prompt_version, '') = COALESCE(?, '')
        AND COALESCE(model_name, '') = COALESCE(?, '')
        AND status = 'pending'
        AND run_id <> ?
      RETURNING *
    `).all(
      serialize({
        parseStatus: "not_generated",
        errorCode: "causal_hypothesis_pending_superseded",
      }),
      serialize({
        supersededByRunId: input.keepRunId,
      }),
      input.now,
      input.eventId,
      input.promptVersion ?? null,
      input.modelName ?? null,
      input.keepRunId,
    ))
    return rows.length
  }

  async compactPendingRuns(input: CompactPendingCausalHypothesisRunsInput): Promise<number> {
    const limit = Math.max(1, input.limit)
    const rows = getRows<CausalHypothesisRunRow>(await this.db.prepare(`
      WITH ranked_pending AS (
        SELECT
          run_id,
          FIRST_VALUE(run_id) OVER (
            PARTITION BY event_id, COALESCE(prompt_version, ''), COALESCE(model_name, '')
            ORDER BY created_at DESC, run_id DESC
          ) AS keep_run_id,
          ROW_NUMBER() OVER (
            PARTITION BY event_id, COALESCE(prompt_version, ''), COALESCE(model_name, '')
            ORDER BY created_at DESC, run_id DESC
          ) AS pending_rank
        FROM event_causal_hypothesis_runs
        WHERE status = 'pending'
      ),
      stale_pending AS (
        SELECT run_id, keep_run_id
        FROM ranked_pending
        WHERE pending_rank > 1
        LIMIT ?
      )
      UPDATE event_causal_hypothesis_runs
      SET status = 'superseded',
          error_code = 'causal_hypothesis_pending_superseded',
          output_snapshot_json = ?,
          metadata_json = json_object(
            'supersededByRunId',
            (SELECT keep_run_id FROM stale_pending WHERE stale_pending.run_id = event_causal_hypothesis_runs.run_id)
          ),
          next_attempt_at = NULL,
          finished_at = ?,
          locked_at = NULL,
          lock_owner = NULL,
          lease_expires_at = NULL
      WHERE run_id IN (SELECT run_id FROM stale_pending)
      RETURNING *
    `).all(
      limit,
      serialize({
        parseStatus: "not_generated",
        errorCode: "causal_hypothesis_pending_superseded",
      }),
      input.now,
    ))
    return rows.length
  }

  async claimNextPendingRun(input: { now: number, lockOwner: string, leaseMs: number }): Promise<CausalHypothesisRunRecord | undefined> {
    const row = await this.db.prepare(`
      UPDATE event_causal_hypothesis_runs
      SET status = 'running',
          locked_at = ?,
          lock_owner = ?,
          lease_expires_at = ?,
          started_at = ?
      WHERE run_id = (
        SELECT run_id
        FROM event_causal_hypothesis_runs
        WHERE status = 'pending'
          AND COALESCE(next_attempt_at, created_at) <= ?
        ORDER BY created_at DESC, run_id DESC
        LIMIT 1
      )
        AND status = 'pending'
      RETURNING *
    `).get(
      input.now,
      input.lockOwner,
      input.now + input.leaseMs,
      input.now,
      input.now,
    ) as CausalHypothesisRunRow | undefined
    return row ? toRunRecord(row) : undefined
  }

  async markTimedOutRuns(input: { now: number, limit: number }): Promise<number> {
    const rows = getRows<CausalHypothesisRunRow>(await this.db.prepare(`
      UPDATE event_causal_hypothesis_runs
      SET status = 'failed',
          error_code = 'causal_hypothesis_worker_timeout',
          finished_at = lease_expires_at,
          next_attempt_at = ?,
          locked_at = NULL,
          lock_owner = NULL,
          lease_expires_at = NULL
      WHERE run_id IN (
        SELECT run_id
        FROM event_causal_hypothesis_runs
        WHERE status = 'running'
          AND lease_expires_at < ?
        ORDER BY lease_expires_at ASC, created_at ASC, run_id ASC
        LIMIT ?
      )
      RETURNING *
    `).all(input.now, input.now, input.limit))
    return rows.length
  }

  async listDueFailedRunsForRetry(input: { now: number, limit: number }): Promise<CausalHypothesisRunRecord[]> {
    const rows = getRows<CausalHypothesisRunRow>(await this.db.prepare(`
      SELECT *
      FROM event_causal_hypothesis_runs
      WHERE status = 'failed'
        AND next_attempt_at IS NOT NULL
        AND next_attempt_at <= ?
      ORDER BY next_attempt_at ASC, created_at ASC, run_id ASC
      LIMIT ?
    `).all(input.now, input.limit))
    return rows.map(toRunRecord)
  }

  async finishRunSucceeded(input: CausalHypothesisRunSuccessInput): Promise<boolean> {
    return this.finishRunningRun("succeeded", input)
  }

  async finishRunUnknown(input: CausalHypothesisRunUnknownInput): Promise<boolean> {
    return this.finishRunningRun("unknown", input)
  }

  async finishRunFailed(input: CausalHypothesisRunFailureInput): Promise<boolean> {
    return this.finishRunningRun("failed", input, input.errorCode, input.nextAttemptAt ?? null)
  }

  async replaceActiveHypotheses(input: ReplaceActiveCausalHypothesisInput): Promise<void> {
    await this.withTransaction(async () => {
      await this.db.prepare(`
        UPDATE event_causal_hypotheses
        SET status = 'superseded',
            superseded_at = ?
        WHERE event_id = ?
          AND status = 'active'
      `).run(input.generatedAt, input.eventId)

      const insert = this.db.prepare(`
        INSERT INTO event_causal_hypotheses (
          hypothesis_id,
          event_id,
          statement,
          cause_type,
          cause_type_label,
          basis,
          basis_label,
          confidence,
          rationale,
          evidence_ids_json,
          fact_ids_json,
          evidence_spans_json,
          model_provider,
          model_name,
          prompt_version,
          input_checksum,
          generation_run_id,
          status,
          created_at,
          superseded_at,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, '{}')
      `)

      for (const hypothesis of input.hypotheses.slice(0, 3)) {
        await insert.run(
          hypothesis.hypothesisId,
          input.eventId,
          hypothesis.statement,
          hypothesis.causeType,
          hypothesis.causeTypeLabel,
          hypothesis.basis,
          hypothesis.basisLabel,
          hypothesis.confidence,
          hypothesis.rationale,
          serialize(hypothesis.evidenceIds),
          serialize(hypothesis.factIds),
          serialize(hypothesis.evidenceSpans),
          input.modelProvider ?? null,
          input.modelName ?? null,
          input.promptVersion ?? null,
          input.inputChecksum,
          input.generationRunId,
          input.generatedAt,
        )
      }
    })
  }

  async readCausalProjection(eventId: string): Promise<CausalHypothesisProjection> {
    const causalHypotheses = await this.listActiveHypotheses(eventId)
    if (causalHypotheses.length) {
      return {
        causalStatus: "available",
        causalHypotheses,
      }
    }

    return {
      causalStatus: await this.getCausalStatusForEvent(eventId),
      causalHypotheses: [],
    }
  }

  async getCausalStatusForEvent(eventId: string): Promise<InvestmentCausalStatus> {
    const row = await this.db.prepare(`
      SELECT status
      FROM event_causal_hypothesis_runs
      WHERE event_id = ?
        AND status <> 'superseded'
      ORDER BY COALESCE(finished_at, started_at, created_at) DESC, created_at DESC, run_id DESC
      LIMIT 1
    `).get(eventId) as Pick<CausalHypothesisRunRow, "status"> | undefined
    if (!row) return "pending"
    if (row.status === "running" || row.status === "pending") return "pending"
    if (row.status === "unknown") return "unknown"
    if (row.status === "failed") return "failed"
    return "pending"
  }

  async getOpsStatusSnapshot(_input: { diagnostics?: boolean, now?: number } = {}): Promise<CausalHypothesisOpsStatus> {
    const runCounts = getRows<{ status: CausalHypothesisRunStatus, count: number }>(await this.db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM event_causal_hypothesis_runs
      GROUP BY status
    `).all())
    const statusCount = Object.fromEntries(runCounts.map(row => [row.status, Number(row.count) || 0])) as Partial<Record<CausalHypothesisRunStatus, number>>
    const activeRow = await this.db.prepare(`
      SELECT COUNT(DISTINCT event_id) AS count
      FROM event_causal_hypotheses
      WHERE status = 'active'
    `).get() as { count?: number } | undefined
    const permanentRow = await this.db.prepare(`
      SELECT COUNT(*) AS count, MAX(finished_at) AS latest_finished_at
      FROM event_causal_hypothesis_runs
      WHERE status = 'failed'
        AND error_code = 'causal_hypothesis_provider_permanent_error'
    `).get() as { count?: number, latest_finished_at?: number | null } | undefined

    return {
      pendingRunCount: statusCount.pending ?? 0,
      runningRunCount: statusCount.running ?? 0,
      availableEventCount: Number(activeRow?.count) || 0,
      failedEventCount: statusCount.failed ?? 0,
      unknownEventCount: statusCount.unknown ?? 0,
      permanentProviderErrorCount: Number(permanentRow?.count) || 0,
      latestPermanentProviderErrorAt: typeof permanentRow?.latest_finished_at === "number"
        ? permanentRow.latest_finished_at
        : null,
    }
  }

  private async listActiveHypotheses(eventId: string): Promise<InvestmentCausalHypothesis[]> {
    const rows = getRows<CausalHypothesisRow>(await this.db.prepare(`
      SELECT *
      FROM event_causal_hypotheses
      WHERE event_id = ?
        AND status = 'active'
      ORDER BY CASE basis WHEN 'stated' THEN 0 ELSE 1 END,
               confidence DESC,
               cause_type ASC,
               hypothesis_id ASC
    `).all(eventId))
    return rows.map(toInvestmentCausalHypothesis)
  }

  private async finishRunningRun(
    status: CausalHypothesisRunStatus,
    input: CausalHypothesisRunSuccessInput,
    errorCode: string | null = null,
    nextAttemptAt: number | null = null,
  ): Promise<boolean> {
    const row = await this.db.prepare(`
      UPDATE event_causal_hypothesis_runs
      SET status = ?,
          output_snapshot_json = ?,
          error_code = ?,
          next_attempt_at = ?,
          finished_at = ?,
          metadata_json = ?,
          locked_at = NULL,
          lock_owner = NULL,
          lease_expires_at = NULL
      WHERE run_id = ?
        AND status = 'running'
        AND lock_owner = ?
        AND lease_expires_at > ?
      RETURNING *
    `).get(
      status,
      serialize(input.outputSnapshot),
      errorCode,
      nextAttemptAt,
      input.now,
      serialize(input.metadata ?? {}),
      input.runId,
      input.lockOwner,
      input.now,
    ) as CausalHypothesisRunRow | undefined
    return Boolean(row)
  }

  private async ensureColumn(table: string, column: string, definition: string) {
    const rows = getRows<{ name: string }>(await this.db.prepare(`PRAGMA table_info(${table})`).all())
    if (rows.some(row => row.name === column)) return
    await this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
  }
}

let sharedCausalHypothesisTable: CausalHypothesisTable | undefined
let sharedCausalHypothesisTablePromise: Promise<CausalHypothesisTable | undefined> | undefined

export async function getCausalHypothesisTable() {
  if (process.env.ENABLE_CACHE === "false") return
  if (sharedCausalHypothesisTable) return sharedCausalHypothesisTable
  if (sharedCausalHypothesisTablePromise) return sharedCausalHypothesisTablePromise

  sharedCausalHypothesisTablePromise = (async () => {
    try {
      const db = useDatabase()
      const table = new CausalHypothesisTable(db)
      if (process.env.INIT_TABLE !== "false") await table.init()
      sharedCausalHypothesisTable = table
      return table
    } catch (error) {
      console.error("failed to init causal hypothesis database", error)
      return undefined
    }
  })()

  const table = await sharedCausalHypothesisTablePromise
  if (!table) {
    sharedCausalHypothesisTablePromise = undefined
  }
  return table
}
