import process from "node:process"
import { resolve } from "node:path"
import { config as loadEnv } from "dotenv"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { consola } from "consola"
import { projectDir } from "../shared/dir"
import { EventTable } from "../server/database/events"

loadEnv({
  path: resolve(projectDir, ".env.server"),
})
;

(globalThis as typeof globalThis & { logger: typeof consola }).logger = consola.withTag("repair-event-timeline")

function parseArgs(argv: string[]) {
  const options: {
    limit?: number
    eventIds?: string[]
  } = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--limit") {
      const value = Number(argv[index + 1])
      if (Number.isFinite(value) && value > 0) {
        options.limit = Math.floor(value)
        index += 1
      }
      continue
    }
    if (arg === "--event-id") {
      const value = argv[index + 1]?.trim()
      if (value) {
        options.eventIds = [...(options.eventIds ?? []), value]
        index += 1
      }
    }
  }

  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const dataDir = resolve(projectDir, process.env.DATA_DIR || ".data")
  const db = createDatabase(sqliteConnector({
    cwd: dataDir,
    path: "db.sqlite3",
  }))

  const table = new EventTable(db as any)
  await table.init()
  const timelineRepair = await table.repairDuplicateConfirmationTimeline(options)

  console.log(JSON.stringify({
    status: "success",
    dataDir,
    timelineRepair,
  }, null, 2))
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
