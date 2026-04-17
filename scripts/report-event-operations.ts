import process from "node:process"
import { resolve } from "node:path"
import { config as loadEnv } from "dotenv"
import { consola } from "consola"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { projectDir } from "../shared/dir"
import { EventTable } from "../server/database/events"

loadEnv({
  path: resolve(projectDir, ".env.server"),
});

(globalThis as typeof globalThis & { logger: typeof consola }).logger = consola.withTag("event-ops-report")

const DEFAULT_OPERATIONAL_WINDOW_HOURS = 24
const MAX_OPERATIONAL_WINDOW_HOURS = 7 * 24
const DEFAULT_LATENCY_BUCKET_LIMIT = 10
const MAX_LATENCY_BUCKET_LIMIT = 25
const DEFAULT_STALE_THRESHOLD_MINUTES = 5
const MAX_STALE_THRESHOLD_MINUTES = 12 * 60

const HELP_TEXT = `
Usage:
  pnpm events:latency-diagnostics [--hours <number>] [--limit <number>] [--stale-threshold-minutes <number>]

Options:
  --hours <number>                    Lookback window for operational latency diagnostics. Default: 24
  --limit <number>                    Max source-kind and source buckets to return. Default: 10
  --stale-threshold-minutes <number>  Latency threshold for stale-vs-fresh counting. Default: 5
  --stale-minutes <number>            Alias for --stale-threshold-minutes
  --help, -h                          Show this help text
`.trim()

function clampPositiveNumber(value: unknown, defaultValue: number, maxValue: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue
  }

  return Math.min(parsed, maxValue)
}

function clampPositiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue
  }

  return Math.min(Math.max(1, Math.floor(parsed)), maxValue)
}

function parseArgs(argv: string[]) {
  const options: {
    hours?: number
    limit?: number
    staleThresholdMinutes?: number
    help?: boolean
  } = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") {
      options.help = true
      continue
    }
    if (arg === "--hours") {
      const value = Number(argv[index + 1])
      if (Number.isFinite(value) && value > 0) {
        options.hours = value
        index += 1
      }
      continue
    }
    if (arg === "--limit") {
      const value = Number(argv[index + 1])
      if (Number.isFinite(value) && value > 0) {
        options.limit = Math.floor(value)
        index += 1
      }
      continue
    }
    if (arg === "--stale-threshold-minutes" || arg === "--stale-minutes") {
      const value = Number(argv[index + 1])
      if (Number.isFinite(value) && value > 0) {
        options.staleThresholdMinutes = Math.floor(value)
        index += 1
      }
    }
  }

  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(HELP_TEXT)
    return
  }

  const dataDir = resolve(projectDir, process.env.DATA_DIR || ".data")
  const db = createDatabase(sqliteConnector({
    cwd: dataDir,
    path: "db.sqlite3",
  }))

  const table = new EventTable(db as any)
  await table.init()

  const updatedTime = Date.now()
  const hours = clampPositiveNumber(
    options.hours,
    DEFAULT_OPERATIONAL_WINDOW_HOURS,
    MAX_OPERATIONAL_WINDOW_HOURS,
  )
  const bucketLimit = clampPositiveInteger(
    options.limit,
    DEFAULT_LATENCY_BUCKET_LIMIT,
    MAX_LATENCY_BUCKET_LIMIT,
  )
  const staleThresholdMinutes = clampPositiveInteger(
    options.staleThresholdMinutes,
    DEFAULT_STALE_THRESHOLD_MINUTES,
    MAX_STALE_THRESHOLD_MINUTES,
  )
  const diagnostics = await table.getOperationalLatencyDiagnostics({
    since: updatedTime - Math.round(hours * 60 * 60 * 1000),
    limit: bucketLimit,
    staleThresholdMs: staleThresholdMinutes * 60 * 1000,
  })
  const latencyDiagnostics = {
    windowHours: hours,
    bucketLimit,
    staleThresholdMinutes,
    ...diagnostics,
  }

  console.log(JSON.stringify({
    status: "success",
    updatedTime,
    dataDir,
    request: {
      hours: options.hours ?? null,
      limit: options.limit ?? null,
      staleThresholdMinutes: options.staleThresholdMinutes ?? null,
    },
    operations: {
      windowHours: hours,
      windowStartAt: diagnostics.windowStartAt,
      diagnostics: latencyDiagnostics,
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
