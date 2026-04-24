import process from "node:process"
import { resolve } from "node:path"
import { config as loadEnv } from "dotenv"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { projectDir } from "../shared/dir"
import { buildSurfaceQueryPlanStatements } from "../server/services/performance/sql-plan"

loadEnv({
  path: resolve(projectDir, ".env.server"),
})

const HELP_TEXT = `
Usage:
  pnpm perf:query-plans [--name <plan-name>]

Options:
  --name <plan-name>  Only run one query plan.
  --help, -h          Show this help text.
`.trim()

function parseArgs(argv: string[]) {
  const args: {
    name?: string
    help?: boolean
  } = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") {
      args.help = true
      continue
    }
    if (arg === "--name") {
      args.name = argv[index + 1]
      index += 1
    }
  }

  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP_TEXT)
    return
  }

  const dataDir = resolve(projectDir, process.env.DATA_DIR || ".data")
  const db = createDatabase(sqliteConnector({
    cwd: dataDir,
    path: "db.sqlite3",
  }))

  const statements = buildSurfaceQueryPlanStatements()
    .filter(statement => !args.name || statement.name === args.name)

  const plans = []
  for (const statement of statements) {
    const queryPlan = await db.prepare(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...statement.params)
    plans.push({
      ...statement,
      queryPlan,
    })
  }

  console.log(JSON.stringify({
    status: "success",
    updatedTime: Date.now(),
    command: "pnpm perf:query-plans",
    dataDir,
    count: plans.length,
    plans,
  }, null, 2))
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
