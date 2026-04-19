import process from "node:process"
import { resolve } from "node:path"
import { config as loadEnv } from "dotenv"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { projectDir } from "../shared/dir"
import { EventTable } from "../server/database/events"
import {
  deriveTrancheHBlindLlmConfidence,
  deriveTrancheHBlindRiskFlags,
  planDailyTrancheHBlindReview,
} from "../server/services/event-engine/tranche-h"

loadEnv({
  path: resolve(projectDir, ".env.server"),
})

const DEFAULT_WINDOW_HOURS = 24
const MAX_WINDOW_HOURS = 7 * 24
const DEFAULT_SCAN_LIMIT = 120
const MAX_SCAN_LIMIT = 500
const DEFAULT_RANDOM_SAMPLE_SIZE = 6
const DEFAULT_HIGH_RISK_SAMPLE_SIZE = 8
const MAX_SAMPLE_SIZE = 50

function clampPositiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue
  return Math.min(Math.max(1, Math.floor(parsed)), maxValue)
}

function parseArgs(argv: string[]) {
  const options: {
    hours?: number
    scanLimit?: number
    random?: number
    highRisk?: number
  } = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--hours") {
      options.hours = Number(argv[index + 1])
      index += 1
      continue
    }
    if (arg === "--scan-limit") {
      options.scanLimit = Number(argv[index + 1])
      index += 1
      continue
    }
    if (arg === "--random") {
      options.random = Number(argv[index + 1])
      index += 1
      continue
    }
    if (arg === "--high-risk") {
      options.highRisk = Number(argv[index + 1])
      index += 1
    }
  }

  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const generatedAt = Date.now()
  const hours = clampPositiveInteger(options.hours, DEFAULT_WINDOW_HOURS, MAX_WINDOW_HOURS)
  const scanLimit = clampPositiveInteger(options.scanLimit, DEFAULT_SCAN_LIMIT, MAX_SCAN_LIMIT)
  const randomSampleSize = clampPositiveInteger(options.random, DEFAULT_RANDOM_SAMPLE_SIZE, MAX_SAMPLE_SIZE)
  const highRiskSampleSize = clampPositiveInteger(options.highRisk, DEFAULT_HIGH_RISK_SAMPLE_SIZE, MAX_SAMPLE_SIZE)
  const since = generatedAt - hours * 60 * 60 * 1000

  const dataDir = resolve(projectDir, process.env.DATA_DIR || ".data")
  const db = createDatabase(sqliteConnector({
    cwd: dataDir,
    path: "db.sqlite3",
  }))

  const table = new EventTable(db as any)
  await table.init()

  const recentEvents = await table.listEvents({
    limit: scanLimit,
    scanLimit,
    changedSince: since,
    sortBy: "changed",
  })
  const details = (await Promise.all(recentEvents.map(event => table.getEventDetail(event.eventId))))
    .filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))

  const candidates = details
    .map((detail) => {
      const sourceId = detail.sourceIds[0]
      if (!sourceId) return null
      return {
        eventId: detail.eventId,
        title: detail.title,
        sourceId,
        sourceKind: detail.sourceKind,
        riskFlags: deriveTrancheHBlindRiskFlags({
          eventType: detail.eventType,
          eventSubType: detail.eventSubType,
          sourceKind: detail.sourceKind,
          entityResolvers: detail.entities.map(entity => entity.resolver),
          timelineReasons: detail.timeline.map(entry => entry.reason ?? ""),
          llmConfidence: deriveTrancheHBlindLlmConfidence({
            timelineMetadata: detail.timeline.map(entry => entry.metadata),
          }),
        }),
      }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))

  const plan = planDailyTrancheHBlindReview({
    generatedAt,
    randomSampleSize,
    highRiskSampleSize,
    candidates,
  })

  console.log(JSON.stringify({
    status: "success",
    generatedAt,
    dataDir,
    request: {
      hours,
      scanLimit,
      randomSampleSize,
      highRiskSampleSize,
    },
    blindReview: plan,
  }, null, 2))
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
