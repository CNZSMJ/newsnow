import type { Database } from "db0"
import type { InvestmentEventBrief, InvestmentEventDetail } from "@shared/types"
import { declareSqlAccess } from "#/database/sql-ownership"

export const REQUIRED_EVENT_QUERY_INDEX_NAMES = [
  "latest",
  "search",
  "entity",
  "watchlist",
  "detail",
  "related",
] as const

export type EventQueryIndexName = typeof REQUIRED_EVENT_QUERY_INDEX_NAMES[number]

export const EVENT_PROJECTION_SQL_DECLARATIONS = [
  declareSqlAccess({
    name: "event_projection_schema",
    owner: "investment-event",
    tables: ["event_projection", "event_query_indexes"],
    decisionRefs: ["TD-3", "TD-10", "TD-11"],
  }),
  declareSqlAccess({
    name: "event_projection_write",
    owner: "investment-event",
    tables: ["event_projection", "event_query_indexes"],
    decisionRefs: ["TD-3", "TD-10", "TD-11"],
  }),
  declareSqlAccess({
    name: "event_projection_read",
    owner: "investment-event",
    tables: ["event_projection", "event_query_indexes"],
    decisionRefs: ["TD-3", "TD-10", "TD-11"],
  }),
] as const

interface EventProjectionRow {
  event_id: string
  projection_version: number
  projection_updated_at: number
  canonical_updated_at: number
  canonical_checksum: string
  repair_status: "ok" | "stale" | "repair_required"
  event_family: string
  action_bucket: string
  directional_view: string
  materiality_score: number
  tradability_score: number
  authority_score: number
  latest_lifecycle_at: number | null
  published_at: number | null
  ingested_at: number | null
  primary_subject_json: string | null
  affected_markets_json: string
  topic_tags_json: string
  source_ids_json: string
  search_text: string
  brief_json: string
  detail_json: string | null
}

interface EventQueryIndexRow {
  index_name: EventQueryIndexName
  index_value: string
  event_id: string
  rank_score: number
  sort_time: number
  metadata_json: string
}

export interface EventProjectionInput {
  eventId: string
  canonicalUpdatedAt: number
  canonicalChecksum: string
  brief: InvestmentEventBrief
  detail?: InvestmentEventDetail
  indexedEntities?: string[]
  relatedEventIds?: string[]
  watchlistKeys?: string[]
}

export interface EventProjectionRecord {
  eventId: string
  projectionVersion: number
  projectionUpdatedAt: number
  canonicalUpdatedAt: number
  canonicalChecksum: string
  repairStatus: EventProjectionRow["repair_status"]
  brief: InvestmentEventBrief
  detail?: InvestmentEventDetail
}

export interface EventQueryIndexEntry {
  indexName: EventQueryIndexName
  indexValue: string
  eventId: string
  rankScore: number
  sortTime: number
  metadata: Record<string, unknown>
}

function unwrapRows<T>(result: T[] | { results?: T[] }): T[] {
  return Array.isArray(result) ? result : result.results ?? []
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value))))
}

function buildSearchText(brief: InvestmentEventBrief) {
  return uniqueValues([
    brief.title,
    brief.summary,
    brief.whatHappened,
    brief.subjectSummary,
    brief.whyItMatters,
    brief.eventFamily,
    ...brief.whoIsAffected,
    ...brief.relatedTopics,
    ...brief.affectedEntities.flatMap(entity => [entity.entityId, entity.label, entity.code]),
  ]).join(" ").toLowerCase()
}

function getSortTime(brief: InvestmentEventBrief) {
  return brief.latestLifecycleAt ?? brief.publishedAt ?? brief.ingestedAt ?? 0
}

function getRankScore(brief: InvestmentEventBrief) {
  return (brief.materialityScore * 0.4) + (brief.tradabilityScore * 0.35) + (brief.authorityScore * 0.25)
}

