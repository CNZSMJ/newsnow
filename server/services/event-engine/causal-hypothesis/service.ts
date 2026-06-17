import { createHash } from "node:crypto"
import process from "node:process"
import type { EventDetail, InvestmentCausalHypothesis, InvestmentCausalHypothesisBasis, InvestmentCausalHypothesisCauseType } from "@shared/types"
import type {
  CausalHypothesisRunRecord,
  CausalHypothesisTable,
  CausalHypothesisTriggerSource,
} from "#/database/causal-hypotheses"
import { getCausalHypothesisTable } from "#/database/causal-hypotheses"
import { getEventProjectionTable } from "#/database/event-projections"
import { getEventTable } from "#/database/events"
import {
  buildCausalHypothesisGenerationInput,
} from "#/services/event-engine/causal-hypothesis/input"
import type {
  CausalHypothesisGenerationInput,
  CausalHypothesisInputSnapshot,
  CausalHypothesisModelHypothesis,
  CausalHypothesisValidationResult,
} from "#/services/event-engine/causal-hypothesis/types"
import {
  type CausalHypothesisGenerator,
  getLiveCausalHypothesisGenerator,
  getLiveCausalHypothesisGeneratorStatus,
} from "#/services/event-engine/causal-hypothesis/generator"
import { projectInvestmentEventDetail } from "#/services/event-engine/investment-view"
import {
  type CanonicalEventDetailStore,
  type InvestmentProjectionStore,
  refreshInvestmentProjectionForEvent,
} from "#/services/event-engine/projection-pipeline"
import type { LlmProviderId } from "#/services/llm/runtime"

type CausalStore = CausalHypothesisTable

export type CausalHypothesisEnqueueResult =
  | {
    status: "queued"
    queued: true
    eventId: string
    runId: string
    inputChecksum: string
  }
  | {
    status: "skipped_existing"
    queued: false
    eventId: string
    existingRunId: string
    existingStatus: string
    inputChecksum: string
  }
  | {
    status: "blocked_by_generator_config"
    queued: false
    eventId: string
    missingConfig: string[]
  }
  | {
    status: "event_not_found" | "ineligible"
    queued: false
    eventId: string
  }
  | {
    status: "database_unavailable"
    queued: false
    eventId: string
  }

export interface CausalHypothesisWorkerResult {
  timedOutCount: number
  supersededCount: number
  claimedCount: number
  succeededCount: number
  unknownCount: number
  failedCount: number
  processedRunIds: string[]
}

export interface CausalHypothesisServiceDependencies {
  causalStore?: CausalStore
  eventStore?: CanonicalEventDetailStore
  projectionStore?: InvestmentProjectionStore
  generator?: CausalHypothesisGenerator
}

export interface CausalHypothesisEnqueueInput {
  eventId: string
  triggerSource: CausalHypothesisTriggerSource
  triggerReason?: string
  includeNoise?: boolean
  now?: number
}

export interface CausalHypothesisWorkerInput {
  limit?: number
  concurrency?: number
  compactPendingLimit?: number
  lockOwner?: string
  now?: number
}

export interface CausalHypothesisRetryInput {
  runId: string
  now?: number
  triggerReason?: string
}

const CAUSAL_HYPOTHESIS_LEASE_MS = 120_000
const MAX_WORKER_CONCURRENCY = 8
const MAX_ATTEMPTS = 4
const RETRY_BACKOFF_MS = [
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
]

const causeTypeLabels: Record<InvestmentCausalHypothesisCauseType, string> = {
  policy_or_regulation: "政策或监管",
  macro_or_liquidity: "宏观或流动性",
  industry_supply_demand: "行业供需",
  company_action: "公司行为",
  market_flow_or_sentiment: "资金或情绪",
  external_event: "外部事件",
}

const basisLabels: Record<InvestmentCausalHypothesisBasis, string> = {
  stated: "明示原因",
  inferred: "推断原因",
}

const causeTypeRank: Record<InvestmentCausalHypothesisCauseType, number> = {
  policy_or_regulation: 0,
  macro_or_liquidity: 1,
  industry_supply_demand: 2,
  company_action: 3,
  market_flow_or_sentiment: 4,
  external_event: 5,
}

function hashId(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
}

function makeRunId(input: {
  eventId: string
  inputChecksum: string
  promptVersion: string
  modelName: string
  triggerSource: string
  now: number
}) {
  return `chr_${hashId(input).slice(0, 24)}`
}

