import process from "node:process"
import md5 from "md5"
import type { AffectedMarket, DirectionalView } from "@shared/event-profile"
import { type IndustryTag, allIndustryTags, resolveIndustryTagsFromKeywordQuery } from "@shared/industry"
import type {
  EventDetail,
  EventEntityLink,
  EventEvidence,
  EventFact,
  EventLifecycleState,
  EventRecord,
  EventSubType,
  EventTimelineEntry,
  EventType,
  SourceID,
} from "@shared/types"
import sources from "@shared/sources"
import { consola } from "consola"
import type { Database } from "db0"
import { getRows, parseJSON } from "#/database/sqlite"
import {
  getEntityLinkPersistenceKey,
  normalizeEntityLinks,
  normalizeFactEntityIds,
  normalizePrimaryEntityName,
} from "#/services/event-engine/entity-normalization"
import { extractEntityLinks } from "#/services/event-engine/entity"
import { getEntityLookupTerms } from "#/services/event-engine/entity-registry"
import { buildImpactSnapshot } from "#/services/event-engine/impact"
import { getExchangeDisclosureMarkets, getSourceEventProfile } from "#/services/event-engine/profiles"
import { resolveEventClassification } from "#/services/event-engine/resolver"
import { HIGH_VALUE_SOURCE_KINDS, type EventBaseQualitySnapshot } from "#/services/event-engine/slo"
import { inferIndustryTagsFromText } from "#/services/event-engine/text"
import type { EntityLinkRow, EventEvidenceRow, EventFactRow, EventRow, EventSourceRow, EventTimelineRow, RawItemRow } from "#/types"
import { getEventRecencyAnchor, scoreInvestmentEvent } from "#/services/event-engine/ranking"

function getEventTableLogger() {
  return (globalThis as typeof globalThis & {
    logger?: Pick<typeof consola, "success" | "error">
  }).logger ?? consola.withTag("event-table")
}

interface EventQueryRow extends EventRow {
  evidence_count?: number
  source_ids_json?: string | null
  latest_lifecycle_state?: EventLifecycleState | null
  latest_lifecycle_at?: number | null
}

export interface EventDetailRow extends EventDetail {
  seriesKey?: string
  periodKey?: string
  releaseCadence?: string
}

interface EventEvidenceQueryRow {
  event_id: string
  raw_id: string
  source_id: SourceID
  source_item_id?: string | null
  title: string
  summary?: string | null
  canonical_url: string
  published_at?: number | null
  fetched_at?: number | null
  source_priority?: number | null
  authority_level?: string | null
  parser_family?: string | null
  extraction_status?: string | null
  extraction_error?: string | null
}

export interface EventOperationalLatencyDiagnosticBucket {
  sourceKind: string
  sourceId?: SourceID
  sourceName?: string
  totalEvents: number
  latencySampleCount: number
  staleEventCount: number
  freshEventCount: number
  staleSharePct: number | null
  avgIngestLatencyMs: number | null
  p95IngestLatencyMs: number | null
  maxIngestLatencyMs: number | null
  avgPublicationAgeMs: number | null
  p95PublicationAgeMs: number | null
  maxPublicationAgeMs: number | null
  avgLastSeenDelayMs: number | null
  p95LastSeenDelayMs: number | null
  maxLastSeenDelayMs: number | null
}

export interface EventOperationalLatencyDiagnostics {
  generatedAt: number
  windowStartAt: number
  staleThresholdMs: number
  sourceKindBreakdown: EventOperationalLatencyDiagnosticBucket[]
  sourceBreakdown: EventOperationalLatencyDiagnosticBucket[]
}

function percentageOrNull(numerator: number, denominator: number) {
  if (denominator <= 0) return null
  return Number(((numerator / denominator) * 100).toFixed(2))
}

function percentileFromSorted(values: number[], percentile: number) {
  if (!values.length) return null
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentile) - 1))
  return values[index] ?? null
}

function summarizeOperationalDurations(values: number[]) {
  if (!values.length) {
    return {
      avgMs: null,
      p95Ms: null,
      maxMs: null,
    }
  }

  const sortedValues = [...values].sort((left, right) => left - right)
  return {
    avgMs: Math.round(sortedValues.reduce((sum, value) => sum + value, 0) / sortedValues.length),
    p95Ms: percentileFromSorted(sortedValues, 0.95),
    maxMs: sortedValues[sortedValues.length - 1] ?? null,
  }
}

export class EventTable {
  private db
  private transactionDepth = 0

