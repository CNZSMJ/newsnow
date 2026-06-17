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

function openTable() {
  const db = createDatabase(sqliteConnector({
    cwd: resolve(projectDir, process.env.DATA_DIR || ".data"),
    path: "db.sqlite3",
  }))
  return { db, table: new CausalHypothesisTable(db) }
}

function parseArgs(argv: string[]) {
  const args = {
    runId: null as string | null,
    eventId: null as string | null,
    includeSnapshots: false,
    status: null as string | null,
    limit: 20,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--include-snapshots") args.includeSnapshots = true
    else if (arg === "--run-id") args.runId = argv[++index]?.trim() || null
    else if (arg === "--event-id") args.eventId = argv[++index]?.trim() || null
    else if (arg === "--status") args.status = argv[++index]?.trim() || null
    else if (arg === "--limit") {
      const value = Number(argv[++index])
      if (Number.isInteger(value) && value > 0 && value <= 100) args.limit = value
    }
  }
  return args
}

function summarizeRun(run: Awaited<ReturnType<CausalHypothesisTable["getRun"]>>) {
  if (!run) return null
  return {
    runId: run.runId,
    eventId: run.eventId,
    status: run.status,
    triggerSource: run.triggerSource,
    triggerReason: run.triggerReason ?? null,
    retryOfRunId: run.retryOfRunId ?? null,
    attempt: run.attemptNumber,
    createdAt: run.createdAt,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    inputChecksum: run.inputChecksum,
    promptVersion: run.promptVersion ?? null,
    modelName: run.modelName ?? null,
    inputBuilderVersion: run.inputBuilderVersion,
    snapshotTruncated: Boolean(run.metadata.snapshotTruncated),
    acceptedHypothesisCount: run.metadata.acceptedHypothesisCount ?? null,
    invalidHypothesisCount: run.metadata.invalidHypothesisCount ?? null,
    errorCode: run.errorCode ?? null,
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.includeSnapshots && !args.runId) {
    console.error("--include-snapshots requires --run-id")
    process.exitCode = 1
    return
  }
  const { db, table } = openTable()
  await table.init()

  if (args.runId) {
    const run = await table.getRun(args.runId)
    if (!run) {
      console.error("run not found")
      process.exitCode = 1
      return
    }
    console.log(JSON.stringify({
      status: "success",
      mode: "causal_hypothesis_run_inspect",
      run: summarizeRun(run),
      snapshots: args.includeSnapshots
        ? {
            inputSnapshot: run.inputSnapshot,
            outputSnapshot: run.outputSnapshot,
          }
        : undefined,
    }, null, 2))
    return
  }

  if (!args.eventId) {
    console.error("requires --run-id or --event-id")
    process.exitCode = 1
    return
  }

  const statusClause = args.status ? "AND status = ?" : ""
  const params = args.status ? [args.eventId, args.status, args.limit] : [args.eventId, args.limit]
  const rows = getRows<{ run_id: string }>(await db.prepare(`
    SELECT run_id
    FROM event_causal_hypothesis_runs
    WHERE event_id = ?
      ${statusClause}
    ORDER BY COALESCE(started_at, created_at) DESC, created_at DESC, run_id DESC
    LIMIT ?
  `).all(...params))
  const runs = []
  for (const row of rows) {
    runs.push(summarizeRun(await table.getRun(row.run_id)))
  }
  console.log(JSON.stringify({
    status: "success",
    mode: "causal_hypothesis_run_inspect",
    eventId: args.eventId,
    runs,
  }, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main()
}