function makeHypothesisId(input: {
  runId: string
  causeType: InvestmentCausalHypothesisCauseType
  statement: string
  index: number
}) {
  return `ch_${hashId(input).slice(0, 24)}`
}

function getRetryNextAttemptAt(attemptNumber: number, failedAt: number) {
  if (attemptNumber >= MAX_ATTEMPTS) return null
  return failedAt + (RETRY_BACKOFF_MS[attemptNumber - 1] ?? RETRY_BACKOFF_MS.at(-1)!)
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || (value ?? 0) < 1) return fallback
  return Math.floor(value as number)
}

function isEligibleForAutomaticGeneration(detail: EventDetail, includeNoise?: boolean) {
  if (includeNoise) return true
  return projectInvestmentEventDetail(detail).actionBucket !== "noise"
}

function getGenerator(deps: CausalHypothesisServiceDependencies) {
  if ("generator" in deps) return deps.generator
  return getLiveCausalHypothesisGenerator()
}

function getMissingConfig(deps: CausalHypothesisServiceDependencies) {
  if ("generator" in deps) return []
  return getLiveCausalHypothesisGeneratorStatus().missingConfig
}

function normalizeProvider(value?: string): LlmProviderId | null {
  if (value === "openai" || value === "minimax") return value
  return null
}

function buildGenerationInputFromRun(run: CausalHypothesisRunRecord): CausalHypothesisGenerationInput {
  const inputSnapshot = run.inputSnapshot as unknown as CausalHypothesisInputSnapshot
  return {
    inputBuilderVersion: run.inputBuilderVersion,
    promptId: typeof inputSnapshot.promptId === "string" ? inputSnapshot.promptId : "causal-hypothesis-generator",
    promptVersion: run.promptVersion ?? (typeof inputSnapshot.promptVersion === "string" ? inputSnapshot.promptVersion : "causal-hypothesis-generator-v1"),
    modelProvider: normalizeProvider(run.modelProvider),
    modelName: run.modelName ?? (typeof inputSnapshot.modelName === "string" ? inputSnapshot.modelName : ""),
    inputChecksum: run.inputChecksum,
    promptInput: JSON.stringify(inputSnapshot, null, 2),
    inputSnapshot,
  }
}

function sortHypotheses(left: CausalHypothesisModelHypothesis, right: CausalHypothesisModelHypothesis) {
  const basisDiff = (left.basis === "stated" ? 0 : 1) - (right.basis === "stated" ? 0 : 1)
  if (basisDiff !== 0) return basisDiff

  const confidenceDiff = right.confidence - left.confidence
  if (confidenceDiff !== 0) return confidenceDiff

  return causeTypeRank[left.causeType] - causeTypeRank[right.causeType]
}

function toActiveHypotheses(input: {
  run: CausalHypothesisRunRecord
  validation: Extract<CausalHypothesisValidationResult, { valid: true }>
}): Array<Omit<InvestmentCausalHypothesis, "generatedAt">> {
  const selected: Array<Omit<InvestmentCausalHypothesis, "generatedAt">> = []
  const usedCauseTypes = new Set<InvestmentCausalHypothesisCauseType>()
  const sorted = [...input.validation.acceptedHypotheses].sort(sortHypotheses)

  for (const hypothesis of sorted) {
    if (selected.length >= 3) break
    if (usedCauseTypes.has(hypothesis.causeType)) continue
    usedCauseTypes.add(hypothesis.causeType)
    selected.push({
      hypothesisId: makeHypothesisId({
        runId: input.run.runId,
        causeType: hypothesis.causeType,
        statement: hypothesis.statement,
        index: selected.length,
      }),
      statement: hypothesis.statement,
      causeType: hypothesis.causeType,
      causeTypeLabel: causeTypeLabels[hypothesis.causeType],
      basis: hypothesis.basis,
      basisLabel: basisLabels[hypothesis.basis],
      confidence: hypothesis.confidence,
      rationale: hypothesis.rationale,
      evidenceIds: hypothesis.evidenceIds,
      factIds: hypothesis.factIds,
      evidenceSpans: hypothesis.evidenceSpans,
    })
  }

  return selected
}

