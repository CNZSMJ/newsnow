import process from "node:process"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { config as loadEnv } from "dotenv"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { projectDir } from "../shared/dir"
import { CausalHypothesisTable } from "../server/database/causal-hypotheses"
import { EventTable } from "../server/database/events"
import { buildCausalHypothesisGenerationInput } from "../server/services/event-engine/causal-hypothesis/input"
import {
  enqueueCausalHypothesisRetry,
  enqueueCausalHypothesisGeneration,
  type CausalHypothesisEnqueueResult,
} from "../server/services/event-engine/causal-hypothesis/service"
import {
  getLiveCausalHypothesisGenerator,
  getLiveCausalHypothesisGeneratorStatus,
} from "../server/services/event-engine/causal-hypothesis/generator"
import { projectInvestmentEventDetail } from "../server/services/event-engine/investment-view"

loadEnv({
  path: resolve(projectDir, ".env.server"),
  quiet: true,
})

;(globalThis as typeof globalThis & {
  logger?: { success: () => void; error: () => void; warn: () => void; info: () => void }
}).logger = {
  success: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
}

const SCHEMA_VERSION = 1
const MODE = "causal_hypothesis_backfill"
const MAX_LIMIT = 100
const MAX_CONCURRENCY = 2

type CliErrorCode =
  | "invalid_arguments"
  | "generator_config_missing"
  | "database_unavailable"
  | "event_not_found"
  | "candidate_ineligible"
  | "dedupe_check_failed"
  | "enqueue_failed"
  | "unexpected_runtime_error"

type CliPhase =
  | "argument_parse"
  | "config_preflight"
  | "database_preflight"
  | "candidate_selection"
  | "dedupe_check"
  | "enqueue"
  | "runtime"

interface CliError {
  errorCode: CliErrorCode
  phase: CliPhase
  target: {
    scope: "global" | "candidate"
    eventId?: string
    runId?: string
    candidateIndex?: number
  }
  retryable: boolean
  message: string
}

interface ParsedArgs {
  eventId: string | null
  runId: string | null
  limit: number | null
  includeNoise: boolean
  concurrency: number
  debug: boolean
  dryRun: boolean
  execute: boolean
  json: boolean
  help: boolean
}

interface Candidate {
  eventId: string
}

const HELP_TEXT = `
Usage:
  pnpm events:backfill-causal-hypotheses --limit <1..100> [--include-noise] [--execute] [--json]
  pnpm events:backfill-causal-hypotheses --event-id <eventId> [--execute] [--json]
  pnpm events:backfill-causal-hypotheses --run-id <runId> [--execute] [--json]

Options:
  --limit <number>   Batch candidate limit. Required without --event-id or --run-id.
  --event-id <id>    Target one canonical event.
  --run-id <id>      Inspect an existing run and skip if already pending/running/done.
  --include-noise    Include actionBucket=noise in candidate selection.
  --concurrency <n>  Execute concurrency, 1..2. Defaults to 1.
  --execute          Actually enqueue pending runs. Default is dry-run.
  --dry-run          Explicit dry-run; mutually exclusive with --execute.
  --debug            Enable local diagnostic stderr details; JSON output is unchanged.
  --json             Emit stable machine JSON.
  --help, -h         Show this help text.
`.trim()

function safeMessage(message: string) {
  return message.slice(0, 200)
}

function error(input: {
  errorCode: CliErrorCode
  phase: CliPhase
  scope?: "global" | "candidate"
  eventId?: string
  runId?: string
  candidateIndex?: number
  retryable?: boolean
  message: string
}): CliError {
  return {
    errorCode: input.errorCode,
    phase: input.phase,
    target: {
      scope: input.scope ?? "global",
      eventId: input.eventId,
      runId: input.runId,
      candidateIndex: input.candidateIndex,
    },
    retryable: input.retryable ?? false,
    message: safeMessage(input.message),
  }
}

function parsePositiveLimit(raw: string | undefined) {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIMIT) return null
  return value
}

function parseConcurrency(raw: string | undefined) {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_CONCURRENCY) return null
  return value
}

