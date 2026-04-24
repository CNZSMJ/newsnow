import type { Database } from "db0"
import type { NewsItem } from "@shared/types"

export type NewsSnapshotState = "fresh" | "stale" | "failed" | "missing"

export interface NewsSnapshotReadOptions {
  now: number
  maxAgeMs: number
}

export interface NewsSnapshotUpsertInput {
  sourceId: string
  fetchedAt: number
  items: NewsItem[]
}

export interface NewsSnapshotFailureInput {
  sourceId: string
  failedAt: number
  error: string
}

export interface NewsSnapshotRecord {
  sourceId: string
  state: NewsSnapshotState
  updatedAt: number | null
  lastSuccessfulFetchedAt: number | null
  lastFailedAt: number | null
  lastError: string | null
  itemCount: number
  items: NewsItem[]
}

interface SourceSnapshotRow {
  source_id: string
  updated_at: number
  last_successful_fetched_at: number | null
  last_failed_at: number | null
  status: "success" | "failed"
  last_error: string | null
  item_count: number
}

interface SourceItemRow {
  source_id: string
  item_id: string
  rank: number
  payload_json: string
}

function unwrapRows<T>(result: T[] | { results?: T[] }): T[] {
  return Array.isArray(result) ? result : result.results ?? []
}

function classifyState(row: SourceSnapshotRow | undefined, options: NewsSnapshotReadOptions): NewsSnapshotState {
  if (!row) return "missing"
  if (row.status === "failed") return "failed"
  return options.now - row.updated_at <= options.maxAgeMs ? "fresh" : "stale"
}

function toRecord(
  sourceId: string,
  row: SourceSnapshotRow | undefined,
  items: NewsItem[],
  options: NewsSnapshotReadOptions,
): NewsSnapshotRecord {
  return {
    sourceId,
    state: classifyState(row, options),
    updatedAt: row?.updated_at ?? null,
    lastSuccessfulFetchedAt: row?.last_successful_fetched_at ?? null,
    lastFailedAt: row?.last_failed_at ?? null,
    lastError: row?.last_error ?? null,
    itemCount: row?.item_count ?? 0,
    items,
  }
}

export class NewsSnapshotTable {
  private db

  constructor(db: Database) {
    this.db = db
  }

  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS source_snapshots (
        source_id TEXT PRIMARY KEY,
        updated_at INTEGER NOT NULL,
        last_successful_fetched_at INTEGER,
        last_failed_at INTEGER,
        status TEXT NOT NULL,
        last_error TEXT,
        item_count INTEGER NOT NULL DEFAULT 0
      );
    `).run()
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS source_items (
        source_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        rank INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (source_id, item_id)
      );
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_source_items_source_rank
      ON source_items (source_id, rank);
    `).run()
    logger.success("init news snapshot tables")
  }

  async upsertSnapshot(input: NewsSnapshotUpsertInput) {
    await this.db.prepare(`
      INSERT INTO source_snapshots (
        source_id,
        updated_at,
        last_successful_fetched_at,
        last_failed_at,
        status,
        last_error,
        item_count
      )
      VALUES (?, ?, ?, NULL, 'success', NULL, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        updated_at = excluded.updated_at,
        last_successful_fetched_at = excluded.last_successful_fetched_at,
        status = 'success',
        last_error = NULL,
        item_count = excluded.item_count;
    `).run(input.sourceId, input.fetchedAt, input.fetchedAt, input.items.length)

    await this.db.prepare("DELETE FROM source_items WHERE source_id = ?").run(input.sourceId)
    const insertItem = this.db.prepare(`
      INSERT INTO source_items (source_id, item_id, rank, payload_json)
      VALUES (?, ?, ?, ?)
    `)
    for (const [rank, item] of input.items.entries()) {
      await insertItem.run(input.sourceId, String(item.id), rank, JSON.stringify(item))
    }
  }

  async recordFetchFailure(input: NewsSnapshotFailureInput) {
    await this.db.prepare(`
      INSERT INTO source_snapshots (
        source_id,
        updated_at,
        last_successful_fetched_at,
        last_failed_at,
        status,
        last_error,
        item_count
      )
      VALUES (?, ?, NULL, ?, 'failed', ?, 0)
      ON CONFLICT(source_id) DO UPDATE SET
        last_failed_at = excluded.last_failed_at,
        status = 'failed',
        last_error = excluded.last_error;
    `).run(input.sourceId, input.failedAt, input.failedAt, input.error)
  }

  async readSnapshot(sourceId: string, options: NewsSnapshotReadOptions): Promise<NewsSnapshotRecord> {
    const snapshot = await this.db.prepare(`
      SELECT source_id, updated_at, last_successful_fetched_at, last_failed_at, status, last_error, item_count
      FROM source_snapshots
      WHERE source_id = ?
    `).get(sourceId) as SourceSnapshotRow | undefined
    const itemRows = unwrapRows(await this.db.prepare(`
      SELECT source_id, item_id, rank, payload_json
      FROM source_items
      WHERE source_id = ?
      ORDER BY rank ASC
    `).all(sourceId) as SourceItemRow[] | { results?: SourceItemRow[] })
    const items = itemRows.map(row => JSON.parse(row.payload_json) as NewsItem)

    return toRecord(sourceId, snapshot, items, options)
  }

  async readSnapshots(sourceIds: string[], options: NewsSnapshotReadOptions): Promise<NewsSnapshotRecord[]> {
    if (!sourceIds.length) return []

    const placeholders = sourceIds.map(() => "?").join(", ")
    const snapshotRows = unwrapRows(await this.db.prepare(`
      SELECT source_id, updated_at, last_successful_fetched_at, last_failed_at, status, last_error, item_count
      FROM source_snapshots
      WHERE source_id IN (${placeholders})
    `).all(...sourceIds) as SourceSnapshotRow[] | { results?: SourceSnapshotRow[] })
    const itemRows = unwrapRows(await this.db.prepare(`
      SELECT source_id, item_id, rank, payload_json
      FROM source_items
      WHERE source_id IN (${placeholders})
      ORDER BY source_id ASC, rank ASC
    `).all(...sourceIds) as SourceItemRow[] | { results?: SourceItemRow[] })
    const snapshotsBySourceId = new Map(snapshotRows.map(row => [row.source_id, row]))
    const itemsBySourceId = new Map<string, NewsItem[]>()
    for (const row of itemRows) {
      const items = itemsBySourceId.get(row.source_id) ?? []
      items.push(JSON.parse(row.payload_json) as NewsItem)
      itemsBySourceId.set(row.source_id, items)
    }

    return sourceIds.map(sourceId => toRecord(
      sourceId,
      snapshotsBySourceId.get(sourceId),
      itemsBySourceId.get(sourceId) ?? [],
      options,
    ))
  }
}
