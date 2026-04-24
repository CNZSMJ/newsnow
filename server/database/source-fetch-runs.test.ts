import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import {
  SOURCE_FETCH_RUNS_SQL_DECLARATIONS,
  SourceFetchRunsTable,
} from "#/database/source-fetch-runs"
import { assertSqlAccessDeclarations } from "#/database/sql-ownership"

const cleanupPaths: string[] = []

afterEach(() => {
  while (cleanupPaths.length) {
    const path = cleanupPaths.pop()
    if (!path) continue
    rmSync(path, { recursive: true, force: true })
  }
})

function createSourceFetchRunsTable() {
  const cwd = mkdtempSync(join(tmpdir(), "newsnow-source-fetch-runs-db-"))
  cleanupPaths.push(cwd)
  const db = createDatabase(sqliteConnector({
    cwd,
    name: "source-fetch-runs-test",
  }))
  return { db, table: new SourceFetchRunsTable(db) }
}

describe("sourceFetchRunsTable", () => {
  it("declares shared-source ownership for all SQL access", () => {
    expect(() => assertSqlAccessDeclarations(SOURCE_FETCH_RUNS_SQL_DECLARATIONS)).not.toThrow()
    expect(SOURCE_FETCH_RUNS_SQL_DECLARATIONS.every(declaration => declaration.owner === "shared-source")).toBe(true)
  })

  it("initializes schema and records fetch gaps", async () => {
    const { db, table } = createSourceFetchRunsTable()
    await table.init()

    await table.recordSourceFetchRun({
      source_id: "wallstreetcn-quick",
      fetched_at: 1000,
      status: "success",
      item_count: 10,
    })
    await table.recordSourceFetchRun({
      source_id: "wallstreetcn-quick",
      fetched_at: 1500,
      status: "success",
      item_count: 12,
    })

    const instance: any = db.getInstance()
    const row = instance.prepare(`
      SELECT prev_successful_fetched_at, fetch_gap_ms
      FROM source_fetch_runs
      WHERE source_id = ?
        AND fetched_at = ?
    `).get("wallstreetcn-quick", 1500)

    expect(row).toMatchObject({
      prev_successful_fetched_at: 1000,
      fetch_gap_ms: 500,
    })
    await expect(table.getLastFetchedAtBySourceIds(["wallstreetcn-quick"])).resolves.toEqual({
      "wallstreetcn-quick": 1500,
    })
  })
})