  constructor(db: Database) {
    this.db = db
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const transactionId = this.transactionDepth
    const savepointName = `event_tx_${transactionId}`

    if (this.transactionDepth === 0) {
      await this.db.prepare("BEGIN IMMEDIATE").run()
    } else {
      await this.db.prepare(`SAVEPOINT ${savepointName}`).run()
    }

    this.transactionDepth += 1
    try {
      const result = await fn()
      this.transactionDepth -= 1
      if (this.transactionDepth === 0) {
        await this.db.prepare("COMMIT").run()
      } else {
        await this.db.prepare(`RELEASE SAVEPOINT ${savepointName}`).run()
      }
      return result
    } catch (error) {
      this.transactionDepth -= 1
      if (this.transactionDepth === 0) {
        await this.db.prepare("ROLLBACK").run()
      } else {
        await this.db.prepare(`ROLLBACK TO SAVEPOINT ${savepointName}`).run()
        await this.db.prepare(`RELEASE SAVEPOINT ${savepointName}`).run()
      }
      throw error
    }
  }

  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS raw_items (
        raw_id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_item_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        mobile_url TEXT,
        published_at INTEGER,
        fetched_at INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL
      );
    `).run()
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_raw_items_source_fetched ON raw_items(source_id, fetched_at DESC);`).run()
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_raw_items_fingerprint ON raw_items(fingerprint);`).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        cluster_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        summary TEXT,
        event_type TEXT NOT NULL,
        event_subtype TEXT NOT NULL DEFAULT 'other',
        source_kind TEXT,
        published_at INTEGER,
        ingested_at INTEGER NOT NULL,
        canonical_url TEXT,
        primary_entity_name TEXT,
        series_key TEXT,
        period_key TEXT,
        release_cadence TEXT,
        importance TEXT NOT NULL,
        sentiment TEXT,
        directional_view TEXT,
        directional_confidence INTEGER,
        materiality_score INTEGER,
        tradability_score INTEGER,
        authority_score INTEGER,
        freshness_score INTEGER,
        surprise_score INTEGER,
        affected_markets_json TEXT NOT NULL DEFAULT '[]',
        impact_summary_json TEXT NOT NULL DEFAULT '[]',
        degraded INTEGER NOT NULL DEFAULT 0,
        topic_tags_json TEXT NOT NULL,
        last_seen_at INTEGER NOT NULL,
        status TEXT NOT NULL
      );
    `).run()
    await this.ensureColumn("events", "event_subtype", "TEXT NOT NULL DEFAULT 'other'")
    await this.ensureColumn("events", "primary_entity_name", "TEXT")
    await this.ensureColumn("events", "source_kind", "TEXT")
    await this.ensureColumn("events", "series_key", "TEXT")
    await this.ensureColumn("events", "period_key", "TEXT")
    await this.ensureColumn("events", "release_cadence", "TEXT")
    await this.ensureColumn("events", "directional_view", "TEXT")
    await this.ensureColumn("events", "directional_confidence", "INTEGER")
    await this.ensureColumn("events", "materiality_score", "INTEGER")
    await this.ensureColumn("events", "tradability_score", "INTEGER")
    await this.ensureColumn("events", "authority_score", "INTEGER")
    await this.ensureColumn("events", "freshness_score", "INTEGER")
    await this.ensureColumn("events", "surprise_score", "INTEGER")
    await this.ensureColumn("events", "affected_markets_json", "TEXT NOT NULL DEFAULT '[]'")
    await this.ensureColumn("events", "impact_summary_json", "TEXT NOT NULL DEFAULT '[]'")
    await this.ensureColumn("events", "degraded", "INTEGER NOT NULL DEFAULT 0")
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_published ON events(published_at DESC, ingested_at DESC);`).run()
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, published_at DESC);`).run()
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_subtype ON events(event_subtype, published_at DESC);`).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS event_evidence (
        event_id TEXT NOT NULL,
        raw_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_item_id TEXT,
        title TEXT,
        summary TEXT,
        canonical_url TEXT,
        published_at INTEGER,
        fetched_at INTEGER,
        source_priority INTEGER NOT NULL DEFAULT 0,
        authority_level TEXT,
        parser_family TEXT,
        passthrough_payload_json TEXT,
        extraction_status TEXT,
        extraction_error TEXT,
        rank INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (event_id, raw_id)
      );
    `).run()
    await this.ensureColumn("event_evidence", "source_item_id", "TEXT")
    await this.ensureColumn("event_evidence", "title", "TEXT")
    await this.ensureColumn("event_evidence", "summary", "TEXT")
    await this.ensureColumn("event_evidence", "canonical_url", "TEXT")
    await this.ensureColumn("event_evidence", "published_at", "INTEGER")
    await this.ensureColumn("event_evidence", "fetched_at", "INTEGER")
    await this.ensureColumn("event_evidence", "source_priority", "INTEGER NOT NULL DEFAULT 0")
    await this.ensureColumn("event_evidence", "authority_level", "TEXT")
    await this.ensureColumn("event_evidence", "parser_family", "TEXT")
    await this.ensureColumn("event_evidence", "passthrough_payload_json", "TEXT")
    await this.ensureColumn("event_evidence", "extraction_status", "TEXT")
    await this.ensureColumn("event_evidence", "extraction_error", "TEXT")
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_event_evidence_source ON event_evidence(source_id, event_id);`).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS event_sources (
        source_id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL,
        authority_level TEXT NOT NULL,
        parser_family TEXT NOT NULL,
        default_event_type TEXT NOT NULL,
        default_event_subtype TEXT,
        asset_classes_json TEXT NOT NULL,
        markets_json TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS event_facts (
        fact_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        evidence_id TEXT,
        fact_type TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value TEXT,
        unit TEXT,
        previous_value TEXT,
        delta TEXT,
        direction TEXT,
        effective_at INTEGER,
        entity_id TEXT,
        confidence REAL NOT NULL,
        payload_json TEXT NOT NULL
      );
    `).run()
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_event_facts_event ON event_facts(event_id, fact_type);`).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS event_timeline (
        timeline_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        state_from TEXT,
        state_to TEXT NOT NULL,
        changed_at INTEGER NOT NULL,
        trigger_evidence_id TEXT,
        actor TEXT,
        reason TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
    `).run()
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_event_timeline_event ON event_timeline(event_id, changed_at DESC);`).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS event_metrics (
        metric_key TEXT PRIMARY KEY,
        metric_name TEXT NOT NULL,
        labels_json TEXT NOT NULL,
        value INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `).run()
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_event_metrics_name ON event_metrics(metric_name, updated_at DESC);`).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS entity_links (
        event_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT '',
        full_code TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL,
        resolver TEXT NOT NULL
      );
    `).run()
    await this.db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_links_unique
      ON entity_links(event_id, entity_type, entity_name, code, full_code);
    `).run()
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_entity_links_name ON entity_links(entity_name, entity_type);`).run()
    await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_entity_links_code ON entity_links(code, full_code);`).run()
    getEventTableLogger().success("init event tables")
  }

  async upsertRawItem(row: RawItemRow) {
    await this.db.prepare(`
      INSERT OR REPLACE INTO raw_items (
        raw_id, source_id, source_item_id, title, url, mobile_url, published_at, fetched_at, fingerprint, payload_json, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.raw_id,
      row.source_id,
      row.source_item_id,
      row.title,
      row.url,
      row.mobile_url,
      row.published_at,
      row.fetched_at,
      row.fingerprint,
      row.payload_json,
      row.status,
    )
  }

  async getLastFetchedAtBySourceIds(ids: SourceID[]) {
    if (!ids.length) return {} as Partial<Record<SourceID, number>>
    const where = ids.map(() => "?").join(", ")
    const rows = getRows<{ source_id: SourceID, fetched_at: number }>(
      await this.db.prepare(`
        SELECT source_id, MAX(fetched_at) AS fetched_at
        FROM raw_items
        WHERE source_id IN (${where})
        GROUP BY source_id
      `).all(...ids),
    )
    return Object.fromEntries(rows.map(row => [row.source_id, Number(row.fetched_at) || 0])) as Partial<Record<SourceID, number>>
  }

  async getEventIdByClusterKey(clusterKey: string) {
    const row = await this.db.prepare(`SELECT event_id FROM events WHERE cluster_key = ?`).get(clusterKey) as { event_id: string } | undefined
    return row?.event_id
  }

  async getEventById(eventId: string) {
    const row = await this.db.prepare(`SELECT * FROM events WHERE event_id = ?`).get(eventId) as EventRow | undefined
    return row
  }

  async upsertEvent(row: EventRow) {
    await this.db.prepare(`
      INSERT INTO events (
        event_id, cluster_key, title, summary, event_type, event_subtype, source_kind, published_at, ingested_at, canonical_url,
        primary_entity_name, series_key, period_key, release_cadence, importance, sentiment, directional_view, directional_confidence, materiality_score, tradability_score,
        authority_score, freshness_score, surprise_score, affected_markets_json, impact_summary_json, degraded, topic_tags_json, last_seen_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cluster_key) DO UPDATE SET
        title = excluded.title,
        summary = COALESCE(excluded.summary, events.summary),
        event_type = excluded.event_type,
        event_subtype = excluded.event_subtype,
        source_kind = COALESCE(excluded.source_kind, events.source_kind),
        published_at = COALESCE(events.published_at, excluded.published_at),
        ingested_at = excluded.ingested_at,
        canonical_url = COALESCE(events.canonical_url, excluded.canonical_url),
        primary_entity_name = COALESCE(events.primary_entity_name, excluded.primary_entity_name),
        series_key = COALESCE(events.series_key, excluded.series_key),
        period_key = COALESCE(events.period_key, excluded.period_key),
        release_cadence = COALESCE(events.release_cadence, excluded.release_cadence),
        importance = excluded.importance,
        sentiment = COALESCE(excluded.sentiment, events.sentiment),
        directional_view = COALESCE(excluded.directional_view, events.directional_view),
        directional_confidence = COALESCE(excluded.directional_confidence, events.directional_confidence),
        materiality_score = COALESCE(excluded.materiality_score, events.materiality_score),
        tradability_score = COALESCE(excluded.tradability_score, events.tradability_score),
        authority_score = COALESCE(excluded.authority_score, events.authority_score),
        freshness_score = COALESCE(excluded.freshness_score, events.freshness_score),
        surprise_score = COALESCE(excluded.surprise_score, events.surprise_score),
        affected_markets_json = excluded.affected_markets_json,
        impact_summary_json = excluded.impact_summary_json,
        degraded = excluded.degraded,
        topic_tags_json = excluded.topic_tags_json,
        last_seen_at = excluded.last_seen_at,
        status = excluded.status
    `).run(
      row.event_id,
      row.cluster_key,
      row.title,
      row.summary,
      row.event_type,
      row.event_subtype,
      row.source_kind,
      row.published_at,
      row.ingested_at,
      row.canonical_url,
      row.primary_entity_name,
      row.series_key ?? null,
      row.period_key ?? null,
      row.release_cadence ?? null,
      row.importance,
      row.sentiment,
      row.directional_view,
      row.directional_confidence,
      row.materiality_score,
      row.tradability_score,
      row.authority_score,
      row.freshness_score,
      row.surprise_score,
      row.affected_markets_json,
      row.impact_summary_json,
      row.degraded,
      row.topic_tags_json,
      row.last_seen_at,
      row.status,
    )
  }

  async upsertEventSource(row: EventSourceRow) {
    await this.db.prepare(`
      INSERT OR REPLACE INTO event_sources (
        source_id, source_kind, authority_level, parser_family, default_event_type, default_event_subtype,
        asset_classes_json, markets_json, profile_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.source_id,
      row.source_kind,
      row.authority_level,
      row.parser_family,
      row.default_event_type,
      row.default_event_subtype,
      row.asset_classes_json,
      row.markets_json,
      row.profile_json,
      row.updated_at,
    )
  }

  async upsertEventFacts(rows: EventFactRow[]) {
    const evidenceKeys = [...new Set(rows.map(row => `${row.event_id}::${row.evidence_id ?? ""}`))]
    for (const key of evidenceKeys) {
      const [eventId, evidenceId] = key.split("::")
      if (evidenceId) {
        await this.db.prepare(`
          DELETE FROM event_facts
          WHERE event_id = ?
            AND evidence_id = ?
        `).run(eventId, evidenceId)
      } else {
        await this.db.prepare(`
          DELETE FROM event_facts
          WHERE event_id = ?
            AND evidence_id IS NULL
        `).run(eventId)
      }
    }

    for (const row of rows) {
      await this.db.prepare(`
        INSERT OR REPLACE INTO event_facts (
          fact_id, event_id, evidence_id, fact_type, metric_name, value, unit, previous_value, delta,
          direction, effective_at, entity_id, confidence, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.fact_id,
        row.event_id,
        row.evidence_id,
        row.fact_type,
        row.metric_name,
        row.value,
        row.unit,
        row.previous_value,
        row.delta,
        row.direction,
        row.effective_at,
        row.entity_id,
        row.confidence,
        row.payload_json,
      )
    }
  }

  async addEvidence(row: EventEvidenceRow) {
    await this.db.prepare(`
      INSERT OR REPLACE INTO event_evidence (
        event_id, raw_id, source_id, source_item_id, title, summary, canonical_url, published_at, fetched_at,
        source_priority, authority_level, parser_family, passthrough_payload_json, extraction_status, extraction_error, rank
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.event_id,
      row.raw_id,
      row.source_id,
      row.source_item_id,
      row.title,
      row.summary,
      row.canonical_url,
      row.published_at,
      row.fetched_at,
      row.source_priority,
      row.authority_level,
      row.parser_family,
      row.passthrough_payload_json,
      row.extraction_status,
      row.extraction_error,
      row.rank,
    )
  }

  async listRawItems(options: {
    sourceIds?: SourceID[]
    since?: number
    limit?: number
  }) {
    const clauses: string[] = []
    const params: Array<string | number> = []

    if (options.sourceIds?.length) {
      clauses.push(`source_id IN (${options.sourceIds.map(() => "?").join(", ")})`)
      params.push(...options.sourceIds)
    }

    if (options.since) {
      clauses.push("fetched_at >= ?")
      params.push(options.since)
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    return getRows<RawItemRow>(await this.db.prepare(`
      SELECT *
      FROM raw_items
      ${where}
      ORDER BY fetched_at DESC, published_at DESC
      LIMIT ?
    `).all(...params, options.limit ?? 1000))
  }

  async getRawItemRangeStats(options?: {
    sourceIds?: SourceID[]
  }) {
    const clauses: string[] = []
    const params: string[] = []

    if (options?.sourceIds?.length) {
      clauses.push(`source_id IN (${options.sourceIds.map(() => "?").join(", ")})`)
      params.push(...options.sourceIds)
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const row = await this.db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        MIN(COALESCE(published_at, fetched_at)) AS oldest_at,
        MAX(COALESCE(published_at, fetched_at)) AS newest_at
      FROM raw_items
      ${where}
    `).get(...params) as {
        total_count?: number
        oldest_at?: number | null
        newest_at?: number | null
      } | undefined

    return {
      totalCount: Number(row?.total_count) || 0,
      oldestAt: row?.oldest_at ?? null,
      newestAt: row?.newest_at ?? null,
    }
  }

  async getOperationalStats(options?: {
    since?: number
  }) {
    const since = options?.since ?? (Date.now() - 24 * 60 * 60 * 1000)
    const row = await this.db.prepare(`
      SELECT
        COUNT(*) AS total_active_events,
        SUM(CASE WHEN ingested_at >= ? THEN 1 ELSE 0 END) AS recent_event_count,
        AVG(CASE
          WHEN ingested_at >= ? AND published_at IS NOT NULL
          THEN MAX(0, ingested_at - published_at)
          ELSE NULL
        END) AS avg_ingest_latency_ms,
        MAX(CASE
          WHEN ingested_at >= ? AND published_at IS NOT NULL
          THEN MAX(0, ingested_at - published_at)
          ELSE NULL
        END) AS max_ingest_latency_ms
      FROM events
      WHERE status = 'active'
    `).get(since, since, since) as {
      total_active_events?: number
      recent_event_count?: number
      avg_ingest_latency_ms?: number | null
      max_ingest_latency_ms?: number | null
    } | undefined

    return {
      totalActiveEvents: Number(row?.total_active_events) || 0,
      recentEventCount: Number(row?.recent_event_count) || 0,
      avgIngestLatencyMs: row?.avg_ingest_latency_ms ? Math.round(row.avg_ingest_latency_ms) : null,
      maxIngestLatencyMs: row?.max_ingest_latency_ms ?? null,
    }
  }

  async getQualitySnapshot(options?: {
    since?: number
  }): Promise<EventBaseQualitySnapshot> {
    const since = options?.since ?? (Date.now() - 24 * 60 * 60 * 1000)
    const placeholders = HIGH_VALUE_SOURCE_KINDS.map(() => "?").join(", ")
    const filter = `
      WHERE e.status = 'active'
        AND COALESCE(e.published_at, e.ingested_at) >= ?
        AND COALESCE(e.source_kind, '') IN (${placeholders})
    `

    const coverageRow = await this.db.prepare(`
      SELECT
        COUNT(*) AS high_value_source_event_count,
        SUM(CASE WHEN e.degraded = 0 AND (
          EXISTS (
            SELECT 1
            FROM event_facts ef
            WHERE ef.event_id = e.event_id
          )
          OR EXISTS (
            SELECT 1
            FROM event_evidence ee
            WHERE ee.event_id = e.event_id
              AND COALESCE(ee.extraction_status, '') IN ('ready', 'structured')
          )
        ) THEN 1 ELSE 0 END) AS high_value_structured_event_count,
        SUM(CASE WHEN e.event_type = 'news' AND e.event_subtype = 'other' THEN 1 ELSE 0 END) AS high_value_generic_fallback_event_count,
        SUM(CASE WHEN e.degraded = 1 THEN 1 ELSE 0 END) AS high_value_degraded_event_count
      FROM events e
      ${filter}
    `).get(since, ...HIGH_VALUE_SOURCE_KINDS) as {
      high_value_source_event_count?: number | null
      high_value_structured_event_count?: number | null
      high_value_generic_fallback_event_count?: number | null
      high_value_degraded_event_count?: number | null
    } | undefined

    const latencyRows = getRows<{ ingest_latency_ms: number | null }>(await this.db.prepare(`
      SELECT MAX(0, e.ingested_at - e.published_at) AS ingest_latency_ms
      FROM events e
      ${filter}
        AND e.published_at IS NOT NULL
      ORDER BY ingest_latency_ms ASC
    `).all(since, ...HIGH_VALUE_SOURCE_KINDS))
      .map(row => row.ingest_latency_ms)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))

    const highValueSourceEventCount = Number(coverageRow?.high_value_source_event_count) || 0
    const highValueStructuredEventCount = Number(coverageRow?.high_value_structured_event_count) || 0
    const highValueGenericFallbackEventCount = Number(coverageRow?.high_value_generic_fallback_event_count) || 0
    const highValueDegradedEventCount = Number(coverageRow?.high_value_degraded_event_count) || 0
    const highValueStructuredCoveragePct = percentageOrNull(highValueStructuredEventCount, highValueSourceEventCount)
    const highValueGenericFallbackSharePct = percentageOrNull(highValueGenericFallbackEventCount, highValueSourceEventCount)
    const prioritySourceAvgIngestLatencyMs = latencyRows.length
      ? Math.round(latencyRows.reduce((sum, value) => sum + value, 0) / latencyRows.length)
      : null
    const prioritySourceIngestLatencyP95Ms = percentileFromSorted(latencyRows, 0.95)

    return {
      generatedAt: Date.now(),
      windowStartAt: since,
      highValue: {
        sourceKinds: [...HIGH_VALUE_SOURCE_KINDS],
        totalEventCount: highValueSourceEventCount,
        structuredEventCount: highValueStructuredEventCount,
        degradedEventCount: highValueDegradedEventCount,
        genericFallbackEventCount: highValueGenericFallbackEventCount,
        structuredCoveragePct: highValueStructuredCoveragePct,
        genericFallbackSharePct: highValueGenericFallbackSharePct,
        latencySampleCount: latencyRows.length,
        avgIngestLatencyMs: prioritySourceAvgIngestLatencyMs,
        p95IngestLatencyMs: prioritySourceIngestLatencyP95Ms,
      },
      highValueSourceEventCount,
      highValueStructuredEventCount,
      highValueStructuredCoveragePct,
      highValueDegradedEventCount,
      highValueGenericFallbackEventCount,
      highValueGenericFallbackSharePct,
      prioritySourceAvgIngestLatencyMs,
      prioritySourceIngestLatencyP95Ms,
    }
  }

  async getOperationalLatencyDiagnostics(options?: {
    since?: number
    limit?: number
    staleThresholdMs?: number
  }): Promise<EventOperationalLatencyDiagnostics> {
    const generatedAt = Date.now()
    const since = options?.since ?? (generatedAt - 24 * 60 * 60 * 1000)
    const limit = options?.limit ?? 10
    const staleThresholdMs = options?.staleThresholdMs ?? 5 * 60 * 1000
    const placeholders = HIGH_VALUE_SOURCE_KINDS.map(() => "?").join(", ")
    const rows = getRows<{
      source_kind?: string | null
      source_id?: SourceID | null
      published_at?: number | null
      ingested_at?: number | null
      last_seen_at?: number | null
      ingest_latency_ms?: number | null
    }>(await this.db.prepare(`
      SELECT
        e.source_kind,
        (
          SELECT ee.source_id
          FROM event_evidence ee
          WHERE ee.event_id = e.event_id
          ORDER BY
            ee.rank ASC,
            COALESCE(ee.source_priority, 0) DESC,
            COALESCE(ee.published_at, ee.fetched_at) DESC,
            ee.raw_id ASC
          LIMIT 1
        ) AS source_id,
        e.published_at,
        e.ingested_at,
        e.last_seen_at,
        MAX(0, e.ingested_at - e.published_at) AS ingest_latency_ms
      FROM events e
      WHERE e.status = 'active'
        AND COALESCE(e.published_at, e.ingested_at) >= ?
        AND COALESCE(e.source_kind, '') IN (${placeholders})
      ORDER BY ingest_latency_ms DESC
    `).all(since, ...HIGH_VALUE_SOURCE_KINDS))

    const bySourceKind = new Map<string, typeof rows>()
    const bySource = new Map<string, {
      sourceKind: string
      sourceId: SourceID
      rows: typeof rows
    }>()

    for (const row of rows) {
      const sourceKind = row.source_kind ?? "unknown"
      const sourceKindBucket = bySourceKind.get(sourceKind) ?? []
      sourceKindBucket.push(row)
      bySourceKind.set(sourceKind, sourceKindBucket)

      if (!row.source_id) continue
      const key = `${sourceKind}|${row.source_id}`
      const sourceBucket = bySource.get(key) ?? {
        sourceKind,
        sourceId: row.source_id,
        rows: [],
      }
      sourceBucket.rows.push(row)
      bySource.set(key, sourceBucket)
    }

    const toBucket = (
      sourceKind: string,
      bucketRows: typeof rows,
      sourceId?: SourceID,
    ): EventOperationalLatencyDiagnosticBucket => {
      const latencies = bucketRows
        .map(row => row.ingest_latency_ms)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      const publicationAges = bucketRows
        .map((row) => {
          const publicationAnchor = row.published_at ?? row.ingested_at
          if (typeof publicationAnchor !== "number" || !Number.isFinite(publicationAnchor)) return null
          return Math.max(0, generatedAt - publicationAnchor)
        })
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      const lastSeenDelays = bucketRows
        .map((row) => {
          const lastSeenAt = row.last_seen_at ?? row.ingested_at
          if (typeof lastSeenAt !== "number" || !Number.isFinite(lastSeenAt)) return null
          return Math.max(0, generatedAt - lastSeenAt)
        })
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      const latencySummary = summarizeOperationalDurations(latencies)
      const publicationAgeSummary = summarizeOperationalDurations(publicationAges)
      const lastSeenDelaySummary = summarizeOperationalDurations(lastSeenDelays)
      const staleEventCount = latencies.filter(value => value > staleThresholdMs).length
      const freshEventCount = Math.max(0, latencies.length - staleEventCount)
      return {
        sourceKind,
        sourceId,
        sourceName: sourceId ? sources[sourceId]?.name : undefined,
        totalEvents: bucketRows.length,
        latencySampleCount: latencies.length,
        staleEventCount,
        freshEventCount,
        staleSharePct: percentageOrNull(staleEventCount, latencies.length),
        avgIngestLatencyMs: latencySummary.avgMs,
        p95IngestLatencyMs: latencySummary.p95Ms,
        maxIngestLatencyMs: latencySummary.maxMs,
        avgPublicationAgeMs: publicationAgeSummary.avgMs,
        p95PublicationAgeMs: publicationAgeSummary.p95Ms,
        maxPublicationAgeMs: publicationAgeSummary.maxMs,
        avgLastSeenDelayMs: lastSeenDelaySummary.avgMs,
        p95LastSeenDelayMs: lastSeenDelaySummary.p95Ms,
        maxLastSeenDelayMs: lastSeenDelaySummary.maxMs,
      }
    }

    const sourceKindBreakdown = [...bySourceKind.entries()]
      .map(([sourceKind, bucketRows]) => toBucket(sourceKind, bucketRows))
      .sort((a, b) => {
        if ((b.p95IngestLatencyMs ?? 0) !== (a.p95IngestLatencyMs ?? 0)) {
          return (b.p95IngestLatencyMs ?? 0) - (a.p95IngestLatencyMs ?? 0)
        }
        if (b.totalEvents !== a.totalEvents) return b.totalEvents - a.totalEvents
        return a.sourceKind.localeCompare(b.sourceKind)
      })
      .slice(0, limit)

    const sourceBreakdown = [...bySource.values()]
      .map(item => toBucket(item.sourceKind, item.rows, item.sourceId))
      .sort((a, b) => {
        if ((b.p95IngestLatencyMs ?? 0) !== (a.p95IngestLatencyMs ?? 0)) {
          return (b.p95IngestLatencyMs ?? 0) - (a.p95IngestLatencyMs ?? 0)
        }
        if (b.totalEvents !== a.totalEvents) return b.totalEvents - a.totalEvents
        return (a.sourceId ?? "").localeCompare(b.sourceId ?? "")
      })
      .slice(0, limit)

    return {
      generatedAt,
      windowStartAt: since,
      staleThresholdMs,
      sourceKindBreakdown,
      sourceBreakdown,
    }
  }

  async getRawItemsByIds(rawIds: string[]) {
    if (!rawIds.length) return []
    const placeholders = rawIds.map(() => "?").join(", ")
    return getRows<RawItemRow>(await this.db.prepare(`
      SELECT *
      FROM raw_items
      WHERE raw_id IN (${placeholders})
      ORDER BY fetched_at DESC, published_at DESC
    `).all(...rawIds))
  }

  async getEventIdsByRawId(rawId: string) {
    const rows = getRows<{ event_id: string }>(await this.db.prepare(`
      SELECT DISTINCT event_id
      FROM event_evidence
      WHERE raw_id = ?
    `).all(rawId))

    return rows.map(row => row.event_id)
  }

  async deleteEvidenceByRawId(rawId: string) {
    await this.db.prepare(`DELETE FROM event_evidence WHERE raw_id = ?`).run(rawId)
  }

  async deleteFactsByEvidenceId(evidenceId: string) {
    await this.db.prepare(`DELETE FROM event_facts WHERE evidence_id = ?`).run(evidenceId)
  }

  async deleteEventIfOrphan(eventId: string) {
    const row = await this.db.prepare(`
      SELECT COUNT(*) AS evidence_count
      FROM event_evidence
      WHERE event_id = ?
    `).get(eventId) as { evidence_count?: number } | undefined

    if ((Number(row?.evidence_count) || 0) > 0) {
      return false
    }

    await this.db.prepare(`DELETE FROM event_facts WHERE event_id = ?`).run(eventId)
    await this.db.prepare(`DELETE FROM entity_links WHERE event_id = ?`).run(eventId)
    await this.db.prepare(`DELETE FROM event_timeline WHERE event_id = ?`).run(eventId)
    await this.db.prepare(`DELETE FROM events WHERE event_id = ?`).run(eventId)
    return true
  }

  async addTimeline(row: EventTimelineRow) {
    if (row.reason === "new_event") {
      const existing = await this.db.prepare(`
        SELECT timeline_id
        FROM event_timeline
        WHERE event_id = ?
          AND reason = 'new_event'
        LIMIT 1
      `).get(row.event_id) as { timeline_id?: string } | undefined

      if (existing?.timeline_id) {
        return
      }
    }

    if (row.reason === "multi_source_confirmation" || row.reason === "authoritative_source_confirmation") {
      const duplicateWhere = row.reason === "multi_source_confirmation"
        ? `reason IN ('multi_source_confirmation', 'authoritative_source_confirmation')`
        : `reason = 'authoritative_source_confirmation'`
      const existing = await this.db.prepare(`
        SELECT timeline_id
        FROM event_timeline
        WHERE event_id = ?
          AND ${duplicateWhere}
        LIMIT 1
      `).get(row.event_id) as { timeline_id?: string } | undefined

      if (existing?.timeline_id) {
        return
      }
    }

    await this.db.prepare(`
      INSERT OR REPLACE INTO event_timeline (
        timeline_id, event_id, state_from, state_to, changed_at, trigger_evidence_id, actor, reason, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.timeline_id,
      row.event_id,
      row.state_from,
      row.state_to,
      row.changed_at,
      row.trigger_evidence_id,
      row.actor,
      row.reason,
      row.metadata_json,
    )
  }

  async incrementMetric(metricName: string, labels: Record<string, string>, delta = 1) {
    const labelsJSON = JSON.stringify(labels)
    const metricKey = `${metricName}|${labelsJSON}`
    const updatedAt = Date.now()
    await this.db.prepare(`
      INSERT INTO event_metrics (metric_key, metric_name, labels_json, value, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(metric_key) DO UPDATE SET
        value = event_metrics.value + excluded.value,
        updated_at = excluded.updated_at
    `).run(metricKey, metricName, labelsJSON, delta, updatedAt)
  }

  async getMetricsSnapshot() {
    const rows = getRows<{
      metric_name: string
      labels_json: string
      value: number
      updated_at: number
    }>(await this.db.prepare(`
      SELECT metric_name, labels_json, value, updated_at
      FROM event_metrics
      ORDER BY updated_at DESC, metric_name ASC
    `).all())

    const points = rows.map(row => ({
      metric: row.metric_name,
      labels: parseJSON<Record<string, string>>(row.labels_json, {}),
      value: row.value,
      updatedAt: row.updated_at,
    }))

    const totals = Object.fromEntries(
      points.reduce<Array<[string, number]>>((acc, point) => {
        const current = acc.find(item => item[0] === point.metric)
        if (current) current[1] += point.value
        else acc.push([point.metric, point.value])
        return acc
      }, []),
    )

    return {
      updatedAt: rows[0]?.updated_at ?? 0,
      totals,
      points,
    }
  }

  async getEventEvidenceStats(eventId: string) {
    const row = await this.db.prepare(`
      SELECT
        COUNT(*) AS evidence_count,
        COUNT(DISTINCT source_id) AS source_count,
        SUM(CASE WHEN authority_level IN ('official', 'exchange') THEN 1 ELSE 0 END) AS authoritative_evidence_count
      FROM event_evidence
      WHERE event_id = ?
    `).get(eventId) as {
      evidence_count?: number
      source_count?: number
      authoritative_evidence_count?: number
    } | undefined

    return {
      evidenceCount: Number(row?.evidence_count) || 0,
      sourceCount: Number(row?.source_count) || 0,
      authoritativeEvidenceCount: Number(row?.authoritative_evidence_count) || 0,
    }
  }

  async getLatestTimelineState(eventId: string) {
    const row = await this.db.prepare(`
      SELECT state_to, changed_at
      FROM event_timeline
      WHERE event_id = ?
        AND COALESCE(reason, '') != 'canonical_identity_merge'
      ORDER BY changed_at DESC, timeline_id DESC
      LIMIT 1
    `).get(eventId) as {
      state_to?: EventLifecycleState
      changed_at?: number
    } | undefined

    return {
      state: row?.state_to,
      changedAt: row?.changed_at,
    }
  }

  async findEquivalentEventIds(options: {
    canonicalUrl?: string | null
    sourceKind?: string | null
    excludeEventId: string
  }) {
    if (!options.canonicalUrl || !options.sourceKind) return []

    const rows = getRows<{ event_id: string }>(await this.db.prepare(`
      SELECT event_id
      FROM events
      WHERE canonical_url = ?
        AND (
          source_kind = ?
          OR source_kind IS NULL
          OR source_kind = ''
        )
        AND event_id != ?
      ORDER BY COALESCE(published_at, ingested_at) DESC, ingested_at DESC
    `).all(
      options.canonicalUrl,
      options.sourceKind,
      options.excludeEventId,
    ))

    return rows.map(row => row.event_id)
  }

  async mergeEventIntoCanonical(options: {
    canonicalEventId: string
    duplicateEventId: string
    reason: string
    mergedAt?: number
  }) {
    if (options.canonicalEventId === options.duplicateEventId) return

    const mergedAt = options.mergedAt ?? Date.now()
    const duplicate = await this.getEventById(options.duplicateEventId)
    if (!duplicate) return

    await this.withTransaction(async () => {
      await this.db.prepare(`
        UPDATE events
        SET
          summary = COALESCE(summary, ?),
          primary_entity_name = COALESCE(primary_entity_name, ?),
          series_key = COALESCE(series_key, ?),
          period_key = COALESCE(period_key, ?),
          release_cadence = COALESCE(release_cadence, ?),
          published_at = COALESCE(published_at, ?),
          canonical_url = COALESCE(canonical_url, ?),
          impact_summary_json = CASE
            WHEN impact_summary_json IS NULL OR impact_summary_json = '[]' THEN COALESCE(?, impact_summary_json)
            ELSE impact_summary_json
          END,
          last_seen_at = MAX(last_seen_at, ?)
        WHERE event_id = ?
      `).run(
        duplicate.summary,
        duplicate.primary_entity_name,
        duplicate.series_key,
        duplicate.period_key,
        duplicate.release_cadence,
        duplicate.published_at,
        duplicate.canonical_url,
        duplicate.impact_summary_json,
        duplicate.last_seen_at,
        options.canonicalEventId,
      )

      await this.db.prepare(`
        INSERT OR IGNORE INTO event_evidence (
          event_id, raw_id, source_id, source_item_id, title, summary, canonical_url, published_at, fetched_at,
          source_priority, authority_level, parser_family, passthrough_payload_json, extraction_status, extraction_error, rank
        )
        SELECT
          ?, raw_id, source_id, source_item_id, title, summary, canonical_url, published_at, fetched_at,
          source_priority, authority_level, parser_family, passthrough_payload_json, extraction_status, extraction_error, rank
        FROM event_evidence
        WHERE event_id = ?
      `).run(options.canonicalEventId, options.duplicateEventId)

      const duplicateFacts = getRows<EventFactRow>(await this.db.prepare(`
        SELECT fact_id, event_id, evidence_id, fact_type, metric_name, value, unit, previous_value, delta, direction, effective_at, entity_id, confidence, payload_json
        FROM event_facts
        WHERE event_id = ?
      `).all(options.duplicateEventId))

      for (const fact of duplicateFacts) {
        await this.db.prepare(`
          INSERT OR REPLACE INTO event_facts (
            fact_id, event_id, evidence_id, fact_type, metric_name, value, unit, previous_value, delta,
            direction, effective_at, entity_id, confidence, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `fact_${md5(`${options.canonicalEventId}|${fact.evidence_id ?? ""}|${fact.fact_type}|${fact.metric_name}|${fact.effective_at ?? ""}`)}`,
          options.canonicalEventId,
          fact.evidence_id,
          fact.fact_type,
          fact.metric_name,
          fact.value,
          fact.unit,
          fact.previous_value,
          fact.delta,
          fact.direction,
          fact.effective_at,
          fact.entity_id,
          fact.confidence,
          fact.payload_json,
        )
      }

      const duplicateLinks = getRows<EntityLinkRow>(await this.db.prepare(`
        SELECT event_id, entity_type, entity_name, code, full_code, confidence, resolver
        FROM entity_links
        WHERE event_id = ?
      `).all(options.duplicateEventId))

      for (const link of duplicateLinks) {
        await this.db.prepare(`
          INSERT OR IGNORE INTO entity_links (
            event_id, entity_type, entity_name, code, full_code, confidence, resolver
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          options.canonicalEventId,
          link.entity_type,
          link.entity_name,
          link.code,
          link.full_code,
          link.confidence,
          link.resolver,
        )
      }

      await this.addTimeline({
        timeline_id: `etl_${md5(`${options.canonicalEventId}|${options.duplicateEventId}|merged_duplicate|${mergedAt}`)}`,
        event_id: options.canonicalEventId,
        state_from: null,
        state_to: "updated",
        changed_at: mergedAt,
        trigger_evidence_id: null,
        actor: "event-engine",
        reason: "canonical_identity_merge",
        metadata_json: JSON.stringify({
          mergedEventId: options.duplicateEventId,
          mergedEventTitle: duplicate.title,
          mergedEventUrl: duplicate.canonical_url,
          mergedEventSourceKind: duplicate.source_kind,
          mergeReason: options.reason,
        }),
      })

      await this.db.prepare(`DELETE FROM event_facts WHERE event_id = ?`).run(options.duplicateEventId)
      await this.db.prepare(`DELETE FROM entity_links WHERE event_id = ?`).run(options.duplicateEventId)
      await this.db.prepare(`DELETE FROM event_timeline WHERE event_id = ?`).run(options.duplicateEventId)
      await this.db.prepare(`DELETE FROM event_evidence WHERE event_id = ?`).run(options.duplicateEventId)
      await this.db.prepare(`DELETE FROM events WHERE event_id = ?`).run(options.duplicateEventId)
    })
  }

  async upsertEntityLinks(rows: EntityLinkRow[]) {
    for (const row of rows) {
      await this.db.prepare(`
        INSERT OR IGNORE INTO entity_links (
          event_id, entity_type, entity_name, code, full_code, confidence, resolver
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.event_id,
        row.entity_type,
        row.entity_name,
        row.code,
        row.full_code,
        row.confidence,
        row.resolver,
      )
    }
  }

  async repairCanonicalEntityLinks(options?: {
    eventIds?: string[]
    limit?: number
  }) {
    const candidateEventIds = options?.eventIds?.length
      ? options.eventIds.slice(0, options.limit ?? options.eventIds.length)
      : getRows<{ event_id: string }>(await this.db.prepare(`
        SELECT DISTINCT event_id
        FROM entity_links
        WHERE entity_type IN ('stock', 'company')
          AND (
            COALESCE(code, '') != ''
            OR COALESCE(full_code, '') != ''
          )
        ORDER BY event_id ASC
        LIMIT ?
      `).all(options?.limit ?? 100000)).map(row => row.event_id)

    let updatedEvents = 0
    let removedEntityAliases = 0
    let normalizedFactEntityIds = 0
    let normalizedPrimaryEntityNames = 0

    await this.withTransaction(async () => {
      for (const eventId of candidateEventIds) {
        const entityLinks = getRows<EntityLinkRow>(await this.db.prepare(`
          SELECT event_id, entity_type, entity_name, code, full_code, confidence, resolver
          FROM entity_links
          WHERE event_id = ?
          ORDER BY entity_type ASC, confidence DESC, entity_name ASC
        `).all(eventId))
        if (!entityLinks.length) continue

        const normalizedEntityLinks = normalizeEntityLinks(entityLinks)
        const existingLinkKeys = new Set(entityLinks.map(getEntityLinkPersistenceKey))
        const normalizedLinkKeys = new Set(normalizedEntityLinks.map(getEntityLinkPersistenceKey))
        const entityLinksChanged = existingLinkKeys.size !== normalizedLinkKeys.size
          || Array.from(existingLinkKeys).some(key => !normalizedLinkKeys.has(key))

        const facts = getRows<EventFactRow>(await this.db.prepare(`
          SELECT fact_id, event_id, evidence_id, fact_type, metric_name, value, unit, previous_value, delta, direction, effective_at, entity_id, confidence, payload_json
          FROM event_facts
          WHERE event_id = ?
          ORDER BY fact_id ASC
        `).all(eventId))
        const normalizedFacts = normalizeFactEntityIds(facts, normalizedEntityLinks)
        const factUpdates = normalizedFacts.filter((fact, index) => fact.entity_id !== facts[index]?.entity_id)

        const eventRow = await this.db.prepare(`
          SELECT primary_entity_name
          FROM events
          WHERE event_id = ?
        `).get(eventId) as { primary_entity_name?: string | null } | undefined
        const nextPrimaryEntityName = normalizePrimaryEntityName(eventRow?.primary_entity_name ?? null, normalizedEntityLinks)
        const primaryEntityChanged = nextPrimaryEntityName !== (eventRow?.primary_entity_name ?? null)

        if (!entityLinksChanged && !factUpdates.length && !primaryEntityChanged) continue
        updatedEvents += 1

        if (entityLinksChanged) {
          removedEntityAliases += Math.max(0, entityLinks.length - normalizedEntityLinks.length)
          await this.db.prepare(`DELETE FROM entity_links WHERE event_id = ?`).run(eventId)
          await this.upsertEntityLinks(normalizedEntityLinks)
        }

        for (const fact of factUpdates) {
          await this.db.prepare(`
            UPDATE event_facts
            SET entity_id = ?
            WHERE fact_id = ?
          `).run(fact.entity_id, fact.fact_id)
        }
        normalizedFactEntityIds += factUpdates.length

        if (primaryEntityChanged) {
          await this.db.prepare(`
            UPDATE events
            SET primary_entity_name = ?
            WHERE event_id = ?
          `).run(nextPrimaryEntityName, eventId)
          normalizedPrimaryEntityNames += 1
        }
      }
    })

    return {
      scannedEvents: candidateEventIds.length,
      updatedEvents,
      removedEntityAliases,
      normalizedFactEntityIds,
      normalizedPrimaryEntityNames,
    }
  }

  async repairPrimaryEntityContainerNames(options?: {
    eventIds?: string[]
    limit?: number
  }) {
    const candidateEventIds = options?.eventIds?.length
      ? options.eventIds.slice(0, options.limit ?? options.eventIds.length)
      : getRows<{ event_id: string }>(await this.db.prepare(`
        SELECT DISTINCT event_id
        FROM (
          SELECT e.event_id AS event_id
          FROM events e
          WHERE COALESCE(e.primary_entity_name, '') != ''
            AND (
              e.primary_entity_name LIKE '%法说会%'
              OR e.primary_entity_name LIKE '%法說會%'
              OR e.primary_entity_name LIKE '%业绩说明会%'
              OR e.primary_entity_name LIKE '%業績說明會%'
              OR e.primary_entity_name LIKE '%说明会%'
              OR e.primary_entity_name LIKE '%說明會%'
              OR e.primary_entity_name LIKE '%业绩会%'
              OR e.primary_entity_name LIKE '%業績會%'
              OR e.primary_entity_name LIKE '%电话会议%'
              OR e.primary_entity_name LIKE '%電話會議%'
              OR e.primary_entity_name LIKE '%电话会%'
              OR e.primary_entity_name LIKE '%電話會%'
              OR e.primary_entity_name LIKE '%交流会%'
              OR e.primary_entity_name LIKE '%沟通会%'
              OR e.primary_entity_name LIKE '%投资者日%'
              OR e.primary_entity_name LIKE '%发布会%'
              OR e.primary_entity_name LIKE '%發布會%'
            )

          UNION

          SELECT el.event_id AS event_id
          FROM entity_links el
          WHERE el.entity_type = 'company'
            AND el.resolver = 'primary-entity-fallback'
            AND (
              el.entity_name LIKE '%法说会%'
              OR el.entity_name LIKE '%法說會%'
              OR el.entity_name LIKE '%业绩说明会%'
              OR el.entity_name LIKE '%業績說明會%'
              OR el.entity_name LIKE '%说明会%'
              OR el.entity_name LIKE '%說明會%'
              OR el.entity_name LIKE '%业绩会%'
              OR el.entity_name LIKE '%業績會%'
              OR el.entity_name LIKE '%电话会议%'
              OR el.entity_name LIKE '%電話會議%'
              OR el.entity_name LIKE '%电话会%'
              OR el.entity_name LIKE '%電話會%'
              OR el.entity_name LIKE '%交流会%'
              OR el.entity_name LIKE '%沟通会%'
              OR el.entity_name LIKE '%投资者日%'
              OR el.entity_name LIKE '%发布会%'
              OR el.entity_name LIKE '%發布會%'
            )
        ) candidates
        ORDER BY event_id ASC
        LIMIT ?
      `).all(options?.limit ?? 100000)).map(row => row.event_id)

    let updatedEvents = 0
    let updatedPrimaryEntityNames = 0
    let replacedEntityLinks = 0

    await this.withTransaction(async () => {
      for (const eventId of candidateEventIds) {
        const eventRow = await this.db.prepare(`
          SELECT event_id, title, summary, topic_tags_json, primary_entity_name
          FROM events
          WHERE event_id = ?
        `).get(eventId) as {
          event_id: string
          title: string
          summary?: string | null
          topic_tags_json: string
          primary_entity_name?: string | null
        } | undefined
        if (!eventRow) continue

        const evidenceRows = getRows<{
          source_id: SourceID
          title?: string | null
          summary?: string | null
          payload_json: string
        }>(await this.db.prepare(`
          SELECT ee.source_id, ee.title, ee.summary, ri.payload_json
          FROM event_evidence ee
          JOIN raw_items ri ON ri.raw_id = ee.raw_id
          WHERE ee.event_id = ?
          ORDER BY ee.rank ASC, ri.published_at DESC, ri.raw_id ASC
        `).all(eventId))
        if (!evidenceRows.length) continue

        const leadEvidence = evidenceRows[0]
        if (!leadEvidence?.source_id) continue

        const resolved = resolveEventClassification(
          leadEvidence.source_id,
          eventRow.title,
          eventRow.summary ?? leadEvidence.summary ?? undefined,
        )
        const topicTags = resolved.topicTags.length
          ? resolved.topicTags
          : parseJSON<IndustryTag[]>(eventRow.topic_tags_json, [])

        const extractedEntityLinks = (
          await Promise.all(evidenceRows.map(async (evidence) => {
            const payload = parseJSON<Record<string, unknown>>(evidence.payload_json, {}) as any
            return extractEntityLinks(eventId, eventRow.title, topicTags, {
              primaryEntityName: resolved.primaryEntityName ?? undefined,
              summary: eventRow.summary ?? evidence.summary ?? undefined,
              payload,
            })
          }))
        ).flat()
        const normalizedEntityLinks = normalizeEntityLinks(extractedEntityLinks)

        const existingEntityLinks = getRows<EntityLinkRow>(await this.db.prepare(`
          SELECT event_id, entity_type, entity_name, code, full_code, confidence, resolver
          FROM entity_links
          WHERE event_id = ?
          ORDER BY entity_type ASC, confidence DESC, entity_name ASC
        `).all(eventId))

        const existingKeys = new Set(existingEntityLinks.map(getEntityLinkPersistenceKey))
        const nextKeys = new Set(normalizedEntityLinks.map(getEntityLinkPersistenceKey))
        const entityLinksChanged = existingKeys.size !== nextKeys.size
          || Array.from(existingKeys).some(key => !nextKeys.has(key))

        const nextPrimaryEntityName = normalizePrimaryEntityName(resolved.primaryEntityName ?? null, normalizedEntityLinks)
        const primaryEntityChanged = nextPrimaryEntityName !== (eventRow.primary_entity_name ?? null)

        if (!entityLinksChanged && !primaryEntityChanged) continue
        updatedEvents += 1

        if (entityLinksChanged) {
          replacedEntityLinks += 1
          await this.db.prepare(`DELETE FROM entity_links WHERE event_id = ?`).run(eventId)
          await this.upsertEntityLinks(normalizedEntityLinks)
        }

        if (primaryEntityChanged) {
          updatedPrimaryEntityNames += 1
          await this.db.prepare(`
            UPDATE events
            SET primary_entity_name = ?
            WHERE event_id = ?
          `).run(nextPrimaryEntityName, eventId)
        }
      }
    })

    return {
      scannedEvents: candidateEventIds.length,
      updatedEvents,
      updatedPrimaryEntityNames,
      replacedEntityLinks,
    }
  }

  async repairExplicitTickerEntityLinks(options?: {
    eventIds?: string[]
    limit?: number
  }) {
    const candidateEventIds = options?.eventIds?.length
      ? options.eventIds.slice(0, options.limit ?? options.eventIds.length)
      : getRows<{ event_id: string }>(await this.db.prepare(`
        SELECT DISTINCT event_id
        FROM (
          SELECT e.event_id AS event_id
          FROM events e
          JOIN event_evidence ee ON ee.event_id = e.event_id
          JOIN raw_items ri ON ri.raw_id = ee.raw_id
          WHERE ri.payload_json LIKE '%(%.US)%'
             OR ri.payload_json LIKE '%(%.HK)%'

          UNION

          SELECT el.event_id AS event_id
          FROM entity_links el
          WHERE el.entity_type IN ('company', 'stock')
            AND el.resolver = 'primary-entity-fallback'
            AND (
              (el.entity_name LIKE '%板块%' OR el.entity_name LIKE '%概念%' OR el.entity_name LIKE '%题材%' OR el.entity_name LIKE '%指数%' OR el.entity_name LIKE '%市场%')
              AND (el.entity_name LIKE '%走高%' OR el.entity_name LIKE '%走弱%' OR el.entity_name LIKE '%拉升%' OR el.entity_name LIKE '%下跌%' OR el.entity_name LIKE '%上涨%' OR el.entity_name LIKE '%下挫%')
            )
        ) candidates
        ORDER BY event_id ASC
        LIMIT ?
      `).all(options?.limit ?? 100000)).map(row => row.event_id)

    let updatedEvents = 0
    let addedEntityLinks = 0

    await this.withTransaction(async () => {
      for (const eventId of candidateEventIds) {
        const eventRow = await this.db.prepare(`
          SELECT event_id, title, summary, topic_tags_json, primary_entity_name
          FROM events
          WHERE event_id = ?
        `).get(eventId) as {
          event_id: string
          title: string
          summary?: string | null
          topic_tags_json: string
          primary_entity_name?: string | null
        } | undefined
        if (!eventRow) continue

        const rawRows = getRows<{ payload_json: string }>(await this.db.prepare(`
          SELECT ri.payload_json
          FROM event_evidence ee
          JOIN raw_items ri ON ri.raw_id = ee.raw_id
          WHERE ee.event_id = ?
          ORDER BY ee.rank ASC, ri.published_at DESC, ri.raw_id ASC
        `).all(eventId))
        if (!rawRows.length) continue

        const topicTags = parseJSON<IndustryTag[]>(eventRow.topic_tags_json, [])
        const extractedEntityLinks = (
          await Promise.all(rawRows.map(async (raw) => {
            const payload = parseJSON<Record<string, unknown>>(raw.payload_json, {}) as any
            return extractEntityLinks(eventId, eventRow.title, topicTags, {
              primaryEntityName: eventRow.primary_entity_name ?? undefined,
              summary: eventRow.summary ?? undefined,
              payload,
            })
          }))
        ).flat()

        const normalizedEntityLinks = normalizeEntityLinks(extractedEntityLinks)
        const existingEntityLinks = getRows<EntityLinkRow>(await this.db.prepare(`
          SELECT event_id, entity_type, entity_name, code, full_code, confidence, resolver
          FROM entity_links
          WHERE event_id = ?
          ORDER BY entity_type ASC, confidence DESC, entity_name ASC
        `).all(eventId))

        const existingKeys = new Set(existingEntityLinks.map(getEntityLinkPersistenceKey))
        const nextKeys = new Set(normalizedEntityLinks.map(getEntityLinkPersistenceKey))
        const entityLinksChanged = existingKeys.size !== nextKeys.size
          || Array.from(existingKeys).some(key => !nextKeys.has(key))

        if (!entityLinksChanged) continue

        updatedEvents += 1
        addedEntityLinks += Math.max(0, normalizedEntityLinks.length - existingEntityLinks.length)
        await this.db.prepare(`DELETE FROM entity_links WHERE event_id = ?`).run(eventId)
        await this.upsertEntityLinks(normalizedEntityLinks)
      }
    })

    return {
      scannedEvents: candidateEventIds.length,
      updatedEvents,
      addedEntityLinks,
    }
  }

  async repairExchangeDisclosureMarkets(options?: {
    eventIds?: string[]
    limit?: number
  }) {
    const eventIds = options?.eventIds?.length
      ? options.eventIds.slice(0, options.limit ?? options.eventIds.length)
      : undefined
    const placeholders = eventIds?.map(() => "?").join(", ")
    const candidateRows = getRows<{
      event_id: string
      affected_markets_json: string
      source_id?: string | null
    }>(eventIds
      ? await this.db.prepare(`
        SELECT
          e.event_id,
          e.affected_markets_json,
          (
            SELECT ee.source_id
            FROM event_evidence ee
            WHERE ee.event_id = e.event_id
            ORDER BY ee.rank ASC, ee.published_at DESC, ee.raw_id ASC
            LIMIT 1
          ) AS source_id
        FROM events e
        WHERE e.source_kind = 'exchange_disclosure'
          AND e.event_id IN (${placeholders})
        ORDER BY e.event_id ASC
      `).all(...eventIds)
      : await this.db.prepare(`
        SELECT
          e.event_id,
          e.affected_markets_json,
          (
            SELECT ee.source_id
            FROM event_evidence ee
            WHERE ee.event_id = e.event_id
            ORDER BY ee.rank ASC, ee.published_at DESC, ee.raw_id ASC
            LIMIT 1
          ) AS source_id
        FROM events e
        WHERE e.source_kind = 'exchange_disclosure'
        ORDER BY e.event_id ASC
        LIMIT ?
      `).all(options?.limit ?? 100000))

    let updatedEvents = 0
    let normalizedAffectedMarkets = 0
    let updatedSourceProfiles = 0
    const touchedSourceIds = new Set<SourceID>()

    await this.withTransaction(async () => {
      for (const row of candidateRows) {
        if (!row.source_id) continue
        const sourceId = row.source_id as SourceID
        const nextMarkets = [...getExchangeDisclosureMarkets(sourceId)]
        const currentMarkets = parseJSON<AffectedMarket[]>(row.affected_markets_json, [])
        if (JSON.stringify(currentMarkets) !== JSON.stringify(nextMarkets)) {
          await this.db.prepare(`
            UPDATE events
            SET affected_markets_json = ?
            WHERE event_id = ?
          `).run(JSON.stringify(nextMarkets), row.event_id)
          updatedEvents += 1
          normalizedAffectedMarkets += 1
        }
        touchedSourceIds.add(sourceId)
      }

      for (const sourceId of touchedSourceIds) {
        const profile = getSourceEventProfile(sourceId)
        if (!profile) continue
        const profileJson = JSON.stringify(profile)
        const marketsJson = JSON.stringify(profile.markets)
        const existingRow = await this.db.prepare(`
          SELECT markets_json, profile_json
          FROM event_sources
          WHERE source_id = ?
        `).get(sourceId) as { markets_json?: string | null, profile_json?: string | null } | undefined
        if (
          !existingRow
          || (existingRow.markets_json ?? "") === marketsJson
          && (existingRow.profile_json ?? "") === profileJson
        ) {
          continue
        }
        await this.db.prepare(`
          UPDATE event_sources
          SET markets_json = ?, profile_json = ?, updated_at = ?
          WHERE source_id = ?
        `).run(marketsJson, profileJson, Date.now(), sourceId)
        updatedSourceProfiles += 1
      }
    })

    return {
      scannedEvents: candidateRows.length,
      updatedEvents,
      normalizedAffectedMarkets,
      updatedSourceProfiles,
    }
  }

  async repairDuplicateConfirmationTimeline(options?: {
    eventIds?: string[]
    limit?: number
  }) {
    const candidateEventIds = options?.eventIds?.length
      ? options.eventIds.slice(0, options.limit ?? options.eventIds.length)
      : getRows<{ event_id: string }>(await this.db.prepare(`
        SELECT DISTINCT event_id
        FROM event_timeline
        WHERE reason IN ('multi_source_confirmation', 'authoritative_source_confirmation')
        ORDER BY event_id ASC
        LIMIT ?
      `).all(options?.limit ?? 100000)).map(row => row.event_id)

    let updatedEvents = 0
    let removedConfirmationEntries = 0
    let normalizedConfirmedSnapshotEntries = 0

    await this.withTransaction(async () => {
      for (const eventId of candidateEventIds) {
        const timeline = getRows<EventTimelineRow>(await this.db.prepare(`
          SELECT timeline_id, event_id, state_from, state_to, changed_at, trigger_evidence_id, actor, reason, metadata_json
          FROM event_timeline
          WHERE event_id = ?
          ORDER BY changed_at ASC, timeline_id ASC
        `).all(eventId))
        if (!timeline.length) continue

        let firstConfirmedAt: number | null = null
        let keptMultiSource = false
        let keptAuthoritative = false
        const timelineIdsToDelete: string[] = []

        for (const entry of timeline) {
          if (entry.reason !== "multi_source_confirmation" && entry.reason !== "authoritative_source_confirmation") {
            continue
          }

          if (entry.reason === "multi_source_confirmation") {
            if (!keptMultiSource && !keptAuthoritative) {
              keptMultiSource = true
              firstConfirmedAt ??= entry.changed_at
              continue
            }
            timelineIdsToDelete.push(entry.timeline_id)
            continue
          }

          if (!keptAuthoritative) {
            keptAuthoritative = true
            firstConfirmedAt ??= entry.changed_at
            continue
          }

          timelineIdsToDelete.push(entry.timeline_id)
        }

        let normalizedSnapshotsForEvent = 0
        if (firstConfirmedAt !== null) {
          const snapshotRows = getRows<Pick<EventTimelineRow, "timeline_id" | "state_from" | "state_to">>(await this.db.prepare(`
            SELECT timeline_id, state_from, state_to
            FROM event_timeline
            WHERE event_id = ?
              AND reason = 'event_snapshot_changed'
              AND changed_at > ?
            ORDER BY changed_at ASC, timeline_id ASC
          `).all(eventId, firstConfirmedAt))

          for (const row of snapshotRows) {
            if (row.state_from === "confirmed" && row.state_to === "confirmed") continue
            await this.db.prepare(`
              UPDATE event_timeline
              SET state_from = 'confirmed',
                  state_to = 'confirmed'
              WHERE timeline_id = ?
            `).run(row.timeline_id)
            normalizedSnapshotsForEvent += 1
          }
        }

        if (timelineIdsToDelete.length) {
          const placeholders = timelineIdsToDelete.map(() => "?").join(", ")
          await this.db.prepare(`
            DELETE FROM event_timeline
            WHERE timeline_id IN (${placeholders})
          `).run(...timelineIdsToDelete)
        }

        if (timelineIdsToDelete.length || normalizedSnapshotsForEvent) {
          updatedEvents += 1
          removedConfirmationEntries += timelineIdsToDelete.length
          normalizedConfirmedSnapshotEntries += normalizedSnapshotsForEvent
        }
      }
    })

    return {
      scannedEvents: candidateEventIds.length,
      updatedEvents,
      removedConfirmationEntries,
      normalizedConfirmedSnapshotEntries,
    }
  }

  async listEvents(options: {
    limit: number
    q?: string
    eventType?: EventType
    eventSubType?: EventSubType
    sourceId?: SourceID
    sourceIds?: SourceID[]
    topic?: string
    entity?: string
    market?: AffectedMarket
    directionalView?: DirectionalView
    minMaterialityScore?: number
    minAuthorityScore?: number
    changedSince?: number
    lifecycleAfter?: number
    seriesKey?: string
    periodKey?: string
    sortBy?: "latest" | "investment" | "changed"
  }): Promise<EventRecord[]> {
    const clauses: string[] = []
    const params: Array<string | number> = []
    const searchTopics = options.q ? resolveIndustryTagsFromKeywordQuery(options.q) : []
    const lifecycleAfter = options.lifecycleAfter ?? options.changedSince

    if (options.eventType) {
      clauses.push("e.event_type = ?")
      params.push(options.eventType)
    }
    if (options.eventSubType) {
      clauses.push("e.event_subtype = ?")
      params.push(options.eventSubType)
    }
    if (options.sourceId) {
      clauses.push("EXISTS (SELECT 1 FROM event_evidence ee WHERE ee.event_id = e.event_id AND ee.source_id = ?)")
      params.push(options.sourceId)
    }
    if (options.sourceIds?.length) {
      const sourcePlaceholders = options.sourceIds.map(() => "?").join(", ")
      clauses.push(`
        EXISTS (
          SELECT 1
          FROM event_evidence ee
          WHERE ee.event_id = e.event_id
            AND ee.source_id IN (${sourcePlaceholders})
        )
      `)
      params.push(...options.sourceIds)
    }
    if (options.market) {
      clauses.push("e.affected_markets_json LIKE ?")
      params.push(`%\"${options.market}\"%`)
    }
    if (options.directionalView) {
      clauses.push("e.directional_view = ?")
      params.push(options.directionalView)
    }
    if (options.minMaterialityScore !== undefined) {
      clauses.push("COALESCE(e.materiality_score, 0) >= ?")
      params.push(options.minMaterialityScore)
    }
    if (options.minAuthorityScore !== undefined) {
      clauses.push("COALESCE(e.authority_score, 0) >= ?")
      params.push(options.minAuthorityScore)
    }
    if (lifecycleAfter !== undefined) {
      clauses.push(`
        COALESCE((
          SELECT et.changed_at
          FROM event_timeline et
          WHERE et.event_id = e.event_id
            AND COALESCE(et.reason, '') != 'canonical_identity_merge'
          ORDER BY et.changed_at DESC, et.timeline_id DESC
          LIMIT 1
        ), 0) >= ?
      `)
      params.push(lifecycleAfter)
    }
    if (options.seriesKey) {
      clauses.push("e.series_key = ?")
      params.push(options.seriesKey)
    }
    if (options.periodKey) {
      clauses.push("e.period_key = ?")
      params.push(options.periodKey)
    }
    if (options.q) {
      const topicLikeClauses = searchTopics.map(() => "e.topic_tags_json LIKE ?")
      const searchClause = [
        "LOWER(e.title) LIKE LOWER(?)",
        "LOWER(COALESCE(e.summary, '')) LIKE LOWER(?)",
        ...topicLikeClauses,
      ].join(" OR ")
      clauses.push(`(${searchClause})`)
      params.push(`%${options.q}%`, `%${options.q}%`, ...searchTopics.map(topic => `%\"${topic}\"%`))
    }
    if (options.entity) {
      const lookupTerms = getEntityLookupTerms(options.entity)
      if (lookupTerms.length) {
        const placeholders = lookupTerms.map(() => "?").join(", ")
        clauses.push(`
          EXISTS (
            SELECT 1
            FROM entity_links el
            WHERE el.event_id = e.event_id
              AND (
                LOWER(el.entity_name) IN (${placeholders})
                OR LOWER(COALESCE(el.code, '')) IN (${placeholders})
                OR LOWER(COALESCE(el.full_code, '')) IN (${placeholders})
              )
          )
        `)
        params.push(...lookupTerms, ...lookupTerms, ...lookupTerms)
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const baseFetchLimit = options.sortBy === "investment"
      ? Math.max(options.limit * 5, 100)
      : options.limit
    const fetchLimit = options.topic
      ? Math.max(baseFetchLimit * 4, 300)
      : baseFetchLimit
    const orderBy = options.sortBy === "changed"
      ? "ORDER BY COALESCE(latest_lifecycle_at, COALESCE(e.published_at, e.ingested_at)) DESC, COALESCE(e.published_at, e.ingested_at) DESC, e.ingested_at DESC"
      : "ORDER BY COALESCE(e.published_at, e.ingested_at) DESC, e.ingested_at DESC"

    const rows = getRows<EventQueryRow>(await this.db.prepare(`
      SELECT
        e.*,
        (
          SELECT COUNT(*)
          FROM event_evidence ee
          WHERE ee.event_id = e.event_id
        ) AS evidence_count,
        (
          SELECT json_group_array(DISTINCT ee.source_id)
          FROM event_evidence ee
          WHERE ee.event_id = e.event_id
        ) AS source_ids_json,
        (
          SELECT et.state_to
          FROM event_timeline et
          WHERE et.event_id = e.event_id
            AND COALESCE(et.reason, '') != 'canonical_identity_merge'
          ORDER BY et.changed_at DESC, et.timeline_id DESC
          LIMIT 1
        ) AS latest_lifecycle_state,
        (
          SELECT et.changed_at
          FROM event_timeline et
          WHERE et.event_id = e.event_id
            AND COALESCE(et.reason, '') != 'canonical_identity_merge'
          ORDER BY et.changed_at DESC, et.timeline_id DESC
          LIMIT 1
        ) AS latest_lifecycle_at
      FROM events e
      ${where}
      ${orderBy}
      LIMIT ?
    `).all(...params, fetchLimit))

    let items = rows.map(row => this.normalizeEventRecord(this.toEventRecord(row)))
    if (options.topic) {
      items = items.filter(item => this.matchesTopic(item, options.topic!))
    }
    if (options.sortBy === "investment") {
      items.sort((a, b) => {
        const scoreDiff = scoreInvestmentEvent(b) - scoreInvestmentEvent(a)
        if (scoreDiff !== 0) return scoreDiff
        return getEventRecencyAnchor(b) - getEventRecencyAnchor(a)
      })
    }
    return items.slice(0, options.limit)
  }

  async countEvents(options: {
    q?: string
    eventType?: EventType
    eventSubType?: EventSubType
    sourceId?: SourceID
    sourceIds?: SourceID[]
    topic?: string
    entity?: string
    market?: AffectedMarket
    directionalView?: DirectionalView
    minMaterialityScore?: number
    minAuthorityScore?: number
    changedSince?: number
    lifecycleAfter?: number
    seriesKey?: string
    periodKey?: string
  }) {
    const clauses: string[] = []
    const params: Array<string | number> = []
    const searchTopics = options.q ? resolveIndustryTagsFromKeywordQuery(options.q) : []
    const lifecycleAfter = options.lifecycleAfter ?? options.changedSince

    if (options.eventType) {
      clauses.push("e.event_type = ?")
      params.push(options.eventType)
    }
    if (options.eventSubType) {
      clauses.push("e.event_subtype = ?")
      params.push(options.eventSubType)
    }
    if (options.sourceId) {
      clauses.push("EXISTS (SELECT 1 FROM event_evidence ee WHERE ee.event_id = e.event_id AND ee.source_id = ?)")
      params.push(options.sourceId)
    }
    if (options.sourceIds?.length) {
      const sourcePlaceholders = options.sourceIds.map(() => "?").join(", ")
      clauses.push(`
        EXISTS (
          SELECT 1
          FROM event_evidence ee
          WHERE ee.event_id = e.event_id
            AND ee.source_id IN (${sourcePlaceholders})
        )
      `)
      params.push(...options.sourceIds)
    }
    if (options.market) {
      clauses.push("e.affected_markets_json LIKE ?")
      params.push(`%\"${options.market}\"%`)
    }
    if (options.directionalView) {
      clauses.push("e.directional_view = ?")
      params.push(options.directionalView)
    }
    if (options.minMaterialityScore !== undefined) {
      clauses.push("COALESCE(e.materiality_score, 0) >= ?")
      params.push(options.minMaterialityScore)
    }
    if (options.minAuthorityScore !== undefined) {
      clauses.push("COALESCE(e.authority_score, 0) >= ?")
      params.push(options.minAuthorityScore)
    }
    if (lifecycleAfter !== undefined) {
      clauses.push(`
        COALESCE((
          SELECT et.changed_at
          FROM event_timeline et
          WHERE et.event_id = e.event_id
            AND COALESCE(et.reason, '') != 'canonical_identity_merge'
          ORDER BY et.changed_at DESC, et.timeline_id DESC
          LIMIT 1
        ), 0) >= ?
      `)
      params.push(lifecycleAfter)
    }
    if (options.seriesKey) {
      clauses.push("e.series_key = ?")
      params.push(options.seriesKey)
    }
    if (options.periodKey) {
      clauses.push("e.period_key = ?")
      params.push(options.periodKey)
    }
    if (options.q) {
      const topicLikeClauses = searchTopics.map(() => "e.topic_tags_json LIKE ?")
      const searchClause = [
        "LOWER(e.title) LIKE LOWER(?)",
        "LOWER(COALESCE(e.summary, '')) LIKE LOWER(?)",
        ...topicLikeClauses,
      ].join(" OR ")
      clauses.push(`(${searchClause})`)
      params.push(`%${options.q}%`, `%${options.q}%`, ...searchTopics.map(topic => `%\"${topic}\"%`))
    }
    if (options.entity) {
      const lookupTerms = getEntityLookupTerms(options.entity)
      if (lookupTerms.length) {
        const placeholders = lookupTerms.map(() => "?").join(", ")
        clauses.push(`
          EXISTS (
            SELECT 1
            FROM entity_links el
            WHERE el.event_id = e.event_id
              AND (
                LOWER(el.entity_name) IN (${placeholders})
                OR LOWER(COALESCE(el.code, '')) IN (${placeholders})
                OR LOWER(COALESCE(el.full_code, '')) IN (${placeholders})
              )
          )
        `)
        params.push(...lookupTerms, ...lookupTerms, ...lookupTerms)
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""

    if (!options.topic) {
      const row = await this.db.prepare(`
        SELECT COUNT(*) AS total_count
        FROM events e
        ${where}
      `).get(...params) as { total_count?: number } | undefined
      return Number(row?.total_count) || 0
    }

    const rows = getRows<EventQueryRow>(await this.db.prepare(`
      SELECT
        e.*,
        (
          SELECT COUNT(*)
          FROM event_evidence ee
          WHERE ee.event_id = e.event_id
        ) AS evidence_count,
        (
          SELECT json_group_array(DISTINCT ee.source_id)
          FROM event_evidence ee
          WHERE ee.event_id = e.event_id
        ) AS source_ids_json,
        (
          SELECT et.state_to
          FROM event_timeline et
          WHERE et.event_id = e.event_id
            AND COALESCE(et.reason, '') != 'canonical_identity_merge'
          ORDER BY et.changed_at DESC, et.timeline_id DESC
          LIMIT 1
        ) AS latest_lifecycle_state,
        (
          SELECT et.changed_at
          FROM event_timeline et
          WHERE et.event_id = e.event_id
            AND COALESCE(et.reason, '') != 'canonical_identity_merge'
          ORDER BY et.changed_at DESC, et.timeline_id DESC
          LIMIT 1
        ) AS latest_lifecycle_at
      FROM events e
      ${where}
      ORDER BY COALESCE(e.published_at, e.ingested_at) DESC, e.ingested_at DESC
    `).all(...params))

    return rows
      .map(row => this.normalizeEventRecord(this.toEventRecord(row)))
      .filter(item => this.matchesTopic(item, options.topic!))
      .length
  }

  private matchesTopic(event: EventRecord, topic: string) {
    const target = topic as IndustryTag
    const assigned = this.normalizeTopicTags(event)
    const inferred = assigned

    if (inferred.includes(target)) return true

    if (!assigned.includes(target)) return false

    if (assigned.length >= allIndustryTags.length) return false

    return true
  }

  private normalizeEventRecord(event: EventRecord, facts?: EventFactRow[]) {
    const nextTopicTags = this.normalizeTopicTags(event)
    const primarySourceId = event.sourceIds[0]

    if (!primarySourceId) {
      return {
        ...event,
        topicTags: nextTopicTags,
      }
    }

    const resolved = resolveEventClassification(primarySourceId, event.title, event.summary)
    const normalized = {
      ...event,
      sourceKind: event.sourceKind ?? resolved.profile?.sourceKind,
      primaryEntityName: event.primaryEntityName ?? resolved.primaryEntityName,
      topicTags: nextTopicTags.length ? nextTopicTags : resolved.topicTags,
    }
    const hasStoredImpact = normalized.directionalView !== undefined
      && normalized.directionalConfidence !== undefined
      && normalized.materialityScore !== undefined
      && normalized.tradabilityScore !== undefined
      && normalized.impactSummary !== undefined

    if (hasStoredImpact && event.eventType === resolved.eventType && event.eventSubType === resolved.eventSubType) {
      return normalized
    }

    if (!facts?.length && event.eventType === resolved.eventType && event.eventSubType === resolved.eventSubType) {
      return normalized
    }

    const impact = buildImpactSnapshot({
      eventType: resolved.eventType,
      eventSubType: resolved.eventSubType,
      profile: resolved.profile,
      publishedAt: event.publishedAt,
      degraded: event.degraded,
      facts,
    })

    return {
      ...normalized,
      eventType: resolved.eventType,
      eventSubType: resolved.eventSubType,
      directionalView: impact.directionalView,
      directionalConfidence: impact.directionalConfidence,
      materialityScore: impact.materialityScore,
      tradabilityScore: impact.tradabilityScore,
      impactSummary: impact.impactSummary.length ? impact.impactSummary : event.impactSummary,
      affectedMarkets: impact.affectedMarkets.length ? impact.affectedMarkets : event.affectedMarkets,
    }
  }

  private normalizeTopicTags(event: EventRecord) {
    const assigned = event.topicTags ?? []
    const combinedSummary = [event.summary, ...(event.impactSummary ?? [])]
      .filter(Boolean)
      .join(" ")
    const inferred = inferIndustryTagsFromText(event.title, combinedSummary)

    if (inferred.length) {
      if (!assigned.length) return inferred
      const narrowed = inferred.filter(tag => assigned.includes(tag))
      return narrowed.length ? narrowed : inferred
    }

    if (assigned.length >= allIndustryTags.length) return []

    return assigned
  }

  async getEventDetail(eventId: string): Promise<EventDetailRow | undefined> {
    const row = await this.db.prepare(`
      SELECT
        e.*,
        (
          SELECT COUNT(*)
          FROM event_evidence ee
          WHERE ee.event_id = e.event_id
        ) AS evidence_count,
        (
          SELECT json_group_array(DISTINCT ee.source_id)
          FROM event_evidence ee
          WHERE ee.event_id = e.event_id
        ) AS source_ids_json,
        (
          SELECT et.state_to
          FROM event_timeline et
          WHERE et.event_id = e.event_id
            AND COALESCE(et.reason, '') != 'canonical_identity_merge'
          ORDER BY et.changed_at DESC, et.timeline_id DESC
          LIMIT 1
        ) AS latest_lifecycle_state,
        (
          SELECT et.changed_at
          FROM event_timeline et
          WHERE et.event_id = e.event_id
            AND COALESCE(et.reason, '') != 'canonical_identity_merge'
          ORDER BY et.changed_at DESC, et.timeline_id DESC
          LIMIT 1
        ) AS latest_lifecycle_at
      FROM events e
      WHERE e.event_id = ?
    `).get(eventId) as EventQueryRow | undefined

    if (!row) return undefined

    const evidences = getRows<EventEvidenceQueryRow>(await this.db.prepare(`
      SELECT
        ee.event_id,
        ee.raw_id,
        ee.source_id,
        ee.source_item_id,
        ee.title,
        ee.summary,
        ee.canonical_url,
        ee.published_at,
        ee.fetched_at,
        ee.source_priority,
        ee.authority_level,
        ee.parser_family,
        ee.extraction_status,
        ee.extraction_error,
        ee.passthrough_payload_json
      FROM event_evidence ee
      WHERE ee.event_id = ?
      ORDER BY COALESCE(ee.published_at, ee.fetched_at) DESC, ee.rank ASC
    `).all(eventId)).map((evidence): EventEvidence => ({
      eventId: evidence.event_id,
      rawId: evidence.raw_id,
      sourceId: evidence.source_id,
      sourceItemId: evidence.source_item_id ?? undefined,
      sourceName: sources[evidence.source_id as SourceID]?.name,
      sourceTitle: sources[evidence.source_id as SourceID]?.title,
      title: evidence.title,
      url: evidence.canonical_url,
      summary: evidence.summary ?? undefined,
      publishedAt: evidence.published_at ?? undefined,
      fetchedAt: evidence.fetched_at ?? undefined,
      sourcePriority: evidence.source_priority ?? undefined,
      authorityLevel: evidence.authority_level ?? undefined,
      parserFamily: evidence.parser_family ?? undefined,
      extractionStatus: evidence.extraction_status ?? undefined,
      extractionError: evidence.extraction_error ?? undefined,
    }))

    const factRows = getRows<EventFactRow>(await this.db.prepare(`
      SELECT fact_id, event_id, evidence_id, fact_type, metric_name, value, unit, previous_value, delta, direction, effective_at, entity_id, confidence, payload_json
      FROM event_facts
      WHERE event_id = ?
      ORDER BY effective_at DESC, fact_type ASC, metric_name ASC
    `).all(eventId))
    const facts = factRows.map((fact): EventFact => ({
      factId: fact.fact_id,
      eventId: fact.event_id,
      evidenceId: fact.evidence_id ?? undefined,
      factType: fact.fact_type,
      metricName: fact.metric_name,
      value: fact.value ?? undefined,
      unit: fact.unit ?? undefined,
      previousValue: fact.previous_value ?? undefined,
      delta: fact.delta ?? undefined,
      direction: fact.direction ?? undefined,
      effectiveAt: fact.effective_at ?? undefined,
      entityId: fact.entity_id ?? undefined,
      confidence: fact.confidence,
      payload: parseJSON<Record<string, unknown>>(fact.payload_json, {}),
    }))

    const entities = getRows<EntityLinkRow>(await this.db.prepare(`
      SELECT event_id, entity_type, entity_name, code, full_code, confidence, resolver
      FROM entity_links
      WHERE event_id = ?
      ORDER BY confidence DESC, entity_type ASC, entity_name ASC
    `).all(eventId)).map((entity): EventEntityLink => ({
      eventId: entity.event_id,
      entityType: entity.entity_type,
      entityName: entity.entity_name,
      code: entity.code || undefined,
      fullCode: entity.full_code || undefined,
      confidence: entity.confidence,
      resolver: entity.resolver,
    }))

    const timeline = getRows<EventTimelineRow>(await this.db.prepare(`
      SELECT timeline_id, event_id, state_from, state_to, changed_at, trigger_evidence_id, actor, reason, metadata_json
      FROM event_timeline
      WHERE event_id = ?
      ORDER BY changed_at DESC, timeline_id DESC
    `).all(eventId)).map((entry): EventTimelineEntry => ({
      timelineId: entry.timeline_id,
      eventId: entry.event_id,
      stateFrom: entry.state_from ?? undefined,
      stateTo: entry.state_to,
      changedAt: entry.changed_at,
      triggerEvidenceId: entry.trigger_evidence_id ?? undefined,
      actor: entry.actor ?? undefined,
      reason: entry.reason ?? undefined,
      metadata: parseJSON<Record<string, unknown>>(entry.metadata_json, {}),
    }))

    const detail: EventDetailRow = {
      ...this.normalizeEventRecord(this.toEventRecord(row), factRows),
      seriesKey: row.series_key ?? undefined,
      periodKey: row.period_key ?? undefined,
      releaseCadence: row.release_cadence ?? undefined,
      evidences,
      entities,
      facts,
      timeline,
    }

    return detail
  }

  private toEventRecord(row: EventQueryRow): EventRecord {
    return {
      eventId: row.event_id,
      title: row.title,
      summary: row.summary ?? undefined,
      eventType: row.event_type,
      eventSubType: row.event_subtype,
      sourceKind: row.source_kind ?? undefined,
      publishedAt: row.published_at ?? undefined,
      ingestedAt: row.ingested_at,
      canonicalUrl: row.canonical_url ?? undefined,
      primaryEntityName: row.primary_entity_name ?? undefined,
      seriesKey: row.series_key ?? undefined,
      periodKey: row.period_key ?? undefined,
      releaseCadence: row.release_cadence ?? undefined,
      importance: row.importance,
      sentiment: row.sentiment ?? undefined,
      directionalView: row.directional_view ?? undefined,
      directionalConfidence: row.directional_confidence ?? undefined,
      materialityScore: row.materiality_score ?? undefined,
      tradabilityScore: row.tradability_score ?? undefined,
      authorityScore: row.authority_score ?? undefined,
      freshnessScore: row.freshness_score ?? undefined,
      surpriseScore: row.surprise_score ?? undefined,
      affectedMarkets: parseJSON<AffectedMarket[]>(row.affected_markets_json, []),
      impactSummary: parseJSON<string[]>(row.impact_summary_json, []),
      degraded: Boolean(row.degraded),
      latestLifecycleState: row.latest_lifecycle_state ?? undefined,
      latestLifecycleAt: row.latest_lifecycle_at ?? undefined,
      topicTags: parseJSON<IndustryTag[]>(row.topic_tags_json, []),
      evidenceCount: Number(row.evidence_count) || 0,
      sourceIds: parseJSON<SourceID[]>(row.source_ids_json, []),
    }
  }

  private async ensureColumn(table: string, column: string, definition: string) {
    const rows = getRows<{ name: string }>(await this.db.prepare(`PRAGMA table_info(${table})`).all())
    if (rows.some(row => row.name === column)) return
    await this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
  }
}

export async function getEventTable() {
  try {
    const db = useDatabase()
    if (process.env.ENABLE_CACHE === "false") return
    const eventTable = new EventTable(db)
    if (process.env.INIT_TABLE !== "false") await eventTable.init()
    return eventTable
  } catch (e) {
    getEventTableLogger().error("failed to init event database ", e)
  }
}