function parseArgs(argv: string[]): { parsed?: ParsedArgs; errors: CliError[] } {
  const seen = new Set<string>()
  const parsed: ParsedArgs = {
    eventId: null,
    runId: null,
    limit: null,
    includeNoise: false,
    concurrency: 1,
    debug: false,
    dryRun: true,
    execute: false,
    json: false,
    help: false,
  }
  const errors: CliError[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith("--") && arg !== "-h") {
      errors.push(error({ errorCode: "invalid_arguments", phase: "argument_parse", message: `unknown argument ${arg}` }))
      continue
    }
    if (seen.has(arg)) {
      errors.push(error({ errorCode: "invalid_arguments", phase: "argument_parse", message: `duplicate argument ${arg}` }))
      continue
    }
    seen.add(arg)

    if (arg === "--help" || arg === "-h") {
      parsed.help = true
      continue
    }
    if (arg === "--json") {
      parsed.json = true
      continue
    }
    if (arg === "--include-noise") {
      parsed.includeNoise = true
      continue
    }
    if (arg === "--debug") {
      parsed.debug = true
      continue
    }
    if (arg === "--execute") {
      parsed.execute = true
      parsed.dryRun = false
      continue
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true
      continue
    }
    if (arg === "--event-id" || arg === "--run-id" || arg === "--limit" || arg === "--concurrency") {
      const value = argv[index + 1]?.trim()
      if (!value || value.startsWith("-")) {
        errors.push(error({ errorCode: "invalid_arguments", phase: "argument_parse", message: `${arg} requires a value` }))
        continue
      }
      if (arg === "--event-id") parsed.eventId = value
      if (arg === "--run-id") parsed.runId = value
      if (arg === "--limit") {
        const limit = parsePositiveLimit(value)
        if (!limit) {
          errors.push(error({ errorCode: "invalid_arguments", phase: "argument_parse", message: "--limit must be an integer from 1 to 100" }))
        } else {
          parsed.limit = limit
        }
      }
      if (arg === "--concurrency") {
        const concurrency = parseConcurrency(value)
        if (!concurrency) {
          errors.push(error({ errorCode: "invalid_arguments", phase: "argument_parse", message: "--concurrency must be an integer from 1 to 2" }))
        } else {
          parsed.concurrency = concurrency
        }
      }
      index += 1
      continue
    }

    errors.push(error({ errorCode: "invalid_arguments", phase: "argument_parse", message: `unknown argument ${arg}` }))
  }

  if (parsed.eventId && parsed.runId) {
    errors.push(error({ errorCode: "invalid_arguments", phase: "argument_parse", message: "--event-id and --run-id are mutually exclusive" }))
  }
  if (parsed.execute && seen.has("--dry-run")) {
    errors.push(error({ errorCode: "invalid_arguments", phase: "argument_parse", message: "--execute and --dry-run are mutually exclusive" }))
  }
  if (!parsed.help && !parsed.eventId && !parsed.runId && parsed.limit === null) {
    errors.push(error({ errorCode: "invalid_arguments", phase: "argument_parse", message: "batch mode requires --limit" }))
  }

  return errors.length ? { errors } : { parsed, errors }
}

function baseOutput(input: {
  startedAt: number
  exitCode: number
  parsed?: ParsedArgs
  requested: Record<string, unknown> | null
  errors?: CliError[]
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: MODE,
    exitCode: input.exitCode,
    durationMs: Math.max(0, Date.now() - input.startedAt),
    dryRun: input.parsed?.dryRun ?? false,
    execute: input.parsed?.execute ?? false,
    requested: input.requested,
    errors: input.errors ?? [],
  }
}

function requested(parsed: ParsedArgs) {
  return {
    eventId: parsed.eventId,
    runId: parsed.runId,
    limit: parsed.limit,
    includeNoise: parsed.includeNoise,
    concurrency: parsed.concurrency,
    dryRun: parsed.dryRun,
    execute: parsed.execute,
  }
}

function openTables() {
  const dataDir = resolve(projectDir, process.env.DATA_DIR || ".data")
  const db = createDatabase(sqliteConnector({
    cwd: dataDir,
    path: "db.sqlite3",
  }))
  return {
    eventTable: new EventTable(db as any),
    causalTable: new CausalHypothesisTable(db),
    dataDir,
  }
}