function buildOutputSnapshot(validation: CausalHypothesisValidationResult) {
  if (!validation.valid) {
    return {
      parseStatus: validation.errorCode === "causal_hypothesis_schema_invalid" ? "schema_invalid" : "references_invalid",
      errorCode: validation.errorCode,
      validationSummary: validation.validationSummary,
      acceptedHypothesisCount: 0,
      invalidHypothesisCount: validation.invalidHypothesisCount,
      finalRunStatus: "failed",
    }
  }

  return {
    parseStatus: "accepted",
    status: validation.output.status,
    unknownReason: validation.output.unknownReason,
    acceptedHypothesisCount: validation.acceptedHypotheses.length,
    invalidHypothesisCount: validation.invalidHypothesisCount,
    hypotheses: validation.acceptedHypotheses.map(hypothesis => ({
      statement: hypothesis.statement,
      causeType: hypothesis.causeType,
      basis: hypothesis.basis,
      confidence: hypothesis.confidence,
      evidenceIds: hypothesis.evidenceIds,
      factIds: hypothesis.factIds,
    })),
    finalRunStatus: validation.runStatus,
  }
}

function getGenerationFailureErrorCode(error: unknown) {
  if (error instanceof Error && error.message === "causal_hypothesis_model_timeout") {
    return "causal_hypothesis_model_timeout"
  }
  return "causal_hypothesis_provider_transient_error"
}

function buildGenerationFailureOutputSnapshot(errorCode: string) {
  return {
    parseStatus: "generation_failed",
    errorCode,
    validationSummary: errorCode,
  }
}

async function getStores(deps: CausalHypothesisServiceDependencies, options: { includeProjection?: boolean } = {}) {
  const shouldUseDefaultProjection = options.includeProjection
    && !deps.causalStore
    && !deps.eventStore
    && !("projectionStore" in deps)
  return {
    causalStore: deps.causalStore ?? await getCausalHypothesisTable(),
    eventStore: deps.eventStore ?? await getEventTable(),
    projectionStore: "projectionStore" in deps
      ? deps.projectionStore
      : shouldUseDefaultProjection
        ? await getEventProjectionTable()
        : undefined,
  }
}

export async function enqueueCausalHypothesisGeneration(
  input: CausalHypothesisEnqueueInput,
  deps: CausalHypothesisServiceDependencies = {},
): Promise<CausalHypothesisEnqueueResult> {
  const now = input.now ?? Date.now()
  const { causalStore, eventStore } = await getStores(deps)
  if (!causalStore || !eventStore) {
    return {
      status: "database_unavailable",
      queued: false,
      eventId: input.eventId,
    }
  }

  const generator = getGenerator(deps)
  if (!generator) {
    return {
      status: "blocked_by_generator_config",
      queued: false,
      eventId: input.eventId,
      missingConfig: getMissingConfig(deps),
    }
  }

  const detail = await eventStore.getEventDetail(input.eventId)
  if (!detail) {
    return {
      status: "event_not_found",
      queued: false,
      eventId: input.eventId,
    }
  }

  if (!isEligibleForAutomaticGeneration(detail, input.includeNoise)) {
    return {
      status: "ineligible",
      queued: false,
      eventId: input.eventId,
    }
  }

  const generationInput = buildCausalHypothesisGenerationInput(detail, {
    modelProvider: generator.provider,
    modelName: generator.modelName,
  })
  const existing = await causalStore.findExistingRunForKey({
    eventId: input.eventId,
    inputChecksum: generationInput.inputChecksum,
    promptVersion: generationInput.promptVersion,
    modelName: generationInput.modelName,
  })
  if (existing) {
    return {
      status: "skipped_existing",
      queued: false,
      eventId: input.eventId,
      existingRunId: existing.runId,
      existingStatus: existing.status,
      inputChecksum: generationInput.inputChecksum,
    }
  }

  const run = await causalStore.enqueueRun({
    runId: makeRunId({
      eventId: input.eventId,
      inputChecksum: generationInput.inputChecksum,
      promptVersion: generationInput.promptVersion,
      modelName: generationInput.modelName,
      triggerSource: input.triggerSource,
      now,
    }),
    eventId: input.eventId,
    inputChecksum: generationInput.inputChecksum,
    inputSnapshot: generationInput.inputSnapshot as unknown as Record<string, unknown>,
    inputBuilderVersion: generationInput.inputBuilderVersion,
    outputSnapshot: {},
    modelProvider: generationInput.modelProvider ?? undefined,
    modelName: generationInput.modelName,
    promptVersion: generationInput.promptVersion,
    triggerSource: input.triggerSource,
    triggerReason: input.triggerReason,
    nextAttemptAt: now,
    createdAt: now,
    metadata: {},
  })
  await causalStore.supersedeOlderPendingRunsForEvent({
    eventId: input.eventId,
    promptVersion: generationInput.promptVersion,
    modelName: generationInput.modelName,
    keepRunId: run.runId,
    now,
  })

  return {
    status: "queued",
    queued: true,
    eventId: input.eventId,
    runId: run.runId,
    inputChecksum: run.inputChecksum,
  }
}

