import process from "node:process"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { config as loadEnv } from "dotenv"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { projectDir } from "../shared/dir"
import { CausalHypothesisTable } from "../server/database/causal-hypotheses"
import { EventProjectionTable } from "../server/database/event-projections"
import { EventTable } from "../server/database/events"
import {
  enqueueDueCausalHypothesisRetries,
  getCausalHypothesisOpsStatus,
  processPendingCausalHypothesisRuns,
} from "../server/services/event-engine/causal-hypothesis/service"
import { getLiveCausalHypothesisGeneratorStatus } from "../server/services/event-engine/causal-hypothesis/generator"
import {
  HELP_TEXT,
  cliError,
  parseArgs,
} from "./process-causal-hypothesis-runs-args"
import type { CliError, ProcessCausalHypothesisRunsArgs } from "./process-causal-hypothesis-runs-args"

loadEnv({ path: resolve(projectDir, ".env.server"), quiet: true })

const SCHEMA_VERSION = 1
const MODE = "causal_hypothesis_run_processor"

type CausalHypothesisProcessorStores = Awaited<ReturnType<typeof openStores>>

async function openStores() {
  const db = createDatabase(sqliteConnector({
    cwd: resolve(projectDir, process.env.DATA_DIR || ".data"),
    path: "db.sqlite3",
  }))
  const causalStore = new CausalHypothesisTable(db)
  const eventStore = new EventTable(db as any)
  const projectionStore = new EventProjectionTable(db)
  await eventStore.init()
  await causalStore.init()
  await projectionStore.init()
  return {
    causalStore,
    eventStore,
    projectionStore,
  }
}

function requested(parsed: ProcessCausalHypothesisRunsArgs) {
  return {
    limit: parsed.limit,
    batchSize: parsed.batchSize,
    compactPendingLimit: parsed.compactPendingLimit,
    retryLimit: parsed.retryLimit,
    execute: parsed.execute,
    dryRun: parsed.dryRun,
    lockOwner: parsed.lockOwner,
  }
}

function baseOutput(input: {
  startedAt: number
  exitCode: number
  parsed?: ProcessCausalHypothesisRunsArgs
  errors?: CliError[]
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: MODE,
    exitCode: input.exitCode,
    durationMs: Math.max(0, Date.now() - input.startedAt),
    requested: input.parsed ? requested(input.parsed) : null,
    errors: input.errors ?? [],
  }
}

async function dryRun(parsed: ProcessCausalHypothesisRunsArgs, stores: CausalHypothesisProcessorStores) {
  const status = await getCausalHypothesisOpsStatus({}, stores)
  const generator = getLiveCausalHypothesisGeneratorStatus()
  return {
    dryRun: true,
    execute: false,
    before: status,
    generator,
    summary: {
      maxClaimedRunCount: parsed.limit,
      batchSize: parsed.batchSize,
      compactPendingLimit: parsed.compactPendingLimit,
      retryLimit: parsed.retryLimit,
      generatorReady: generator.enabled && generator.missingConfig.length === 0,
    },
  }
}

async function execute(parsed: ProcessCausalHypothesisRunsArgs, stores: CausalHypothesisProcessorStores) {
  const generator = getLiveCausalHypothesisGeneratorStatus()
  if (!generator.enabled || generator.missingConfig.length) {
    return {
      exitCode: 1,
      result: {
        dryRun: false,
        execute: true,
        generator,
        errors: [cliError({
          errorCode: "generator_config_missing",
          phase: "config_preflight",
          message: "causal hypothesis generator is not configured",
        })],
      },
    }
  }

  const before = await getCausalHypothesisOpsStatus({}, stores)
  const retry = parsed.retryLimit > 0
    ? await enqueueDueCausalHypothesisRetries({ limit: parsed.retryLimit }, stores)
    : { scannedCount: 0, queuedCount: 0, skippedCount: 0, queuedRunIds: [] as string[] }
  const batches: Array<Record<string, unknown>> = []
  const totals = {
    timedOutCount: 0,
    supersededCount: 0,
    claimedCount: 0,
    succeededCount: 0,
    unknownCount: 0,
    failedCount: 0,
  }

  while (totals.claimedCount < parsed.limit) {
    const remaining = parsed.limit - totals.claimedCount
    const batchLimit = Math.min(parsed.batchSize, remaining)
    const batchIndex = batches.length
    const result = await processPendingCausalHypothesisRuns({
      limit: batchLimit,
      compactPendingLimit: batchIndex === 0 ? parsed.compactPendingLimit : 0,
      lockOwner: `${parsed.lockOwner}-${process.pid}-${batchIndex}`,
    }, stores)

    totals.timedOutCount += result.timedOutCount
    totals.supersededCount += result.supersededCount
    totals.claimedCount += result.claimedCount
    totals.succeededCount += result.succeededCount
    totals.unknownCount += result.unknownCount
    totals.failedCount += result.failedCount
    batches.push({
      batchIndex,
      batchLimit,
      timedOutCount: result.timedOutCount,
      supersededCount: result.supersededCount,
      claimedCount: result.claimedCount,
      succeededCount: result.succeededCount,
      unknownCount: result.unknownCount,
      failedCount: result.failedCount,
    })

    if (result.claimedCount < batchLimit) break
  }

  const after = await getCausalHypothesisOpsStatus({}, stores)
  return {
    exitCode: 0,
    result: {
      dryRun: false,
      execute: true,
      before,
      after,
      generator,
      retry,
      summary: {
        batchCount: batches.length,
        ...totals,
        pendingRunDelta: after.pendingRunCount - before.pendingRunCount,
        availableEventDelta: after.availableEventCount - before.availableEventCount,
        unknownEventDelta: after.unknownEventCount - before.unknownEventCount,
        failedEventDelta: after.failedEventCount - before.failedEventCount,
      },
      batches,
      errors: [],
    },
  }
}

export async function main(argv = process.argv.slice(2)) {
  const startedAt = Date.now()
  const parseResult = parseArgs(argv)
  const parsed = parseResult.parsed
  const wantsJson = parsed?.json || argv.includes("--json")

  if (parseResult.errors.length || !parsed) {
    const output = baseOutput({
      startedAt,
      exitCode: 1,
      errors: parseResult.errors,
    })
    if (wantsJson) console.log(JSON.stringify(output, null, 2))
    else console.error(output.errors.map(item => item.message).join("\n"))
    process.exitCode = 1
    return output
  }

  if (parsed.help) {
    console.log(HELP_TEXT)
    return baseOutput({ startedAt, exitCode: 0, parsed })
  }

  try {
    const stores = await openStores()
    const runResult = parsed.execute
      ? await execute(parsed, stores)
      : { exitCode: 0, result: await dryRun(parsed, stores) }
    const output = {
      ...baseOutput({
        startedAt,
        exitCode: runResult.exitCode,
        parsed,
        errors: "errors" in runResult.result ? runResult.result.errors as CliError[] : [],
      }),
      ...runResult.result,
    }
    console.log(JSON.stringify(output, null, 2))
    process.exitCode = runResult.exitCode
    return output
  } catch {
    const output = baseOutput({
      startedAt,
      exitCode: 1,
      parsed,
      errors: [cliError({
        errorCode: "unexpected_runtime_error",
        phase: "runtime",
        retryable: true,
        message: "unexpected runtime error",
      })],
    })
    if (wantsJson) console.log(JSON.stringify(output, null, 2))
    else console.error(output.errors[0]?.message)
    process.exitCode = 1
    return output
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main()
}
