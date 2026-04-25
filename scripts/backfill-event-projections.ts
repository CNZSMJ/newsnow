import process from "node:process"
import { resolve } from "node:path"
import { config as loadEnv } from "dotenv"
import { consola } from "consola"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { projectDir } from "../shared/dir"
import { EventProjectionTable } from "../server/database/event-projections"
import { EventTable } from "../server/database/events"
import { backfillInvestmentProjections } from "../server/services/event-engine/projection-pipeline"

loadEnv({
  path: resolve(projectDir, ".env.server"),
});

(globalThis as typeof globalThis & { logger: typeof consola }).logger = consola.withTag("event-projection-backfill")

const HELP_TEXT = `
Usage:
  pnpm events:backfill-projections [--limit <number>] [--scan-limit <number>] [--sort latest|investment|changed]

Options:
  --limit <number>       Number of canonical events to backfill. Default: 400, max: 2000
  --scan-limit <number>  Canonical query scan limit. Default: max(limit, 400)
  --sort <mode>          Canonical event ordering. Default: investment
  --help, -h             Show this help text
`.trim()

function parseArgs(argv: string[]) {
  const options: {
    limit?: number
    scanLimit?: number
    sortBy?: "latest" | "investment" | "changed"
    help?: boolean
  } = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") {
      options.help = true
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
    if (arg === "--scan-limit") {
      const value = Number(argv[index + 1])
      if (Number.isFinite(value) && value > 0) {
        options.scanLimit = Math.floor(value)
        index += 1
      }
      continue
    }
    if (arg === "--sort") {
      const value = argv[index + 1]
      if (value === "latest" || value === "investment" || value === "changed") {
        options.sortBy = value
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
  const eventTable = new EventTable(db)
  const projectionTable = new EventProjectionTable(db)
  await eventTable.init()
  await projectionTable.init()

  const result = await backfillInvestmentProjections(eventTable, projectionTable, {
    limit: options.limit,
    scanLimit: options.scanLimit,
    sortBy: options.sortBy,
  })

  console.log(JSON.stringify({
    status: "success",
    updatedTime: Date.now(),
    command: "pnpm events:backfill-projections",
    dataDir,
    result,
  }, null, 2))
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
