import process from "node:process"
import { resolve } from "node:path"
import { config as loadEnv } from "dotenv"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { projectDir } from "../shared/dir"
import { EventTable } from "../server/database/events"
import { evaluateEventQualityGates } from "../server/services/event-engine/quality-gates"

loadEnv({
  path: resolve(projectDir, ".env.server"),
})

async function main() {
  const dataDir = resolve(projectDir, process.env.DATA_DIR || ".data")
  const db = createDatabase(sqliteConnector({
    cwd: dataDir,
    path: "db.sqlite3",
  }))

  const table = new EventTable(db as any)
  await table.init()

  const snapshot = await table.getQualitySnapshot()
  const qualityGate = evaluateEventQualityGates(snapshot)

  console.log(JSON.stringify({
    status: qualityGate.releaseBlocked ? "failed" : "success",
    dataDir,
    snapshot,
    qualityGate,
  }, null, 2))

  if (qualityGate.releaseBlocked) {
    process.exitCode = 1
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