async function selectCandidates(parsed: ParsedArgs, eventTable: EventTable, causalTable: CausalHypothesisTable): Promise<{
  candidates: Candidate[]
  skipped: Array<Record<string, unknown>>
  errors: CliError[]
}> {
  if (parsed.runId) {
    const run = await causalTable.getRun(parsed.runId)
    if (!run) {
      return {
        candidates: [],
        skipped: [],
        errors: [error({ errorCode: "event_not_found", phase: "candidate_selection", runId: parsed.runId, message: "run not found" })],
      }
    }
    if (run.status !== "failed") {
      return {
        candidates: [],
        skipped: [{
          runId: run.runId,
          eventId: run.eventId,
          inputChecksum: run.inputChecksum,
          existingRunId: run.runId,
          skipReason: `run_already_${run.status}`,
          status: run.status,
        }],
        errors: [],
      }
    }
    if (run.nextAttemptAt === undefined || run.nextAttemptAt > Date.now()) {
      return {
        candidates: [],
        skipped: [{
          runId: run.runId,
          eventId: run.eventId,
          inputChecksum: run.inputChecksum,
          existingRunId: run.runId,
          skipReason: run.nextAttemptAt === undefined ? "retry_terminal_failure" : "retry_backoff_not_due",
          status: run.status,
        }],
        errors: [],
      }
    }
    return {
      candidates: [{ eventId: run.eventId }],
      skipped: [],
      errors: [],
    }
  }

  if (parsed.eventId) {
    const detail = await eventTable.getEventDetail(parsed.eventId)
    if (!detail) {
      return {
        candidates: [],
        skipped: [],
        errors: [error({ errorCode: "event_not_found", phase: "candidate_selection", eventId: parsed.eventId, message: "event not found" })],
      }
    }
    return {
      candidates: [{ eventId: parsed.eventId }],
      skipped: [],
      errors: [],
    }
  }

  const limit = parsed.limit ?? MAX_LIMIT
  const listed = await eventTable.listEvents({
    limit: Math.max(limit * 5, 100),
    sortBy: "investment",
  })
  const candidates: Candidate[] = []
  for (const item of listed) {
    const detail = await eventTable.getEventDetail(item.eventId)
    if (!detail) continue
    const projected = projectInvestmentEventDetail(detail)
    if (projected.actionBucket === "noise" && !parsed.includeNoise) continue
    candidates.push({ eventId: item.eventId })
    if (candidates.length >= limit) break
  }
  return { candidates, skipped: [], errors: [] }
}

async function previewCandidates(parsed: ParsedArgs, eventTable: EventTable, causalTable: CausalHypothesisTable) {
  const selection = await selectCandidates(parsed, eventTable, causalTable)
  const generator = getLiveCausalHypothesisGenerator()
  const wouldErrors: CliError[] = [...selection.errors]
  const wouldSkip = [...selection.skipped]
  const wouldQueueEventIds: string[] = []
  let executionBlocked = false

  if (!generator) {
    executionBlocked = true
    wouldErrors.push(error({
      errorCode: "generator_config_missing",
      phase: "config_preflight",
      message: "causal hypothesis generator is not configured",
    }))
    wouldQueueEventIds.push(...selection.candidates.map(candidate => candidate.eventId))
  } else {
    for (let index = 0; index < selection.candidates.length; index += 1) {
      const candidate = selection.candidates[index]!
      const detail = await eventTable.getEventDetail(candidate.eventId)
      if (!detail) continue
      const generationInput = buildCausalHypothesisGenerationInput(detail, {
        modelProvider: generator.provider,
        modelName: generator.modelName,
      })
      const existing = await causalTable.findExistingRunForKey({
        eventId: candidate.eventId,
        inputChecksum: generationInput.inputChecksum,
        promptVersion: generationInput.promptVersion,
        modelName: generationInput.modelName,
      })
      if (existing) {
        wouldSkip.push({
          eventId: candidate.eventId,
          inputChecksum: generationInput.inputChecksum,
          existingRunId: existing.runId,
          skipReason: `run_already_${existing.status}`,
          status: existing.status,
        })
      } else {
        wouldQueueEventIds.push(candidate.eventId)
      }
    }
  }

  return {
    candidateCount: selection.candidates.length,
    wouldQueueCount: wouldQueueEventIds.length,
    wouldSkipCount: wouldSkip.length,
    wouldFailCount: wouldErrors.filter(item => item.target.scope === "candidate").length,
    wouldQueueEventIds,
    wouldSkip,
    wouldErrors,
    executionBlocked,
  }
}

