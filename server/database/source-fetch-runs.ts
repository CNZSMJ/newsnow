import type { Database } from "db0"
import type { SourceID } from "@shared/types"
import type { SourceFetchRunRow } from "#/types"
import { getRows } from "#/database/sqlite"
import { declareSqlAccess } from "#/database/sql-ownership"

export const SOURCE_FETCH_RUNS_SQL_DECLARATIONS = [
  declareSqlAccess({
    name: "source_fetch_runs_schema",
    owner: "shared-source",
    tables: ["source_fetch_runs"],
    decisionRefs: ["TD-12", "TD-14"],
  }),
  declareSqlAccess({
    name: "source_fetch_runs_record",
    owner: "shared-source",
    tables: ["source_fetch_runs"],
    decisionRefs: ["TD-12", "TD-14"],
  }),
  declareSqlAccess({
    name: "source_fetch_runs_latest_by_source",
    owner: "shared-source",
    tables: ["source_fetch_runs"],
    decisionRefs: ["TD-12", "TD-14"],
  }),
] as const

export class SourceFetchRunsTable {
  private db

  constructor(db: Database) {
    this.db = db
  }

  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS source_fetch_runs (
        source_id TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        item_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        prev_successful_fetched_at INTEGER,
        fetch_gap_ms INTEGER
      );
    `).run()
    await this.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_source_fetch_runs_source_fetched ON source_fetch_runs(source_id, fetched_at DESC);`).run()
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_source_fetch_runs_status_source_fetched ON source_fetch_runs(source_id, status, fetched_at DESC);`).run()
  }

  async recordSourceFetchRun(input: {
    source_id: SourceID
    fetched_at: number
    status: SourceFetchRunRow["status"]
    item_count: number
    error?: string | null
  }) {
    const previousSuccessfulRun = input.status === "success"
      ? await this.db.prepare(`
          SELECT fetched_at
          FROM source_fetch_runs
          WHERE source_id = ?
            AND status = 'success'
            AND fetched_at < ?
          ORDER BY fetched_at DESC
          LIMIT 1
        `).get(input.source_id, input.fetched_at) as { fetched_at?: number | null } | undefined
      : undefined

    const prevSuccessfulFetchedAt = previousSuccessfulRun?.fetched_at ?? null
    const fetchGapMs = typeof prevSuccessfulFetchedAt === "number"
      ? Math.max(0, input.fetched_at - prevSuccessfulFetchedAt)
      : null

    await this.db.prepare(`
      INSERT OR REPLACE INTO source_fetch_runs (
        source_id, fetched_at, status, item_count, error, prev_successful_fetched_at, fetch_gap_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.source_id,
      input.fetched_at,
      input.status,
      input.item_count,
      input.error ?? null,
      prevSuccessfulFetchedAt,
      fetchGapMs,
    )
  }

  async getLastFetchedAtBySourceIds(ids: SourceID[]) {
    if (!ids.length) return {} as Partial<Record<SourceID, number>>
    const where = ids.map(() => "?").join(", ")
    const rows = getRows<{ source_id: SourceID, fetched_at: number }>(
      await this.db.prepare(`
        SELECT source_id, MAX(fetched_at) AS fetched_at
        FROM source_fetch_runs
        WHERE source_id IN (${where})
        GROUP BY source_id
      `).all(...ids),
    )
    return Object.fromEntries(rows.map(row => [row.source_id, Number(row.fetched_at) || 0])) as Partial<Record<SourceID, number>>
  }
}
