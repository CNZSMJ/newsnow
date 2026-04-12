import process from "node:process"
import type { EventRecord, WatchlistDetail, WatchlistQuery, WatchlistRecord } from "@shared/types"
import type { Database } from "db0"
import type { WatchlistRow } from "#/types"
import { getEventTable } from "#/database/events"
import { getRows, parseJSON } from "#/database/sqlite"
import { getEventRecencyAnchor, scoreInvestmentEvent } from "#/services/event-engine/ranking"

export function sortWatchlistEvents(records: EventRecord[], sortBy: "latest" | "investment" = "investment") {
  const cloned = [...records]
  if (sortBy === "latest") {
    cloned.sort((a, b) => {
      const timeA = getEventRecencyAnchor(a)
      const timeB = getEventRecencyAnchor(b)
      if (timeB !== timeA) return timeB - timeA
      return (b.materialityScore ?? 0) - (a.materialityScore ?? 0)
    })
    return cloned
  }

  cloned.sort((a, b) => {
    const scoreDiff = scoreInvestmentEvent(b, {
      lifecycle: {
        confirmed: 24,
        updated: 14,
        detected: 10,
      },
      directionalDivisor: 8,
      materialityWeight: 0.4,
      tradabilityWeight: 0.22,
      authorityWeight: 0.14,
      freshnessWeight: 0.12,
      surpriseWeight: 0,
    }) - scoreInvestmentEvent(a, {
      lifecycle: {
        confirmed: 24,
        updated: 14,
        detected: 10,
      },
      directionalDivisor: 8,
      materialityWeight: 0.4,
      tradabilityWeight: 0.22,
      authorityWeight: 0.14,
      freshnessWeight: 0.12,
      surpriseWeight: 0,
    })
    if (scoreDiff !== 0) return scoreDiff
    return getEventRecencyAnchor(b) - getEventRecencyAnchor(a)
  })
  return cloned
}

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

  async getDetail(id: string, limit = 20, sortBy: "latest" | "investment" = "investment"): Promise<WatchlistDetail | undefined> {
    const record = await this.get(id)
    if (!record) return undefined
    const eventTable = await getEventTable()
    const recentEvents = eventTable
      ? await queryWatchlistEvents(record.query, { limit, sortBy })
      : []
    return {
      ...record,
      recentEvents,
    }
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

export async function queryWatchlistEvents(query: WatchlistQuery, options?: {
  limit?: number
  sortBy?: "latest" | "investment"
}) {
  const eventTable = await getEventTable()
  if (!eventTable) return []
  const limit = options?.limit ?? 20
  const sortBy = options?.sortBy ?? "investment"

  const seedQueries = [
    ...(query.entities?.map(entity => ({ entity })) ?? []),
    ...(query.topics?.map(topic => ({ topic })) ?? []),
    ...(query.sourceIds?.map(sourceId => ({ sourceId })) ?? []),
  ]
  const queries = seedQueries.length ? seedQueries : [{}]
  const merged = new Map<string, EventRecord>()

  for (const seed of queries) {
    const rows = await eventTable.listEvents({
      limit: Math.max(limit * 5, 100),
      eventType: query.eventTypes?.[0],
      eventSubType: query.eventSubTypes?.[0],
      sourceId: "sourceId" in seed ? seed.sourceId : undefined,
      topic: "topic" in seed ? seed.topic : undefined,
      entity: "entity" in seed ? seed.entity : undefined,
      market: query.markets?.[0],
      directionalView: query.directionalViews?.[0],
      minMaterialityScore: query.minMaterialityScore,
      minAuthorityScore: query.minAuthorityScore,
      sortBy,
    })
    for (const row of rows) {
      merged.set(row.eventId, row)
    }
  }

  const filtered = [...merged.values()].filter((row) => {
    if (query.eventTypes?.length && !query.eventTypes.includes(row.eventType)) return false
    if (query.eventSubTypes?.length && !query.eventSubTypes.includes(row.eventSubType)) return false
    if (query.sourceIds?.length && !row.sourceIds.some(sourceId => query.sourceIds?.includes(sourceId))) return false
    if (query.topics?.length && !row.topicTags.some(tag => query.topics?.includes(tag))) return false
    if (query.markets?.length && !row.affectedMarkets.some(market => query.markets?.includes(market))) return false
    if (query.directionalViews?.length && !query.directionalViews.includes(row.directionalView ?? "unknown")) return false
    if (query.minMaterialityScore !== undefined && (row.materialityScore ?? 0) < query.minMaterialityScore) return false
    if (query.minAuthorityScore !== undefined && (row.authorityScore ?? 0) < query.minAuthorityScore) return false
    return true
  })

  return sortWatchlistEvents(filtered, sortBy).slice(0, limit)
}

export async function getWatchlistTable() {
  try {
    const db = useDatabase()
    if (process.env.ENABLE_CACHE === "false") return
    const watchlistTable = new WatchlistTable(db)
    if (process.env.INIT_TABLE !== "false") await watchlistTable.init()
    return watchlistTable
  } catch (e) {
    logger.error("failed to init watchlist database ", e)
  }
}
