import process from "node:process"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { config as loadEnv } from "dotenv"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { projectDir } from "../shared/dir"
import { CausalHypothesisTable } from "../server/database/causal-hypotheses"
import { getRows } from "../server/database/sqlite"

loadEnv({ path: resolve(projectDir, ".env.server"), quiet: true })

const MODE = "causal_hypothesis_run_consistency_check"

function parseArgs(argv: string[]) {
  const args = { json: false, findingsLimit: 100, error: null as string | null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--json") args.json = true
    else if (arg === "--repair" || arg === "--fix" || arg === "--execute") args.error = `${arg} is not supported`
    else if (arg === "--findings-limit") {
      const value = Number(argv[++index])
      if (!Number.isInteger(value) || value < 1 || value > 1000) args.error = "--findings-limit must be 1..1000"
      else args.findingsLimit = value
    } else {
      args.error = `unknown argument ${arg}`
    }
  }
  return args
}

export async function main(argv = process.argv.slice(2)) {
  const startedAt = Date.now()
  const args = parseArgs(argv)
  if (args.error) {
    const output = {
      schemaVersion: 1,
      mode: MODE,
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      summary: null,
      findings: [],
      errors: [{
        errorCode: "invalid_arguments",
        phase: "argument_parse",
        target: { scope: "global" },
        retryable: false,
        message: args.error,
      }],
    }
    console.log(JSON.stringify(output, null, 2))
    process.exitCode = 1
    return output
  }

  try {
    const db = createDatabase(sqliteConnector({
      cwd: resolve(projectDir, process.env.DATA_DIR || ".data"),
      path: "db.sqlite3",
    }))
    const table = new CausalHypothesisTable(db)
    await table.init()
    const rows = getRows<{
      run_id: string
      event_id: string
      finished_at: number | null
      created_at: number
    }>(await db.prepare(`
      SELECT run_id, event_id, finished_at, created_at
      FROM event_causal_hypothesis_runs
      WHERE status = 'failed'
        AND error_code = 'causal_hypothesis_provider_permanent_error'
    `).all())
    const allFindings = rows
      .map(row => ({
        runId: row.run_id,
        eventId: row.event_id,
        finishedAt: row.finished_at,
        missingFields: [
          row.run_id ? null : "runId",
          row.event_id ? null : "eventId",
          typeof row.finished_at === "number" ? null : "finishedAt",
        ].filter(Boolean),
        persistedTime: row.finished_at ?? row.created_at,
      }))
      .filter(row => row.missingFields.length)
      .sort((left, right) => right.missingFields.length - left.missingFields.length
        || right.persistedTime - left.persistedTime
        || left.runId.localeCompare(right.runId)
        || left.eventId.localeCompare(right.eventId))
    const findings = allFindings.slice(0, args.findingsLimit)
    const exitCode = allFindings.length ? 2 : 0
    const output = {
      schemaVersion: 1,
      mode: MODE,
      exitCode,
      durationMs: Date.now() - startedAt,
      summary: {
        permanentProviderFailedRunCount: rows.length,
        findingCount: allFindings.length,
        findingsLimit: args.findingsLimit,
      },
      findings,
      errors: [],
    }
    console.log(JSON.stringify(output, null, 2))
    process.exitCode = exitCode
    return output
  } catch {
    const output = {
      schemaVersion: 1,
      mode: MODE,
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      summary: null,
      findings: [],
      errors: [{
        errorCode: "database_unavailable",
        phase: "database_scan",
        target: { scope: "global" },
        retryable: true,
        message: "database unavailable",
      }],
    }
    console.log(JSON.stringify(output, null, 2))
    process.exitCode = 1
    return output
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main()
}
