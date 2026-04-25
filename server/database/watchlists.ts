import process from "node:process"
import type { WatchlistQuery, WatchlistRecord } from "@shared/types"
import type { Database } from "db0"
import type { WatchlistRow } from "#/types"
import { getRows, parseJSON } from "#/database/sqlite"

export class WatchlistTable {
  private db

  constructor(db: Database) {
    this.db = db
  }

  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS watchlists (
        watchlist_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        query_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_checked_at INTEGER
      );
    `).run()
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_watchlists_updated ON watchlists(updated_at DESC);`).run()
    logger.success("init watchlists table")
  }

  async upsert(row: WatchlistRow) {
    await this.db.prepare(`
      INSERT INTO watchlists (
        watchlist_id, name, description, query_json, created_at, updated_at, last_checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(watchlist_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        query_json = excluded.query_json,
        updated_at = excluded.updated_at
    `).run(
      row.watchlist_id,
      row.name,
      row.description,
      row.query_json,
      row.created_at,
      row.updated_at,
      row.last_checked_at,
    )
  }

  async list(): Promise<WatchlistRecord[]> {
    const rows = getRows<WatchlistRow>(await this.db.prepare(`
      SELECT watchlist_id, name, description, query_json, created_at, updated_at, last_checked_at
      FROM watchlists
      ORDER BY updated_at DESC, created_at DESC
    `).all())

    return rows.map(row => this.toRecord(row))
  }

  async get(id: string): Promise<WatchlistRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT watchlist_id, name, description, query_json, created_at, updated_at, last_checked_at
      FROM watchlists
      WHERE watchlist_id = ?
    `).get(id) as WatchlistRow | undefined

    if (!row) return undefined
    return this.toRecord(row)
  }

  async touchCheckedAt(id: string, checkedAt = Date.now()) {
    await this.db.prepare(`
      UPDATE watchlists
      SET last_checked_at = ?, updated_at = MAX(updated_at, ?)
      WHERE watchlist_id = ?
    `).run(checkedAt, checkedAt, id)
  }

  private toRecord(row: WatchlistRow): WatchlistRecord {
    return {
      watchlistId: row.watchlist_id,
      name: row.name,
      description: row.description ?? undefined,
      query: parseJSON<WatchlistQuery>(row.query_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastCheckedAt: row.last_checked_at ?? undefined,
    }
  }
}

let sharedWatchlistTable: WatchlistTable | undefined
let sharedWatchlistTablePromise: Promise<WatchlistTable | undefined> | undefined

export async function getWatchlistTable() {
  if (process.env.ENABLE_CACHE === "false") return
  if (sharedWatchlistTable) return sharedWatchlistTable
  if (sharedWatchlistTablePromise) return sharedWatchlistTablePromise

  sharedWatchlistTablePromise = (async () => {
    try {
      const db = useDatabase()
      const watchlistTable = new WatchlistTable(db)
      if (process.env.INIT_TABLE !== "false") await watchlistTable.init()
      sharedWatchlistTable = watchlistTable
      return watchlistTable
    } catch (e) {
      logger.error("failed to init watchlist database ", e)
      return undefined
    }
  })()

  const table = await sharedWatchlistTablePromise
  if (!table) {
    sharedWatchlistTablePromise = undefined
  }
  return table
}