async function refreshProjectionIfPossible(input: {
  eventId: string
  eventStore?: CanonicalEventDetailStore
  projectionStore?: InvestmentProjectionStore
  causalStore?: CausalStore
}) {
  if (!input.eventStore || !input.projectionStore) return
  await refreshInvestmentProjectionForEvent(input.eventId, input.eventStore, input.projectionStore, {
    causalProjectionStore: input.causalStore,
  })
}

async function processRun(input: {
  run: CausalHypothesisRunRecord
  now: number
  lockOwner: string
  causalStore: CausalStore
  eventStore?: CanonicalEventDetailStore
  projectionStore?: InvestmentProjectionStore
  generator: CausalHypothesisGenerator
}) {
  const generationInput = buildGenerationInputFromRun(input.run)
  let result: Awaited<ReturnType<CausalHypothesisGenerator["generateFromInput"]>>
  try {
    result = await input.generator.generateFromInput(generationInput)
  } catch (error) {
    const errorCode = getGenerationFailureErrorCode(error)
    const nextAttemptAt = getRetryNextAttemptAt(input.run.attemptNumber, input.now)
    await input.causalStore.finishRunFailed({
      runId: input.run.runId,
      lockOwner: input.lockOwner,
      now: input.now,
      errorCode,
      nextAttemptAt,
      outputSnapshot: buildGenerationFailureOutputSnapshot(errorCode),
      metadata: {
        failureClass: errorCode,
      },
    })
    await refreshProjectionIfPossible({
      eventId: input.run.eventId,
      eventStore: input.eventStore,
      projectionStore: input.projectionStore,
      causalStore: input.causalStore,
    })
    return "failed" as const
  }
  const validation = result.validation
  const outputSnapshot = buildOutputSnapshot(validation)

  if (!validation.valid) {
    const nextAttemptAt = getRetryNextAttemptAt(input.run.attemptNumber, input.now)
    await input.causalStore.finishRunFailed({
      runId: input.run.runId,
      lockOwner: input.lockOwner,
      now: input.now,
      errorCode: validation.errorCode,
      nextAttemptAt,
      outputSnapshot,
      metadata: {
        invalidHypothesisCount: validation.invalidHypothesisCount,
      },
    })
    await refreshProjectionIfPossible({
      eventId: input.run.eventId,
      eventStore: input.eventStore,
      projectionStore: input.projectionStore,
      causalStore: input.causalStore,
    })
    return validation.runStatus
  }

  if (validation.runStatus === "unknown") {
    await input.causalStore.withTransaction(async () => {
      await input.causalStore.finishRunUnknown({
        runId: input.run.runId,
        lockOwner: input.lockOwner,
        now: input.now,
        outputSnapshot,
        metadata: {
          unknownReason: validation.output.unknownReason,
        },
      })
      await input.causalStore.replaceActiveHypotheses({
        eventId: input.run.eventId,
        generationRunId: input.run.runId,
        inputChecksum: input.run.inputChecksum,
        modelProvider: input.run.modelProvider,
        modelName: input.run.modelName,
        promptVersion: input.run.promptVersion,
        generatedAt: input.now,
        hypotheses: [],
      })
    })
    await refreshProjectionIfPossible({
      eventId: input.run.eventId,
      eventStore: input.eventStore,
      projectionStore: input.projectionStore,
      causalStore: input.causalStore,
    })
    return validation.runStatus
  }

  const activeHypotheses = toActiveHypotheses({
    run: input.run,
    validation,
  })
  await input.causalStore.withTransaction(async () => {
    await input.causalStore.finishRunSucceeded({
      runId: input.run.runId,
      lockOwner: input.lockOwner,
      now: input.now,
      outputSnapshot,
      metadata: {
        acceptedHypothesisCount: activeHypotheses.length,
        invalidHypothesisCount: validation.invalidHypothesisCount,
      },
    })
    await input.causalStore.replaceActiveHypotheses({
      eventId: input.run.eventId,
      generationRunId: input.run.runId,
      inputChecksum: input.run.inputChecksum,
      modelProvider: input.run.modelProvider,
      modelName: input.run.modelName,
      promptVersion: input.run.promptVersion,
      generatedAt: input.now,
      hypotheses: activeHypotheses,
    })
  })
  await refreshProjectionIfPossible({
    eventId: input.run.eventId,
    eventStore: input.eventStore,
    projectionStore: input.projectionStore,
    causalStore: input.causalStore,
  })
  return validation.runStatus
}