function toRecord(row: EventProjectionRow): EventProjectionRecord {
  return {
    eventId: row.event_id,
    projectionVersion: row.projection_version,
    projectionUpdatedAt: row.projection_updated_at,
    canonicalUpdatedAt: row.canonical_updated_at,
    canonicalChecksum: row.canonical_checksum,
    repairStatus: row.repair_status,
    brief: JSON.parse(row.brief_json) as InvestmentEventBrief,
    detail: row.detail_json ? JSON.parse(row.detail_json) as InvestmentEventDetail : undefined,
  }
}

function toIndexEntry(row: EventQueryIndexRow): EventQueryIndexEntry {
  return {
    indexName: row.index_name,
    indexValue: row.index_value,
    eventId: row.event_id,
    rankScore: row.rank_score,
    sortTime: row.sort_time,
    metadata: JSON.parse(row.metadata_json || "{}") as Record<string, unknown>,
  }
}

export class EventProjectionTable {
  private db

  constructor(db: Database) {
    this.db = db
  }

  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS event_projection (
        event_id TEXT PRIMARY KEY,
        projection_version INTEGER NOT NULL,
        projection_updated_at INTEGER NOT NULL,
        canonical_updated_at INTEGER NOT NULL,
        canonical_checksum TEXT NOT NULL,
        repair_status TEXT NOT NULL,
        event_family TEXT NOT NULL,
        action_bucket TEXT NOT NULL,
        directional_view TEXT NOT NULL,
        materiality_score INTEGER NOT NULL,
        tradability_score INTEGER NOT NULL,
        authority_score INTEGER NOT NULL,
        latest_lifecycle_at INTEGER,
        published_at INTEGER,
        ingested_at INTEGER,
        primary_subject_json TEXT,
        affected_markets_json TEXT NOT NULL,
        topic_tags_json TEXT NOT NULL,
        source_ids_json TEXT NOT NULL,
        search_text TEXT NOT NULL,
        brief_json TEXT NOT NULL,
        detail_json TEXT
      );
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_projection_family_sort
      ON event_projection(event_family, latest_lifecycle_at DESC, published_at DESC, ingested_at DESC);
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_projection_action_sort
      ON event_projection(action_bucket, latest_lifecycle_at DESC, published_at DESC, ingested_at DESC);
    `).run()
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS event_query_indexes (
        index_name TEXT NOT NULL,
        index_value TEXT NOT NULL,
        event_id TEXT NOT NULL,
        rank_score REAL NOT NULL,
        sort_time INTEGER NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (index_name, index_value, event_id)
      );
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_query_indexes_lookup
      ON event_query_indexes(index_name, index_value, sort_time DESC, rank_score DESC);
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_event_query_indexes_event
      ON event_query_indexes(event_id, index_name);
    `).run()
  }

  async upsertProjection(input: EventProjectionInput) {
    const now = Date.now()
    const sortTime = getSortTime(input.brief)
    const rankScore = getRankScore(input.brief)

    await this.db.prepare(`
      INSERT INTO event_projection (
        event_id,
        projection_version,
        projection_updated_at,
        canonical_updated_at,
        canonical_checksum,
        repair_status,
        event_family,
        action_bucket,
        directional_view,
        materiality_score,
        tradability_score,
        authority_score,
        latest_lifecycle_at,
        published_at,
        ingested_at,
        primary_subject_json,
        affected_markets_json,
        topic_tags_json,
        source_ids_json,
        search_text,
        brief_json,
        detail_json
      )
      VALUES (?, 1, ?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        projection_version = event_projection.projection_version + 1,
        projection_updated_at = excluded.projection_updated_at,
        canonical_updated_at = excluded.canonical_updated_at,
        canonical_checksum = excluded.canonical_checksum,
        repair_status = 'ok',
        event_family = excluded.event_family,
        action_bucket = excluded.action_bucket,
        directional_view = excluded.directional_view,
        materiality_score = excluded.materiality_score,
        tradability_score = excluded.tradability_score,
        authority_score = excluded.authority_score,
        latest_lifecycle_at = excluded.latest_lifecycle_at,
        published_at = excluded.published_at,
        ingested_at = excluded.ingested_at,
        primary_subject_json = excluded.primary_subject_json,
        affected_markets_json = excluded.affected_markets_json,
        topic_tags_json = excluded.topic_tags_json,
        source_ids_json = excluded.source_ids_json,
        search_text = excluded.search_text,
        brief_json = excluded.brief_json,
        detail_json = excluded.detail_json;
    `).run(
      input.eventId,
      now,
      input.canonicalUpdatedAt,
      input.canonicalChecksum,
      input.brief.eventFamily,
      input.brief.actionBucket,
      input.brief.signalDirection,
      input.brief.materialityScore,
      input.brief.tradabilityScore,
      input.brief.authorityScore,
      input.brief.latestLifecycleAt ?? null,
      input.brief.publishedAt ?? null,
      input.brief.ingestedAt ?? null,
      input.brief.primarySubject ? JSON.stringify(input.brief.primarySubject) : null,
      JSON.stringify(input.brief.affectedMarkets),
      JSON.stringify(input.brief.relatedTopics),
      JSON.stringify([input.brief.sourceSummary.primarySourceId].filter(Boolean)),
      buildSearchText(input.brief),
      JSON.stringify(input.brief),
      input.detail ? JSON.stringify(input.detail) : null,
    )

    await this.db.prepare("DELETE FROM event_query_indexes WHERE event_id = ?").run(input.eventId)
    await this.insertIndexEntries(input, sortTime, rankScore)
  }

  async getProjection(eventId: string): Promise<EventProjectionRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT *
      FROM event_projection
      WHERE event_id = ?
    `).get(eventId) as EventProjectionRow | undefined
    return row ? toRecord(row) : undefined
  }

  async listIndexEntries(indexName: EventQueryIndexName, indexValue: string): Promise<EventQueryIndexEntry[]> {
    const rows = unwrapRows(await this.db.prepare(`
      SELECT index_name, index_value, event_id, rank_score, sort_time, metadata_json
      FROM event_query_indexes
      WHERE index_name = ?
        AND index_value = ?
      ORDER BY sort_time DESC, rank_score DESC
    `).all(indexName, indexValue) as EventQueryIndexRow[] | { results?: EventQueryIndexRow[] })
    return rows.map(toIndexEntry)
  }

  private async insertIndexEntries(input: EventProjectionInput, sortTime: number, rankScore: number) {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO event_query_indexes (
        index_name, index_value, event_id, rank_score, sort_time, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    const entries: Array<{ indexName: EventQueryIndexName, indexValue: string, eventId: string, metadata?: Record<string, unknown> }> = [
      { indexName: "latest", indexValue: "all", eventId: input.eventId },
      { indexName: "detail", indexValue: input.eventId, eventId: input.eventId },
      ...uniqueValues([
        input.brief.title,
        input.brief.eventFamily,
        input.brief.primarySubject?.label,
        ...input.brief.relatedTopics,
      ]).map(value => ({ indexName: "search" as const, indexValue: value.toLowerCase(), eventId: input.eventId })),
      ...uniqueValues([
        ...input.brief.affectedEntities.flatMap(entity => [entity.entityId, entity.label, entity.code]),
        ...input.indexedEntities ?? [],
      ]).map(value => ({ indexName: "entity" as const, indexValue: value, eventId: input.eventId })),
      ...uniqueValues(input.watchlistKeys ?? []).map(value => ({ indexName: "watchlist" as const, indexValue: value, eventId: input.eventId })),
      ...uniqueValues(input.relatedEventIds ?? []).map(value => ({
        indexName: "related" as const,
        indexValue: input.eventId,
        eventId: value,
        metadata: { relatedTo: input.eventId },
      })),
    ]

    for (const entry of entries) {
      await insert.run(
        entry.indexName,
        entry.indexValue,
        entry.eventId,
        rankScore,
        sortTime,
        JSON.stringify(entry.metadata ?? {}),
      )
    }
  }
}