async function executeCandidates(parsed: ParsedArgs, eventTable: EventTable, causalTable: CausalHypothesisTable) {
  const generatorStatus = getLiveCausalHypothesisGeneratorStatus()
  if (!getLiveCausalHypothesisGenerator()) {
    return {
      queuedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      queuedRunIds: [] as string[],
      skipped: [] as Array<Record<string, unknown>>,
      errors: [error({
        errorCode: "generator_config_missing",
        phase: "config_preflight",
        retryable: false,
        message: generatorStatus.missingConfig.length ? "causal hypothesis generator config is missing" : "causal hypothesis generator is disabled",
      })],
    }
  }

  const selection = await selectCandidates(parsed, eventTable, causalTable)
  const queuedRunIds: string[] = []
  const skipped = [...selection.skipped]
  const errors = [...selection.errors]

  async function executeCandidate(index: number) {
    const candidate = selection.candidates[index]!
    const result: CausalHypothesisEnqueueResult = parsed.runId
      ? await enqueueCausalHypothesisRetry({
          runId: parsed.runId,
          triggerReason: `manual repair requested for ${parsed.runId}`,
          now: Date.now(),
        }, {
          causalStore: causalTable,
        })
      : await enqueueCausalHypothesisGeneration({
          eventId: candidate.eventId,
          triggerSource: "manual_backfill",
          triggerReason: "manual backfill requested",
          includeNoise: parsed.includeNoise || Boolean(parsed.eventId),
          now: Date.now(),
        }, {
          causalStore: causalTable,
          eventStore: eventTable,
        })
    if (result.status === "queued") {
      return {
        queuedRunIds: [result.runId],
        skipped: [] as Array<Record<string, unknown>>,
        errors: [] as CliError[],
      }
    }
    if (result.status === "skipped_existing") {
      return {
        queuedRunIds: [] as string[],
        skipped: [{
          eventId: result.eventId,
          inputChecksum: result.inputChecksum,
          existingRunId: result.existingRunId,
          skipReason: `run_already_${result.existingStatus}`,
          status: result.existingStatus,
        }],
        errors: [] as CliError[],
      }
    }
    return {
      queuedRunIds: [] as string[],
      skipped: [] as Array<Record<string, unknown>>,
      errors: [result.status === "blocked_by_generator_config"
        ? error({ errorCode: "generator_config_missing", phase: "config_preflight", candidateIndex: index, eventId: candidate.eventId, scope: "candidate", message: "generator config missing" })
        : error({ errorCode: "enqueue_failed", phase: "enqueue", candidateIndex: index, eventId: candidate.eventId, scope: "candidate", retryable: true, message: result.status })],
    }
  }

  const candidateResults: Array<Awaited<ReturnType<typeof executeCandidate>> | undefined> = []
  let nextIndex = 0
  async function worker() {
    while (nextIndex < selection.candidates.length) {
      const index = nextIndex
      nextIndex += 1
      candidateResults[index] = await executeCandidate(index)
    }
  }

  const workerCount = Math.min(parsed.concurrency, selection.candidates.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  for (const result of candidateResults) {
    if (!result) continue
    queuedRunIds.push(...result.queuedRunIds)
    skipped.push(...result.skipped)
    errors.push(...result.errors)
  }

  return {
    queuedCount: queuedRunIds.length,
    skippedCount: skipped.length,
    failedCount: errors.filter(item => item.target.scope === "candidate").length,
    queuedRunIds,
    skipped,
    errors,
  }
}

async function run(parsed: ParsedArgs) {
  const { eventTable, causalTable } = openTables()
  await eventTable.init()
  await causalTable.init()
  return parsed.execute
    ? executeCandidates(parsed, eventTable, causalTable)
    : previewCandidates(parsed, eventTable, causalTable)
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
      requested: null,
      errors: parseResult.errors,
    })
    if (wantsJson) console.log(JSON.stringify(output, null, 2))
    else console.error(parseResult.errors.map(item => item.message).join("\n"))
    process.exitCode = 1
    return output
  }

  if (parsed.help) {
    console.log(HELP_TEXT)
    return baseOutput({ startedAt, exitCode: 0, parsed, requested: requested(parsed) })
  }

  try {
    const result = await run(parsed)
    const exitCode = "errors" in result && result.errors.length ? 1 : 0
    const output = {
      ...baseOutput({
        startedAt,
        exitCode,
        parsed,
        requested: requested(parsed),
        errors: "errors" in result ? result.errors : [],
      }),
      ...result,
    }
    if (wantsJson) console.log(JSON.stringify(output, null, 2))
    else console.log(JSON.stringify(output, null, 2))
    process.exitCode = exitCode
    return output
  } catch {
    const output = baseOutput({
      startedAt,
      exitCode: 1,
      parsed,
      requested: requested(parsed),
      errors: [error({ errorCode: "unexpected_runtime_error", phase: "runtime", retryable: true, message: "unexpected runtime error" })],
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