export async function processPendingCausalHypothesisRuns(
  input: CausalHypothesisWorkerInput = {},
  deps: CausalHypothesisServiceDependencies = {},
): Promise<CausalHypothesisWorkerResult> {
  const now = input.now ?? Date.now()
  const limit = normalizePositiveInteger(input.limit, 1)
  const concurrency = Math.min(normalizePositiveInteger(input.concurrency, 1), limit, MAX_WORKER_CONCURRENCY)
  const compactPendingLimit = Math.max(0, Math.floor(input.compactPendingLimit ?? 0))
  const lockOwner = input.lockOwner ?? `causal-hypothesis-worker-${process.pid}`
  const { causalStore, eventStore, projectionStore } = await getStores(deps, { includeProjection: true })
  const result: CausalHypothesisWorkerResult = {
    timedOutCount: 0,
    supersededCount: 0,
    claimedCount: 0,
    succeededCount: 0,
    unknownCount: 0,
    failedCount: 0,
    processedRunIds: [],
  }
  if (!causalStore) return result

  if (compactPendingLimit > 0) {
    result.supersededCount = await causalStore.compactPendingRuns({
      now,
      limit: compactPendingLimit,
    })
  }

  result.timedOutCount = await causalStore.markTimedOutRuns({
    now,
    limit,
  })

  const generator = getGenerator(deps)
  if (!generator) return result

  const activeCausalStore = causalStore
  const activeGenerator = generator
  let claimAttempts = 0
  async function processWorker() {
    while (true) {
      const claimIndex = claimAttempts
      if (claimIndex >= limit) return
      claimAttempts += 1

      const run = await activeCausalStore.claimNextPendingRun({
        now,
        lockOwner,
        leaseMs: CAUSAL_HYPOTHESIS_LEASE_MS,
      })
      if (!run) return

      result.claimedCount += 1
      result.processedRunIds.push(run.runId)
      const status = await processRun({
        run,
        now,
        lockOwner,
        causalStore: activeCausalStore,
        eventStore,
        projectionStore,
        generator: activeGenerator,
      })
      if (status === "succeeded") result.succeededCount += 1
      else if (status === "unknown") result.unknownCount += 1
      else result.failedCount += 1
    }
  }
  await Promise.all(Array.from({ length: concurrency }, processWorker))

  return result
}

export async function enqueueCausalHypothesisRetry(
  input: CausalHypothesisRetryInput,
  deps: CausalHypothesisServiceDependencies = {},
): Promise<CausalHypothesisEnqueueResult> {
  const now = input.now ?? Date.now()
  const causalStore = deps.causalStore ?? await getCausalHypothesisTable()
  if (!causalStore) {
    return {
      status: "database_unavailable",
      queued: false,
      eventId: "",
    }
  }

  const generator = getGenerator(deps)
  if (!generator) {
    return {
      status: "blocked_by_generator_config",
      queued: false,
      eventId: "",
      missingConfig: getMissingConfig(deps),
    }
  }

  const failedRun = await causalStore.getRun(input.runId)
  if (!failedRun) {
    return {
      status: "event_not_found",
      queued: false,
      eventId: "",
    }
  }

  if (
    failedRun.status !== "failed"
    || failedRun.attemptNumber >= MAX_ATTEMPTS
    || failedRun.nextAttemptAt === undefined
    || failedRun.nextAttemptAt > now
  ) {
    return {
      status: "skipped_existing",
      queued: false,
      eventId: failedRun.eventId,
      existingRunId: failedRun.runId,
      existingStatus: failedRun.status,
      inputChecksum: failedRun.inputChecksum,
    }
  }

  const latestRun = await causalStore.findLatestRunForGenerationScope({
    eventId: failedRun.eventId,
    promptVersion: failedRun.promptVersion,
    modelName: failedRun.modelName,
  })
  if (latestRun && latestRun.runId !== failedRun.runId && latestRun.createdAt > failedRun.createdAt) {
    return {
      status: "skipped_existing",
      queued: false,
      eventId: failedRun.eventId,
      existingRunId: latestRun.runId,
      existingStatus: latestRun.status,
      inputChecksum: latestRun.inputChecksum,
    }
  }

  const existing = await causalStore.findExistingRunForKey({
    eventId: failedRun.eventId,
    inputChecksum: failedRun.inputChecksum,
    promptVersion: failedRun.promptVersion,
    modelName: failedRun.modelName,
  })
  if (existing) {
    return {
      status: "skipped_existing",
      queued: false,
      eventId: failedRun.eventId,
      existingRunId: existing.runId,
      existingStatus: existing.status,
      inputChecksum: failedRun.inputChecksum,
    }
  }

  const run = await causalStore.enqueueRun({
    runId: makeRunId({
      eventId: failedRun.eventId,
      inputChecksum: failedRun.inputChecksum,
      promptVersion: failedRun.promptVersion ?? "causal-hypothesis-generator-v1",
      modelName: failedRun.modelName ?? generator.modelName,
      triggerSource: "retry",
      now,
    }),
    eventId: failedRun.eventId,
    inputChecksum: failedRun.inputChecksum,
    inputSnapshot: failedRun.inputSnapshot,
    inputBuilderVersion: failedRun.inputBuilderVersion,
    outputSnapshot: {},
    modelProvider: failedRun.modelProvider ?? generator.provider,
    modelName: failedRun.modelName ?? generator.modelName,
    promptVersion: failedRun.promptVersion,
    triggerSource: "retry",
    triggerReason: input.triggerReason ?? failedRun.errorCode ?? "retry failed causal hypothesis run",
    retryOfRunId: failedRun.runId,
    attemptNumber: failedRun.attemptNumber + 1,
    nextAttemptAt: now,
    createdAt: now,
    metadata: {},
  })

  return {
    status: "queued",
    queued: true,
    eventId: run.eventId,
    runId: run.runId,
    inputChecksum: run.inputChecksum,
  }
}

export async function enqueueDueCausalHypothesisRetries(
  input: { limit?: number, now?: number } = {},
  deps: CausalHypothesisServiceDependencies = {},
) {
  const now = input.now ?? Date.now()
  const limit = Math.max(1, input.limit ?? 1)
  const { causalStore } = await getStores(deps)
  if (!causalStore) {
    return {
      scannedCount: 0,
      queuedCount: 0,
      skippedCount: 0,
      queuedRunIds: [] as string[],
    }
  }
  const dueRuns = await causalStore.listDueFailedRunsForRetry({ now, limit })
  const queuedRunIds: string[] = []
  let skippedCount = 0
  for (const run of dueRuns) {
    const retry = await enqueueCausalHypothesisRetry({
      runId: run.runId,
      now,
      triggerReason: run.errorCode ?? "due retry",
    }, deps)
    if (retry.status === "queued") queuedRunIds.push(retry.runId)
    else skippedCount += 1
  }
  return {
    scannedCount: dueRuns.length,
    queuedCount: queuedRunIds.length,
    skippedCount,
    queuedRunIds,
  }
}

export async function readCausalProjection(eventId: string, deps: CausalHypothesisServiceDependencies = {}) {
  const { causalStore } = await getStores(deps)
  if (!causalStore) {
    return {
      causalStatus: "pending" as const,
      causalHypotheses: [],
    }
  }
  return causalStore.readCausalProjection(eventId)
}

export async function getCausalHypothesisOpsStatus(input: { diagnostics?: boolean, now?: number } = {}, deps: CausalHypothesisServiceDependencies = {}) {
  const { causalStore } = await getStores(deps)
  if (!causalStore) {
    return {
      pendingRunCount: 0,
      runningRunCount: 0,
      availableEventCount: 0,
      failedEventCount: 0,
      unknownEventCount: 0,
      permanentProviderErrorCount: 0,
      latestPermanentProviderErrorAt: null,
    }
  }
  return causalStore.getOpsStatusSnapshot(input)
}
