import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { EventTable } from "#/database/events"

const cleanupPaths: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  while (cleanupPaths.length) {
    const path = cleanupPaths.pop()
    if (!path) continue
    rmSync(path, { recursive: true, force: true })
  }
})

function createTempDb(name: string) {
  const cwd = mkdtempSync(join(tmpdir(), "newsnow-event-db-"))
  cleanupPaths.push(cwd)
  return createDatabase(sqliteConnector({
    cwd,
    name,
  }))
}

function getColumnNames(instance: any, table: string) {
  return instance.prepare(`PRAGMA table_info(${table})`).all().map((row: { name: string }) => row.name)
}

describe("event table migration", () => {
  it("initializes upgraded schema on a clean database", async () => {
    const db = createTempDb("clean")
    const table = new EventTable(db as any)

    await table.init()

    const instance: any = db.getInstance()
    expect(getColumnNames(instance, "events")).toEqual(expect.arrayContaining([
      "event_subtype",
      "source_kind",
      "series_key",
      "period_key",
      "release_cadence",
      "directional_view",
      "directional_confidence",
      "materiality_score",
      "tradability_score",
      "authority_score",
      "freshness_score",
      "surprise_score",
      "affected_markets_json",
      "impact_summary_json",
      "degraded",
    ]))
    expect(getColumnNames(instance, "event_evidence")).toEqual(expect.arrayContaining([
      "source_item_id",
      "title",
      "summary",
      "canonical_url",
      "published_at",
      "fetched_at",
      "source_priority",
      "authority_level",
      "parser_family",
      "passthrough_payload_json",
      "extraction_status",
      "extraction_error",
    ]))
    expect(instance.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='event_timeline'`).get()).toBeTruthy()
    expect(instance.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='event_facts'`).get()).toBeTruthy()
  })

  it("adds upgraded columns and tables on an existing legacy database", async () => {
    const db = createTempDb("legacy")
    const instance: any = db.getInstance()
    instance.exec(`
      CREATE TABLE raw_items (
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
      CREATE TABLE events (
        event_id TEXT PRIMARY KEY,
        cluster_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        summary TEXT,
        event_type TEXT NOT NULL,
        published_at INTEGER,
        ingested_at INTEGER NOT NULL,
        canonical_url TEXT,
        importance TEXT NOT NULL,
        sentiment TEXT,
        topic_tags_json TEXT NOT NULL,
        last_seen_at INTEGER NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE event_evidence (
        event_id TEXT NOT NULL,
        raw_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        rank INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (event_id, raw_id)
      );
      CREATE TABLE entity_links (
        event_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT '',
        full_code TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL,
        resolver TEXT NOT NULL
      );
    `)

    const table = new EventTable(db as any)
    await table.init()

    expect(getColumnNames(instance, "events")).toEqual(expect.arrayContaining([
      "event_subtype",
      "primary_entity_name",
      "source_kind",
      "series_key",
      "period_key",
      "release_cadence",
      "directional_view",
      "directional_confidence",
      "materiality_score",
      "tradability_score",
      "authority_score",
      "freshness_score",
      "surprise_score",
      "affected_markets_json",
      "impact_summary_json",
      "degraded",
    ]))
    expect(getColumnNames(instance, "event_evidence")).toEqual(expect.arrayContaining([
      "source_item_id",
      "title",
      "summary",
      "canonical_url",
      "published_at",
      "fetched_at",
      "source_priority",
      "authority_level",
      "parser_family",
      "passthrough_payload_json",
      "extraction_status",
      "extraction_error",
    ]))
    expect(instance.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='event_sources'`).get()).toBeTruthy()
    expect(instance.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='event_metrics'`).get()).toBeTruthy()
    expect(instance.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='event_timeline'`).get()).toBeTruthy()
  })

  it("rolls back partial writes when a transaction fails", async () => {
    const db = createTempDb("tx-rollback")
    const table = new EventTable(db as any)
    await table.init()

    await expect(table.withTransaction(async () => {
      await table.upsertEvent({
        event_id: "evt_tx",
        cluster_key: "cluster_tx",
        title: "tx title",
        summary: null,
        event_type: "macro",
        event_subtype: "macro_data",
        source_kind: "official_macro_release",
        published_at: Date.now(),
        ingested_at: Date.now(),
        canonical_url: "https://example.com/tx",
        primary_entity_name: null,
        importance: "high",
        sentiment: null,
        directional_view: "positive",
        directional_confidence: 80,
        materiality_score: 70,
        tradability_score: 60,
        authority_score: 90,
        freshness_score: 80,
        surprise_score: 50,
        affected_markets_json: "[]",
        impact_summary_json: "[]",
        degraded: 0,
        topic_tags_json: "[]",
        last_seen_at: Date.now(),
        status: "active",
      })
      throw new Error("boom")
    })).rejects.toThrow("boom")

    await expect(table.getEventById("evt_tx")).resolves.toBeUndefined()
  })

  it("supports nested transactions through savepoints", async () => {
    const db = createTempDb("tx-savepoint")
    const table = new EventTable(db as any)
    await table.init()

    await table.withTransaction(async () => {
      await table.upsertEvent({
        event_id: "evt_parent",
        cluster_key: "cluster_parent",
        title: "parent title",
        summary: null,
        event_type: "macro",
        event_subtype: "macro_data",
        source_kind: "official_macro_release",
        published_at: Date.now(),
        ingested_at: Date.now(),
        canonical_url: "https://example.com/parent",
        primary_entity_name: null,
        importance: "high",
        sentiment: null,
        directional_view: "positive",
        directional_confidence: 80,
        materiality_score: 70,
        tradability_score: 60,
        authority_score: 90,
        freshness_score: 80,
        surprise_score: 50,
        affected_markets_json: "[]",
        impact_summary_json: "[]",
        degraded: 0,
        topic_tags_json: "[]",
        last_seen_at: Date.now(),
        status: "active",
      })

      await expect(table.withTransaction(async () => {
        await table.upsertEvent({
          event_id: "evt_child",
          cluster_key: "cluster_child",
          title: "child title",
          summary: null,
          event_type: "macro",
          event_subtype: "macro_data",
          source_kind: "official_macro_release",
          published_at: Date.now(),
          ingested_at: Date.now(),
          canonical_url: "https://example.com/child",
          primary_entity_name: null,
          importance: "high",
          sentiment: null,
          directional_view: "negative",
          directional_confidence: 60,
          materiality_score: 50,
          tradability_score: 40,
          authority_score: 90,
          freshness_score: 80,
          surprise_score: 20,
          affected_markets_json: "[]",
          impact_summary_json: "[]",
          degraded: 0,
          topic_tags_json: "[]",
          last_seen_at: Date.now(),
          status: "active",
        })
        throw new Error("child boom")
      })).rejects.toThrow("child boom")
    })

    await expect(table.getEventById("evt_parent")).resolves.toBeTruthy()
    await expect(table.getEventById("evt_child")).resolves.toBeUndefined()
  })

  it("narrows topic filtering to sector-relevant events instead of broad-tagged macro noise", async () => {
    const db = createTempDb("topic-filter")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    const broadTags = JSON.stringify(["semiconductor", "photovoltaic", "new-energy-vehicle", "medicine", "ai-computing", "steel", "non-ferrous", "chemical"])

    await table.upsertEvent({
      event_id: "evt_macro_generic",
      cluster_key: "cluster_macro_generic",
      title: "2026年1—2月份全国固定资产投资同比增长1.8%",
      summary: null,
      event_type: "macro",
      event_subtype: "macro_data",
      source_kind: "official_macro_release",
      published_at: now - 1000,
      ingested_at: now - 1000,
      canonical_url: "https://example.com/macro",
      primary_entity_name: null,
      importance: "high",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 40,
      materiality_score: 70,
      tradability_score: 50,
      authority_score: 95,
      freshness_score: 85,
      surprise_score: 40,
      affected_markets_json: "[]",
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: broadTags,
      last_seen_at: now - 1000,
      status: "active",
    })

    await table.upsertEvent({
      event_id: "evt_semiconductor",
      cluster_key: "cluster_semiconductor",
      title: "2026年一季度集成电路产量增长情况",
      summary: null,
      event_type: "industry",
      event_subtype: "industry_data",
      source_kind: "official_macro_release",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/semi",
      primary_entity_name: null,
      importance: "high",
      sentiment: null,
      directional_view: "positive",
      directional_confidence: 60,
      materiality_score: 78,
      tradability_score: 65,
      authority_score: 95,
      freshness_score: 90,
      surprise_score: 55,
      affected_markets_json: "[]",
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: broadTags,
      last_seen_at: now,
      status: "active",
    })

    const results = await table.listEvents({
      limit: 10,
      topic: "semiconductor",
      sortBy: "investment",
    })

    expect(results.map(item => item.eventId)).toEqual(["evt_semiconductor"])
  })

  it("counts topic-filtered events using the same narrowing logic as the list view", async () => {
    const db = createTempDb("topic-count")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    const broadTags = JSON.stringify(["semiconductor", "photovoltaic", "new-energy-vehicle", "medicine", "ai-computing", "steel", "non-ferrous", "chemical"])

    await table.upsertEvent({
      event_id: "evt_macro_noise",
      cluster_key: "cluster_macro_noise",
      title: "2026年1—2月份全国固定资产投资同比增长1.8%",
      summary: null,
      event_type: "macro",
      event_subtype: "macro_data",
      source_kind: "official_macro_release",
      published_at: now - 1000,
      ingested_at: now - 1000,
      canonical_url: "https://example.com/macro-noise",
      primary_entity_name: null,
      importance: "high",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 40,
      materiality_score: 70,
      tradability_score: 50,
      authority_score: 95,
      freshness_score: 85,
      surprise_score: 40,
      affected_markets_json: "[]",
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: broadTags,
      last_seen_at: now - 1000,
      status: "active",
    })

    await table.upsertEvent({
      event_id: "evt_topic_hit",
      cluster_key: "cluster_topic_hit",
      title: "2026年一季度集成电路产量增长情况",
      summary: null,
      event_type: "industry",
      event_subtype: "industry_data",
      source_kind: "official_macro_release",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/topic-hit",
      primary_entity_name: null,
      importance: "high",
      sentiment: null,
      directional_view: "positive",
      directional_confidence: 60,
      materiality_score: 78,
      tradability_score: 65,
      authority_score: 95,
      freshness_score: 90,
      surprise_score: 55,
      affected_markets_json: "[]",
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: broadTags,
      last_seen_at: now,
      status: "active",
    })

    await expect(table.countEvents({ topic: "semiconductor" })).resolves.toBe(1)
  })

  it("normalizes stale exchange disclosure subtype and scores on read", async () => {
    const db = createTempDb("legacy-disclosure-read")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_legacy_listing",
      cluster_key: "cluster_legacy_listing",
      title: "联讯仪器：联讯仪器首次公开发行股票并在科创板上市发行公告",
      summary: null,
      event_type: "announcement",
      event_subtype: "listing_status",
      source_kind: "exchange_disclosure",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/ipo",
      primary_entity_name: "联讯仪器",
      importance: "high",
      sentiment: null,
      directional_view: "unknown",
      directional_confidence: 20,
      materiality_score: 88,
      tradability_score: 90,
      authority_score: 90,
      freshness_score: 95,
      surprise_score: 50,
      affected_markets_json: JSON.stringify(["A", "HK"]),
      impact_summary_json: JSON.stringify(["停复牌/上市状态变化直接影响交易可达性与价格发现"]),
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })
    await table.addEvidence({
      event_id: "evt_legacy_listing",
      raw_id: "raw_legacy_listing",
      source_id: "cninfo-sse",
      source_item_id: "raw_legacy_listing",
      title: "联讯仪器：联讯仪器首次公开发行股票并在科创板上市发行公告",
      summary: null,
      canonical_url: "https://example.com/ipo",
      published_at: now,
      fetched_at: now,
      source_priority: 90,
      authority_level: "exchange",
      parser_family: "exchange_disclosure",
      passthrough_payload_json: "{}",
      extraction_status: "structured",
      extraction_error: null,
      rank: 0,
    })

    const [result] = await table.listEvents({
      limit: 1,
      sortBy: "investment",
      sourceId: "cninfo-sse",
    })

    expect(result?.eventSubType).toBe("financing")
    expect(result?.materialityScore).toBe(66)
    expect(result?.tradabilityScore).toBe(58)
  })

  it("persists and reads series metadata on event rows and details", async () => {
    const db = createTempDb("series-metadata-roundtrip")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_series",
      cluster_key: "cluster_series",
      title: "2026年3月工业增加值数据",
      summary: "结构化系列数据",
      event_type: "industry",
      event_subtype: "industry_data",
      source_kind: "official_macro_release",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/series",
      primary_entity_name: "工业",
      series_key: "official_macro_release|industrial_output",
      period_key: "2026-03",
      release_cadence: "monthly",
      importance: "high",
      sentiment: null,
      directional_view: "positive",
      directional_confidence: 68,
      materiality_score: 74,
      tradability_score: 61,
      authority_score: 95,
      freshness_score: 89,
      surprise_score: 42,
      affected_markets_json: JSON.stringify(["A"]),
      impact_summary_json: JSON.stringify(["系列数据保留了单期发布的序列身份"]),
      degraded: 0,
      topic_tags_json: JSON.stringify(["industrial_policy"]),
      last_seen_at: now,
      status: "active",
    })

    const rawRow = await table.getEventById("evt_series")
    const detail = await table.getEventDetail("evt_series")
    const listResult = await table.listEvents({
      limit: 5,
      eventType: "industry",
      sortBy: "investment",
    })

    expect(rawRow?.series_key).toBe("official_macro_release|industrial_output")
    expect(rawRow?.period_key).toBe("2026-03")
    expect(rawRow?.release_cadence).toBe("monthly")
    expect((detail as any)?.seriesKey).toBe("official_macro_release|industrial_output")
    expect((detail as any)?.periodKey).toBe("2026-03")
    expect((detail as any)?.releaseCadence).toBe("monthly")
    expect(listResult.map(item => item.eventId)).toEqual(["evt_series"])
    expect(listResult[0]?.title).toBe("2026年3月工业增加值数据")
  })

  it("supports changed-first ordering and lifecycle recency filters for scan semantics", async () => {
    const db = createTempDb("changed-scan-semantics")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_recently_changed",
      cluster_key: "cluster_recently_changed",
      title: "近期发生确认更新",
      summary: null,
      event_type: "macro",
      event_subtype: "macro_data",
      source_kind: "official_macro_release",
      published_at: now - 10_000,
      ingested_at: now - 10_000,
      canonical_url: "https://example.com/recently-changed",
      primary_entity_name: null,
      importance: "high",
      sentiment: null,
      directional_view: "positive",
      directional_confidence: 70,
      materiality_score: 68,
      tradability_score: 54,
      authority_score: 92,
      freshness_score: 75,
      surprise_score: 48,
      affected_markets_json: JSON.stringify(["CN_macro"]),
      impact_summary_json: JSON.stringify(["宏观序列发生新确认"]),
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now - 10_000,
      status: "active",
    })
    await table.addTimeline({
      timeline_id: "etl_recently_changed_detected",
      event_id: "evt_recently_changed",
      state_from: null,
      state_to: "detected",
      changed_at: now - 10_000,
      trigger_evidence_id: null,
      actor: "event-engine",
      reason: "first_seen",
      metadata_json: "{}",
    })
    await table.addTimeline({
      timeline_id: "etl_recently_changed_confirmed",
      event_id: "evt_recently_changed",
      state_from: "detected",
      state_to: "confirmed",
      changed_at: now - 100,
      trigger_evidence_id: null,
      actor: "event-engine",
      reason: "authoritative_source_confirmation",
      metadata_json: "{}",
    })

    await table.upsertEvent({
      event_id: "evt_newer_published",
      cluster_key: "cluster_newer_published",
      title: "发布时间更近但生命周期更早",
      summary: null,
      event_type: "macro",
      event_subtype: "macro_data",
      source_kind: "official_macro_release",
      published_at: now - 1_000,
      ingested_at: now - 1_000,
      canonical_url: "https://example.com/newer-published",
      primary_entity_name: null,
      importance: "high",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 45,
      materiality_score: 60,
      tradability_score: 46,
      authority_score: 92,
      freshness_score: 84,
      surprise_score: 36,
      affected_markets_json: JSON.stringify(["CN_macro"]),
      impact_summary_json: JSON.stringify(["发布时间较近但不是最近发生变化的事件"]),
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now - 1_000,
      status: "active",
    })
    await table.addTimeline({
      timeline_id: "etl_newer_published_detected",
      event_id: "evt_newer_published",
      state_from: null,
      state_to: "detected",
      changed_at: now - 1_000,
      trigger_evidence_id: null,
      actor: "event-engine",
      reason: "first_seen",
      metadata_json: "{}",
    })

    const changedResults = await table.listEvents({
      limit: 5,
      sortBy: "changed",
    })
    const filteredResults = await table.listEvents({
      limit: 5,
      sortBy: "changed",
      lifecycleAfter: now - 500,
    })
    const changedCount = await table.countEvents({
      lifecycleAfter: now - 500,
    })

    expect(changedResults.map(item => item.eventId)).toEqual([
      "evt_recently_changed",
      "evt_newer_published",
    ])
    expect(filteredResults.map(item => item.eventId)).toEqual(["evt_recently_changed"])
    expect(changedCount).toBe(1)
  })

  it("filters recurring releases by series key and period key", async () => {
    const db = createTempDb("series-scan-filters")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    const commonRow = {
      event_type: "macro" as const,
      event_subtype: "macro_data" as const,
      source_kind: "official_macro_release" as const,
      importance: "high" as const,
      sentiment: null,
      directional_view: "neutral" as const,
      directional_confidence: 62,
      materiality_score: 72,
      tradability_score: 53,
      authority_score: 95,
      freshness_score: 83,
      surprise_score: 40,
      affected_markets_json: JSON.stringify(["CN_macro"]),
      impact_summary_json: JSON.stringify(["同一序列的不同期次"]),
      degraded: 0,
      topic_tags_json: "[]",
      status: "active",
    }

    await table.upsertEvent({
      event_id: "evt_series_mar",
      cluster_key: "cluster_series_mar",
      title: "2026年3月工业增加值数据",
      summary: null,
      published_at: now - 10_000,
      ingested_at: now - 10_000,
      canonical_url: "https://example.com/series-mar",
      primary_entity_name: null,
      series_key: "official_macro_release|industrial_output",
      period_key: "2026-03",
      release_cadence: "monthly",
      last_seen_at: now - 10_000,
      ...commonRow,
    })
    await table.upsertEvent({
      event_id: "evt_series_apr",
      cluster_key: "cluster_series_apr",
      title: "2026年4月工业增加值数据",
      summary: null,
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/series-apr",
      primary_entity_name: null,
      series_key: "official_macro_release|industrial_output",
      period_key: "2026-04",
      release_cadence: "monthly",
      last_seen_at: now,
      ...commonRow,
    })
    await table.upsertEvent({
      event_id: "evt_other_series",
      cluster_key: "cluster_other_series",
      title: "2026年4月社会消费品零售总额",
      summary: null,
      published_at: now + 1_000,
      ingested_at: now + 1_000,
      canonical_url: "https://example.com/other-series",
      primary_entity_name: null,
      series_key: "official_macro_release|retail_sales",
      period_key: "2026-04",
      release_cadence: "monthly",
      last_seen_at: now + 1_000,
      ...commonRow,
    })

    const seriesResults = await table.listEvents({
      limit: 5,
      seriesKey: "official_macro_release|industrial_output",
      sortBy: "latest",
    })
    const periodResults = await table.listEvents({
      limit: 5,
      seriesKey: "official_macro_release|industrial_output",
      periodKey: "2026-03",
      sortBy: "latest",
    })
    const seriesCount = await table.countEvents({
      seriesKey: "official_macro_release|industrial_output",
    })

    expect(seriesResults.map(item => item.eventId)).toEqual([
      "evt_series_apr",
      "evt_series_mar",
    ])
    expect(periodResults.map(item => item.eventId)).toEqual(["evt_series_mar"])
    expect(seriesCount).toBe(2)
  })

  it("reports recent operational volume and ingest latency stats", async () => {
    const db = createTempDb("ops-stats")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_recent",
      cluster_key: "cluster_recent",
      title: "recent title",
      summary: null,
      event_type: "macro",
      event_subtype: "macro_data",
      source_kind: "official_macro_release",
      published_at: now - 5 * 60 * 1000,
      ingested_at: now,
      canonical_url: "https://example.com/recent",
      primary_entity_name: null,
      importance: "high",
      sentiment: null,
      directional_view: "positive",
      directional_confidence: 80,
      materiality_score: 70,
      tradability_score: 60,
      authority_score: 90,
      freshness_score: 80,
      surprise_score: 50,
      affected_markets_json: "[]",
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })
    await table.upsertEvent({
      event_id: "evt_old",
      cluster_key: "cluster_old",
      title: "old title",
      summary: null,
      event_type: "macro",
      event_subtype: "macro_data",
      source_kind: "official_macro_release",
      published_at: now - 48 * 60 * 60 * 1000,
      ingested_at: now - 47 * 60 * 60 * 1000,
      canonical_url: "https://example.com/old",
      primary_entity_name: null,
      importance: "high",
      sentiment: null,
      directional_view: "positive",
      directional_confidence: 80,
      materiality_score: 70,
      tradability_score: 60,
      authority_score: 90,
      freshness_score: 80,
      surprise_score: 50,
      affected_markets_json: "[]",
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now - 47 * 60 * 60 * 1000,
      status: "active",
    })

    const stats = await table.getOperationalStats({
      since: now - 24 * 60 * 60 * 1000,
    })

    expect(stats.totalActiveEvents).toBe(2)
    expect(stats.recentEventCount).toBe(1)
    expect(stats.avgIngestLatencyMs).toBe(5 * 60 * 1000)
    expect(stats.maxIngestLatencyMs).toBe(5 * 60 * 1000)
  })

  it("reports recent high-value event quality coverage, fallback share, and latency p95", async () => {
    const db = createTempDb("quality-snapshot")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    const highValueBase = {
      event_type: "macro" as const,
      event_subtype: "macro_data" as const,
      source_kind: "official_macro_release" as const,
      importance: "high" as const,
      sentiment: null,
      directional_view: "neutral" as const,
      directional_confidence: 60,
      materiality_score: 70,
      tradability_score: 50,
      authority_score: 95,
      freshness_score: 85,
      surprise_score: 40,
      affected_markets_json: JSON.stringify(["CN_macro"]),
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: "[]",
      status: "active",
    }

    await table.upsertEvent({
      event_id: "evt_quality_1",
      cluster_key: "cluster_quality_1",
      title: "高价值事件1",
      summary: null,
      published_at: now - 300000,
      ingested_at: now,
      canonical_url: "https://example.com/q1",
      primary_entity_name: null,
      last_seen_at: now,
      ...highValueBase,
    })
    await table.addEvidence({
      event_id: "evt_quality_1",
      raw_id: "raw_quality_1",
      source_id: "pbc-omo",
      source_item_id: "raw_quality_1",
      title: "高价值事件1",
      summary: null,
      canonical_url: "https://example.com/q1",
      published_at: now - 300000,
      fetched_at: now,
      source_priority: 100,
      authority_level: "official",
      parser_family: "official_macro_release",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })

    await table.upsertEvent({
      event_id: "evt_quality_2",
      cluster_key: "cluster_quality_2",
      title: "高价值事件2",
      summary: null,
      published_at: now - 120000,
      ingested_at: now,
      canonical_url: "https://example.com/q2",
      primary_entity_name: null,
      last_seen_at: now,
      ...highValueBase,
    })
    await table.addEvidence({
      event_id: "evt_quality_2",
      raw_id: "raw_quality_2",
      source_id: "stats-industry",
      source_item_id: "raw_quality_2",
      title: "高价值事件2",
      summary: null,
      canonical_url: "https://example.com/q2",
      published_at: now - 120000,
      fetched_at: now,
      source_priority: 100,
      authority_level: "official",
      parser_family: "official_macro_release",
      passthrough_payload_json: "{}",
      extraction_status: "structured",
      extraction_error: null,
      rank: 0,
    })

    await table.upsertEvent({
      event_id: "evt_quality_fallback",
      cluster_key: "cluster_quality_fallback",
      title: "高价值泛化回退",
      summary: null,
      event_type: "news",
      event_subtype: "other",
      source_kind: "official_policy_notice",
      published_at: now - 60000,
      ingested_at: now,
      canonical_url: "https://example.com/q3",
      primary_entity_name: null,
      importance: "high",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 40,
      materiality_score: 55,
      tradability_score: 35,
      authority_score: 95,
      freshness_score: 80,
      surprise_score: 25,
      affected_markets_json: JSON.stringify(["CN_macro"]),
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })
    await table.addEvidence({
      event_id: "evt_quality_fallback",
      raw_id: "raw_quality_fallback",
      source_id: "pbc-news",
      source_item_id: "raw_quality_fallback",
      title: "高价值泛化回退",
      summary: null,
      canonical_url: "https://example.com/q3",
      published_at: now - 60000,
      fetched_at: now,
      source_priority: 100,
      authority_level: "official",
      parser_family: "official_policy_notice",
      passthrough_payload_json: "{}",
      extraction_status: "failed",
      extraction_error: "not structured",
      rank: 0,
    })

    await table.upsertEvent({
      event_id: "evt_quality_degraded",
      cluster_key: "cluster_quality_degraded",
      title: "高价值降级事件",
      summary: null,
      event_type: "industry",
      event_subtype: "industry_data",
      source_kind: "industry_stat_release",
      published_at: now - 180000,
      ingested_at: now,
      canonical_url: "https://example.com/q4",
      primary_entity_name: null,
      importance: "high",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 35,
      materiality_score: 50,
      tradability_score: 25,
      authority_score: 90,
      freshness_score: 78,
      surprise_score: 15,
      affected_markets_json: JSON.stringify(["CN_macro"]),
      impact_summary_json: "[]",
      degraded: 1,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })
    await table.addEvidence({
      event_id: "evt_quality_degraded",
      raw_id: "raw_quality_degraded",
      source_id: "stats-industry",
      source_item_id: "raw_quality_degraded",
      title: "高价值降级事件",
      summary: null,
      canonical_url: "https://example.com/q4",
      published_at: now - 180000,
      fetched_at: now,
      source_priority: 95,
      authority_level: "official",
      parser_family: "industry_stat",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })

    await table.upsertEvent({
      event_id: "evt_low_value",
      cluster_key: "cluster_low_value",
      title: "低价值来源",
      summary: null,
      event_type: "news",
      event_subtype: "other",
      source_kind: "industry_news_feed",
      published_at: now - 1000,
      ingested_at: now,
      canonical_url: "https://example.com/low-value",
      primary_entity_name: null,
      importance: "medium",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 20,
      materiality_score: 20,
      tradability_score: 10,
      authority_score: 40,
      freshness_score: 70,
      surprise_score: 10,
      affected_markets_json: "[]",
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })

    const snapshot = await table.getQualitySnapshot({ since: now - 60 * 60 * 1000 })
    const highValue = snapshot.highValue!

    expect(snapshot.windowStartAt).toBe(now - 60 * 60 * 1000)
    expect(highValue.sourceKinds).toContain("industry_stat_release")
    expect(highValue.totalEventCount).toBe(4)
    expect(highValue.structuredEventCount).toBe(2)
    expect(highValue.degradedEventCount).toBe(1)
    expect(highValue.genericFallbackEventCount).toBe(1)
    expect(highValue.structuredCoveragePct).toBeCloseTo(50, 2)
    expect(highValue.genericFallbackSharePct).toBeCloseTo(25, 2)
    expect(highValue.latencySampleCount).toBe(4)
    expect(highValue.avgIngestLatencyMs).toBe(165000)
    expect(highValue.p95IngestLatencyMs).toBe(300000)
    expect(snapshot.highValueSourceEventCount).toBe(4)
    expect(snapshot.highValueStructuredEventCount).toBe(2)
    expect(snapshot.highValueDegradedEventCount).toBe(1)
    expect(snapshot.highValueStructuredCoveragePct).toBeCloseTo(50, 2)
    expect(snapshot.highValueGenericFallbackEventCount).toBe(1)
    expect(snapshot.highValueGenericFallbackSharePct).toBeCloseTo(25, 2)
    expect(snapshot.prioritySourceAvgIngestLatencyMs).toBe(165000)
    expect(snapshot.prioritySourceIngestLatencyP95Ms).toBe(300000)
  })

  it("limits quality snapshots to the requested ingest window", async () => {
    const db = createTempDb("quality-snapshot-window")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    const since = now - 60 * 60 * 1000
    const commonRow = {
      event_type: "macro" as const,
      event_subtype: "macro_data" as const,
      source_kind: "official_macro_release" as const,
      importance: "high" as const,
      sentiment: null,
      directional_view: "neutral" as const,
      directional_confidence: 50,
      materiality_score: 60,
      tradability_score: 45,
      authority_score: 95,
      freshness_score: 80,
      surprise_score: 20,
      affected_markets_json: JSON.stringify(["CN_macro"]),
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: "[]",
      status: "active",
    }

    await table.upsertEvent({
      event_id: "evt_recent_window",
      cluster_key: "cluster_recent_window",
      title: "窗口内事件",
      summary: null,
      published_at: now - 60_000,
      ingested_at: now - 30_000,
      canonical_url: "https://example.com/recent-window",
      primary_entity_name: null,
      last_seen_at: now - 30_000,
      ...commonRow,
    })
    await table.addEvidence({
      event_id: "evt_recent_window",
      raw_id: "raw_recent_window",
      source_id: "stats-industry",
      source_item_id: "raw_recent_window",
      title: "窗口内事件",
      summary: null,
      canonical_url: "https://example.com/recent-window",
      published_at: now - 60_000,
      fetched_at: now - 30_000,
      source_priority: 100,
      authority_level: "official",
      parser_family: "macro_release",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })

    await table.upsertEvent({
      event_id: "evt_stale_window",
      cluster_key: "cluster_stale_window",
      title: "窗口外旧事件",
      summary: null,
      published_at: now - 3 * 60 * 60 * 1000,
      ingested_at: now - 2 * 60 * 60 * 1000,
      canonical_url: "https://example.com/stale-window",
      primary_entity_name: null,
      last_seen_at: now - 2 * 60 * 60 * 1000,
      ...commonRow,
    })
    await table.addEvidence({
      event_id: "evt_stale_window",
      raw_id: "raw_stale_window",
      source_id: "stats-industry",
      source_item_id: "raw_stale_window",
      title: "窗口外旧事件",
      summary: null,
      canonical_url: "https://example.com/stale-window",
      published_at: now - 3 * 60 * 60 * 1000,
      fetched_at: now - 2 * 60 * 60 * 1000,
      source_priority: 100,
      authority_level: "official",
      parser_family: "macro_release",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })

    const snapshot = await table.getQualitySnapshot({ since })
    const highValue = snapshot.highValue!

    expect(snapshot.windowStartAt).toBe(since)
    expect(highValue.totalEventCount).toBe(1)
    expect(highValue.structuredEventCount).toBe(1)
    expect(highValue.structuredCoveragePct).toBe(100)
    expect(snapshot.prioritySourceAvgIngestLatencyMs).toBe(30000)
    expect(snapshot.prioritySourceIngestLatencyP95Ms).toBe(30000)
  })

  it("reports operational latency diagnostics by source kind and source id", async () => {
    const db = createTempDb("latency-diagnostics")
    const table = new EventTable(db as any)
    await table.init()

    const now = 1_760_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)
    const since = now - 60 * 60 * 1000
    const baseRow = {
      event_type: "policy" as const,
      event_subtype: "other" as const,
      importance: "high" as const,
      sentiment: null,
      directional_view: "neutral" as const,
      directional_confidence: 40,
      materiality_score: 55,
      tradability_score: 20,
      authority_score: 95,
      freshness_score: 70,
      surprise_score: 20,
      affected_markets_json: JSON.stringify(["CN_macro"]),
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    }

    await table.upsertEvent({
      event_id: "evt_diag_pbc_1",
      cluster_key: "cluster_diag_pbc_1",
      title: "人民银行公告一",
      summary: null,
      source_kind: "official_policy_notice",
      published_at: now - 900000,
      ingested_at: now - 300000,
      canonical_url: "https://example.com/pbc-1",
      primary_entity_name: null,
      ...baseRow,
    })
    await table.addEvidence({
      event_id: "evt_diag_pbc_1",
      raw_id: "raw_diag_pbc_1",
      source_id: "pbc-news",
      source_item_id: "raw_diag_pbc_1",
      title: "人民银行公告一",
      summary: null,
      canonical_url: "https://example.com/pbc-1",
      published_at: now - 900000,
      fetched_at: now - 300000,
      source_priority: 100,
      authority_level: "official",
      parser_family: "policy",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })

    await table.upsertEvent({
      event_id: "evt_diag_pbc_2",
      cluster_key: "cluster_diag_pbc_2",
      title: "人民银行公告二",
      summary: null,
      source_kind: "official_policy_notice",
      published_at: now - 1200000,
      ingested_at: now - 300000,
      canonical_url: "https://example.com/pbc-2",
      primary_entity_name: null,
      ...baseRow,
    })
    await table.addEvidence({
      event_id: "evt_diag_pbc_2",
      raw_id: "raw_diag_pbc_2",
      source_id: "pbc-news",
      source_item_id: "raw_diag_pbc_2",
      title: "人民银行公告二",
      summary: null,
      canonical_url: "https://example.com/pbc-2",
      published_at: now - 1200000,
      fetched_at: now - 300000,
      source_priority: 100,
      authority_level: "official",
      parser_family: "policy",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })

    await table.upsertEvent({
      event_id: "evt_diag_stats_1",
      cluster_key: "cluster_diag_stats_1",
      title: "统计局数据",
      summary: null,
      ...baseRow,
      source_kind: "official_macro_release",
      published_at: now - 600000,
      ingested_at: now - 540000,
      canonical_url: "https://example.com/stats-1",
      primary_entity_name: null,
      event_type: "macro",
      event_subtype: "macro_data",
    })
    await table.addEvidence({
      event_id: "evt_diag_stats_1",
      raw_id: "raw_diag_stats_1",
      source_id: "stats-industry",
      source_item_id: "raw_diag_stats_1",
      title: "统计局数据",
      summary: null,
      canonical_url: "https://example.com/stats-1",
      published_at: now - 600000,
      fetched_at: now - 540000,
      source_priority: 100,
      authority_level: "official",
      parser_family: "macro_release",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })

    const diagnostics = await table.getOperationalLatencyDiagnostics({
      since,
      limit: 5,
      staleThresholdMs: 5 * 60 * 1000,
    })

    expect(diagnostics.windowStartAt).toBe(since)
    expect(diagnostics.sourceKindBreakdown[0]).toMatchObject({
      sourceKind: "official_policy_notice",
      totalEvents: 2,
      latencySampleCount: 2,
      staleEventCount: 2,
      freshEventCount: 0,
      staleSharePct: 100,
      avgIngestLatencyMs: 750000,
      p95IngestLatencyMs: 900000,
      maxIngestLatencyMs: 900000,
      avgPublicationAgeMs: 1050000,
      p95PublicationAgeMs: 1200000,
      maxPublicationAgeMs: 1200000,
      avgLastSeenDelayMs: 0,
      p95LastSeenDelayMs: 0,
      maxLastSeenDelayMs: 0,
    })
    expect(diagnostics.sourceBreakdown[0]).toMatchObject({
      sourceKind: "official_policy_notice",
      sourceId: "pbc-news",
      totalEvents: 2,
      latencySampleCount: 2,
      staleEventCount: 2,
      freshEventCount: 0,
      staleSharePct: 100,
      avgPublicationAgeMs: 1050000,
      p95PublicationAgeMs: 1200000,
      maxPublicationAgeMs: 1200000,
      avgLastSeenDelayMs: 0,
      p95LastSeenDelayMs: 0,
      maxLastSeenDelayMs: 0,
    })
    expect(diagnostics.sourceBreakdown[1]).toMatchObject({
      sourceKind: "official_macro_release",
      sourceId: "stats-industry",
      totalEvents: 1,
      latencySampleCount: 1,
      staleEventCount: 0,
      freshEventCount: 1,
      staleSharePct: 0,
      avgIngestLatencyMs: 60000,
      p95IngestLatencyMs: 60000,
      maxIngestLatencyMs: 60000,
      avgPublicationAgeMs: 600000,
      p95PublicationAgeMs: 600000,
      maxPublicationAgeMs: 600000,
      avgLastSeenDelayMs: 0,
      p95LastSeenDelayMs: 0,
      maxLastSeenDelayMs: 0,
    })
  })

  it("limits latency diagnostics to the publication window and attributes source buckets to lead evidence", async () => {
    const db = createTempDb("latency-diagnostics-window")
    const table = new EventTable(db as any)
    await table.init()

    const now = 1_760_000_100_000
    vi.spyOn(Date, "now").mockReturnValue(now)
    const since = now - 60 * 60 * 1000
    const baseRow = {
      event_type: "macro" as const,
      event_subtype: "macro_data" as const,
      source_kind: "official_macro_release" as const,
      importance: "high" as const,
      sentiment: null,
      directional_view: "neutral" as const,
      directional_confidence: 55,
      materiality_score: 65,
      tradability_score: 45,
      authority_score: 95,
      freshness_score: 80,
      surprise_score: 30,
      affected_markets_json: JSON.stringify(["CN_macro"]),
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: "[]",
      status: "active",
    }

    await table.upsertEvent({
      event_id: "evt_recent_primary_source",
      cluster_key: "cluster_recent_primary_source",
      title: "窗口内宏观数据",
      summary: null,
      published_at: now - 15 * 60 * 1000,
      ingested_at: now - 8 * 60 * 1000,
      canonical_url: "https://example.com/recent-primary-source",
      primary_entity_name: null,
      last_seen_at: now - 2 * 60 * 1000,
      ...baseRow,
    })
    await table.addEvidence({
      event_id: "evt_recent_primary_source",
      raw_id: "raw_recent_primary_source_primary",
      source_id: "pbc-omo",
      source_item_id: "raw_recent_primary_source_primary",
      title: "窗口内宏观数据",
      summary: null,
      canonical_url: "https://example.com/recent-primary-source",
      published_at: now - 15 * 60 * 1000,
      fetched_at: now - 8 * 60 * 1000,
      source_priority: 100,
      authority_level: "official",
      parser_family: "macro_release",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })
    await table.addEvidence({
      event_id: "evt_recent_primary_source",
      raw_id: "raw_recent_primary_source_secondary",
      source_id: "stats-industry",
      source_item_id: "raw_recent_primary_source_secondary",
      title: "窗口内宏观数据转载",
      summary: null,
      canonical_url: "https://example.com/recent-primary-source-secondary",
      published_at: now - 14 * 60 * 1000,
      fetched_at: now - 7 * 60 * 1000,
      source_priority: 90,
      authority_level: "official",
      parser_family: "macro_release",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 1,
    })

    await table.upsertEvent({
      event_id: "evt_backfill_noise",
      cluster_key: "cluster_backfill_noise",
      title: "窗口外回补事件",
      summary: null,
      published_at: now - 2 * 60 * 60 * 1000,
      ingested_at: now - 3 * 60 * 1000,
      canonical_url: "https://example.com/backfill-noise",
      primary_entity_name: null,
      last_seen_at: now - 3 * 60 * 1000,
      ...baseRow,
    })
    await table.addEvidence({
      event_id: "evt_backfill_noise",
      raw_id: "raw_backfill_noise",
      source_id: "stats-industry",
      source_item_id: "raw_backfill_noise",
      title: "窗口外回补事件",
      summary: null,
      canonical_url: "https://example.com/backfill-noise",
      published_at: now - 2 * 60 * 60 * 1000,
      fetched_at: now - 3 * 60 * 1000,
      source_priority: 100,
      authority_level: "official",
      parser_family: "macro_release",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })

    const diagnostics = await table.getOperationalLatencyDiagnostics({
      since,
      limit: 5,
      staleThresholdMs: 5 * 60 * 1000,
    })

    expect(diagnostics.sourceKindBreakdown).toHaveLength(1)
    expect(diagnostics.sourceKindBreakdown[0]).toMatchObject({
      sourceKind: "official_macro_release",
      totalEvents: 1,
      latencySampleCount: 1,
      staleEventCount: 1,
      freshEventCount: 0,
      staleSharePct: 100,
      avgIngestLatencyMs: 420000,
      avgPublicationAgeMs: 900000,
      avgLastSeenDelayMs: 120000,
    })
    expect(diagnostics.sourceBreakdown).toHaveLength(1)
    expect(diagnostics.sourceBreakdown[0]).toMatchObject({
      sourceKind: "official_macro_release",
      sourceId: "pbc-omo",
      totalEvents: 1,
      latencySampleCount: 1,
      staleEventCount: 1,
      freshEventCount: 0,
      staleSharePct: 100,
      avgIngestLatencyMs: 420000,
      avgPublicationAgeMs: 900000,
      avgLastSeenDelayMs: 120000,
    })
  })

  it("preserves duplicate impact summary when merging into an empty canonical event", async () => {
    const db = createTempDb("merge-impact-summary")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_canonical",
      cluster_key: "cluster_canonical",
      title: "canonical title",
      summary: null,
      event_type: "announcement",
      event_subtype: "earnings",
      source_kind: "exchange_disclosure",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/canonical",
      primary_entity_name: null,
      importance: "high",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 70,
      materiality_score: 60,
      tradability_score: 50,
      authority_score: 90,
      freshness_score: 80,
      surprise_score: 40,
      affected_markets_json: "[]",
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })
    await table.upsertEvent({
      event_id: "evt_duplicate",
      cluster_key: "cluster_duplicate",
      title: "duplicate title",
      summary: "duplicate summary",
      event_type: "announcement",
      event_subtype: "earnings",
      source_kind: "exchange_disclosure",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/duplicate",
      primary_entity_name: "测试公司",
      importance: "high",
      sentiment: null,
      directional_view: "positive",
      directional_confidence: 75,
      materiality_score: 80,
      tradability_score: 65,
      authority_score: 90,
      freshness_score: 80,
      surprise_score: 55,
      affected_markets_json: "[\"A\"]",
      impact_summary_json: "[\"业绩改善带动风险偏好修复\"]",
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })

    await table.mergeEventIntoCanonical({
      canonicalEventId: "evt_canonical",
      duplicateEventId: "evt_duplicate",
      reason: "test_merge",
      mergedAt: now + 1,
    })

    const merged = await table.getEventById("evt_canonical")
    const duplicate = await table.getEventById("evt_duplicate")

    expect(merged?.impact_summary_json).toBe("[\"业绩改善带动风险偏好修复\"]")
    expect(duplicate).toBeUndefined()
  })

  it("keeps confirmed lifecycle truth visible after merge provenance is appended", async () => {
    const db = createTempDb("merge-provenance-lifecycle")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_canonical_confirmed",
      cluster_key: "cluster_canonical_confirmed",
      title: "canonical title",
      summary: null,
      event_type: "announcement",
      event_subtype: "earnings",
      source_kind: "exchange_disclosure",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/canonical-confirmed",
      primary_entity_name: "测试公司",
      importance: "high",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 70,
      materiality_score: 60,
      tradability_score: 50,
      authority_score: 90,
      freshness_score: 80,
      surprise_score: 40,
      affected_markets_json: "[]",
      impact_summary_json: "[]",
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })
    await table.addTimeline({
      timeline_id: "etl_canonical_detected",
      event_id: "evt_canonical_confirmed",
      state_from: null,
      state_to: "detected",
      changed_at: now,
      trigger_evidence_id: null,
      actor: "event-engine",
      reason: "first_seen",
      metadata_json: "{}",
    })
    await table.addTimeline({
      timeline_id: "etl_canonical_confirmed",
      event_id: "evt_canonical_confirmed",
      state_from: "detected",
      state_to: "confirmed",
      changed_at: now + 1,
      trigger_evidence_id: "raw_canonical",
      actor: "event-engine",
      reason: "authoritative_source_confirmation",
      metadata_json: JSON.stringify({
        authorityLevel: "official",
      }),
    })

    await table.upsertEvent({
      event_id: "evt_duplicate_confirmed",
      cluster_key: "cluster_duplicate_confirmed",
      title: "duplicate title",
      summary: "duplicate summary",
      event_type: "announcement",
      event_subtype: "earnings",
      source_kind: "exchange_disclosure",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/duplicate-confirmed",
      primary_entity_name: "测试公司",
      importance: "high",
      sentiment: null,
      directional_view: "positive",
      directional_confidence: 75,
      materiality_score: 80,
      tradability_score: 65,
      authority_score: 90,
      freshness_score: 80,
      surprise_score: 55,
      affected_markets_json: "[\"A\"]",
      impact_summary_json: "[\"业绩改善带动风险偏好修复\"]",
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })
    await table.addTimeline({
      timeline_id: "etl_duplicate_detected",
      event_id: "evt_duplicate_confirmed",
      state_from: null,
      state_to: "detected",
      changed_at: now,
      trigger_evidence_id: null,
      actor: "event-engine",
      reason: "first_seen",
      metadata_json: "{}",
    })
    await table.addTimeline({
      timeline_id: "etl_duplicate_confirmed",
      event_id: "evt_duplicate_confirmed",
      state_from: "detected",
      state_to: "confirmed",
      changed_at: now + 1,
      trigger_evidence_id: "raw_duplicate",
      actor: "event-engine",
      reason: "authoritative_source_confirmation",
      metadata_json: JSON.stringify({
        authorityLevel: "official",
      }),
    })

    await table.mergeEventIntoCanonical({
      canonicalEventId: "evt_canonical_confirmed",
      duplicateEventId: "evt_duplicate_confirmed",
      reason: "confirmed_then_merge",
      mergedAt: now + 2,
    })

    const detail = await table.getEventDetail("evt_canonical_confirmed")
    const lifecycle = await table.getLatestTimelineState("evt_canonical_confirmed")
    const timeline = detail?.timeline ?? []

    expect(lifecycle?.state).toBe("confirmed")
    expect(timeline).toHaveLength(3)
    expect(timeline.filter(entry => entry.reason === "canonical_identity_merge")).toHaveLength(1)
    expect(timeline.filter(entry => entry.stateTo === "confirmed")).toHaveLength(1)
    expect(detail?.impactSummary).toContain("业绩改善带动风险偏好修复")
    await expect(table.getEventById("evt_duplicate_confirmed")).resolves.toBeUndefined()
  })

  it("ignores duplicate new_event timeline entries for the same event", async () => {
    const db = createTempDb("duplicate-new-event-timeline")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_duplicate_new_event",
      cluster_key: "cluster_duplicate_new_event",
      title: "测试事件",
      summary: null,
      event_type: "news",
      event_subtype: "other",
      source_kind: "industry_news_feed",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/duplicate-new-event",
      primary_entity_name: "测试主体",
      importance: "medium",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 30,
      materiality_score: 40,
      tradability_score: 30,
      authority_score: 60,
      freshness_score: 70,
      surprise_score: 20,
      affected_markets_json: JSON.stringify(["A"]),
      impact_summary_json: JSON.stringify([]),
      degraded: 0,
      topic_tags_json: JSON.stringify([]),
      last_seen_at: now,
      status: "active",
    })
    await table.addTimeline({
      timeline_id: "etl_new_event_1",
      event_id: "evt_duplicate_new_event",
      state_from: null,
      state_to: "detected",
      changed_at: now,
      trigger_evidence_id: "raw_1",
      actor: "event-engine",
      reason: "new_event",
      metadata_json: JSON.stringify({ sourceId: "semi-data" }),
    })
    await table.addTimeline({
      timeline_id: "etl_new_event_2",
      event_id: "evt_duplicate_new_event",
      state_from: null,
      state_to: "detected",
      changed_at: now + 1,
      trigger_evidence_id: "raw_2",
      actor: "event-engine",
      reason: "new_event",
      metadata_json: JSON.stringify({ sourceId: "semi-data" }),
    })

    const detail = await table.getEventDetail("evt_duplicate_new_event")

    expect(detail?.timeline.filter(entry => entry.reason === "new_event")).toHaveLength(1)
    expect(detail?.timeline[0]?.timelineId).toBe("etl_new_event_1")
  })

  it("keeps only the first multi-source confirmation while still allowing a later authoritative confirmation", async () => {
    const db = createTempDb("duplicate-confirmation-timeline")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_duplicate_confirmation",
      cluster_key: "cluster_duplicate_confirmation",
      title: "测试确认事件",
      summary: null,
      event_type: "policy",
      event_subtype: "macro_data",
      source_kind: "media_fast_feed",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/duplicate-confirmation",
      primary_entity_name: null,
      importance: "medium",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 30,
      materiality_score: 40,
      tradability_score: 30,
      authority_score: 60,
      freshness_score: 70,
      surprise_score: 20,
      affected_markets_json: JSON.stringify(["A"]),
      impact_summary_json: JSON.stringify([]),
      degraded: 0,
      topic_tags_json: JSON.stringify([]),
      last_seen_at: now,
      status: "active",
    })
    await table.addTimeline({
      timeline_id: "etl_multi_confirm_1",
      event_id: "evt_duplicate_confirmation",
      state_from: "updated",
      state_to: "confirmed",
      changed_at: now,
      trigger_evidence_id: "raw_1",
      actor: "event-engine",
      reason: "multi_source_confirmation",
      metadata_json: JSON.stringify({ sourceId: "eastmoney-7x24" }),
    })
    await table.addTimeline({
      timeline_id: "etl_multi_confirm_2",
      event_id: "evt_duplicate_confirmation",
      state_from: "updated",
      state_to: "confirmed",
      changed_at: now + 1,
      trigger_evidence_id: "raw_2",
      actor: "event-engine",
      reason: "multi_source_confirmation",
      metadata_json: JSON.stringify({ sourceId: "cls-telegraph" }),
    })
    await table.addTimeline({
      timeline_id: "etl_authoritative_confirm_1",
      event_id: "evt_duplicate_confirmation",
      state_from: "confirmed",
      state_to: "confirmed",
      changed_at: now + 2,
      trigger_evidence_id: "raw_3",
      actor: "event-engine",
      reason: "authoritative_source_confirmation",
      metadata_json: JSON.stringify({ sourceId: "pbc" }),
    })
    await table.addTimeline({
      timeline_id: "etl_authoritative_confirm_2",
      event_id: "evt_duplicate_confirmation",
      state_from: "confirmed",
      state_to: "confirmed",
      changed_at: now + 3,
      trigger_evidence_id: "raw_4",
      actor: "event-engine",
      reason: "authoritative_source_confirmation",
      metadata_json: JSON.stringify({ sourceId: "safe" }),
    })

    const detail = await table.getEventDetail("evt_duplicate_confirmation")

    expect(detail?.timeline.filter(entry => entry.reason === "multi_source_confirmation")).toHaveLength(1)
    expect(detail?.timeline.filter(entry => entry.reason === "authoritative_source_confirmation")).toHaveLength(1)
    expect(detail?.timeline.map(entry => entry.timelineId)).toEqual([
      "etl_authoritative_confirm_1",
      "etl_multi_confirm_1",
    ])
  })

  it("repairs duplicate confirmation timeline entries and preserves confirmed lifecycle truth for later updates", async () => {
    const db = createTempDb("repair-duplicate-confirmations")
    const table = new EventTable(db as any)
    const rawTable = table as any
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_repair_confirmation",
      cluster_key: "cluster_repair_confirmation",
      title: "修复确认事件",
      summary: null,
      event_type: "news",
      event_subtype: "other",
      source_kind: "media_fast_feed",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/repair-confirmation",
      primary_entity_name: null,
      importance: "medium",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 30,
      materiality_score: 40,
      tradability_score: 30,
      authority_score: 60,
      freshness_score: 70,
      surprise_score: 20,
      affected_markets_json: JSON.stringify(["A"]),
      impact_summary_json: JSON.stringify([]),
      degraded: 0,
      topic_tags_json: JSON.stringify([]),
      last_seen_at: now,
      status: "active",
    })
    await table.addTimeline({
      timeline_id: "etl_detected_repair_confirmation",
      event_id: "evt_repair_confirmation",
      state_from: null,
      state_to: "detected",
      changed_at: now,
      trigger_evidence_id: "raw_detected",
      actor: "event-engine",
      reason: "new_event",
      metadata_json: JSON.stringify({ sourceId: "cls-telegraph" }),
    })
    await table.addTimeline({
      timeline_id: "etl_multi_confirm_repair_1",
      event_id: "evt_repair_confirmation",
      state_from: "updated",
      state_to: "confirmed",
      changed_at: now + 1,
      trigger_evidence_id: "raw_multi_1",
      actor: "event-engine",
      reason: "multi_source_confirmation",
      metadata_json: JSON.stringify({ sourceId: "eastmoney-7x24" }),
    })
    await rawTable.db.prepare(`
      INSERT OR REPLACE INTO event_timeline (
        timeline_id, event_id, state_from, state_to, changed_at, trigger_evidence_id, actor, reason, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "etl_snapshot_after_multi",
      "evt_repair_confirmation",
      "updated",
      "updated",
      now + 2,
      "raw_snapshot_after_multi",
      "event-engine",
      "event_snapshot_changed",
      JSON.stringify({ sourceId: "cls-telegraph", changedFields: ["标题与摘要"] }),
    )
    await rawTable.db.prepare(`
      INSERT OR REPLACE INTO event_timeline (
        timeline_id, event_id, state_from, state_to, changed_at, trigger_evidence_id, actor, reason, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "etl_multi_confirm_repair_2",
      "evt_repair_confirmation",
      "updated",
      "confirmed",
      now + 3,
      "raw_multi_2",
      "event-engine",
      "multi_source_confirmation",
      JSON.stringify({ sourceId: "cls-telegraph" }),
    )
    await rawTable.db.prepare(`
      INSERT OR REPLACE INTO event_timeline (
        timeline_id, event_id, state_from, state_to, changed_at, trigger_evidence_id, actor, reason, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "etl_authoritative_confirm_repair_1",
      "evt_repair_confirmation",
      "updated",
      "confirmed",
      now + 4,
      "raw_auth_1",
      "event-engine",
      "authoritative_source_confirmation",
      JSON.stringify({ sourceId: "pbc-news" }),
    )
    await rawTable.db.prepare(`
      INSERT OR REPLACE INTO event_timeline (
        timeline_id, event_id, state_from, state_to, changed_at, trigger_evidence_id, actor, reason, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "etl_snapshot_after_authoritative",
      "evt_repair_confirmation",
      "updated",
      "updated",
      now + 5,
      "raw_snapshot_after_authoritative",
      "event-engine",
      "event_snapshot_changed",
      JSON.stringify({ sourceId: "cls-telegraph", changedFields: ["标题与摘要"] }),
    )
    await rawTable.db.prepare(`
      INSERT OR REPLACE INTO event_timeline (
        timeline_id, event_id, state_from, state_to, changed_at, trigger_evidence_id, actor, reason, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "etl_authoritative_confirm_repair_2",
      "evt_repair_confirmation",
      "updated",
      "confirmed",
      now + 6,
      "raw_auth_2",
      "event-engine",
      "authoritative_source_confirmation",
      JSON.stringify({ sourceId: "safe" }),
    )

    const result = await table.repairDuplicateConfirmationTimeline({
      eventIds: ["evt_repair_confirmation"],
    })
    const detail = await table.getEventDetail("evt_repair_confirmation")
    const lifecycle = await table.getLatestTimelineState("evt_repair_confirmation")

    expect(result.updatedEvents).toBe(1)
    expect(result.removedConfirmationEntries).toBe(2)
    expect(result.normalizedConfirmedSnapshotEntries).toBe(2)
    expect(detail?.timeline.map(entry => `${entry.timelineId}:${entry.reason}:${entry.stateTo}`)).toEqual([
      "etl_snapshot_after_authoritative:event_snapshot_changed:confirmed",
      "etl_authoritative_confirm_repair_1:authoritative_source_confirmation:confirmed",
      "etl_snapshot_after_multi:event_snapshot_changed:confirmed",
      "etl_multi_confirm_repair_1:multi_source_confirmation:confirmed",
      "etl_detected_repair_confirmation:new_event:detected",
    ])
    expect(lifecycle?.state).toBe("confirmed")
  })

  it("repairs duplicate stock aliases and normalizes fact entity ids", async () => {
    const db = createTempDb("repair-entity-aliases")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_alias",
      cluster_key: "cluster_alias",
      title: "豪威集团：关于召开2025年年度股东会的通知",
      summary: null,
      event_type: "announcement",
      event_subtype: "buyback",
      source_kind: "exchange_disclosure",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/alias",
      primary_entity_name: "603501",
      importance: "medium",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 30,
      materiality_score: 60,
      tradability_score: 50,
      authority_score: 90,
      freshness_score: 80,
      surprise_score: 20,
      affected_markets_json: JSON.stringify(["A"]),
      impact_summary_json: JSON.stringify([]),
      degraded: 0,
      topic_tags_json: JSON.stringify([]),
      last_seen_at: now,
      status: "active",
    })
    await table.upsertEntityLinks([
      {
        event_id: "evt_alias",
        entity_type: "company",
        entity_name: "豪威集团",
        code: "603501",
        full_code: "sh603501",
        confidence: 0.98,
        resolver: "tdx-api-code",
      },
      {
        event_id: "evt_alias",
        entity_type: "stock",
        entity_name: "豪威集团",
        code: "603501",
        full_code: "sh603501",
        confidence: 0.98,
        resolver: "tdx-api-code",
      },
      {
        event_id: "evt_alias",
        entity_type: "stock",
        entity_name: "603501",
        code: "603501",
        full_code: "",
        confidence: 0.75,
        resolver: "title-regex",
      },
    ])
    await table.upsertEventFacts([{
      fact_id: "fact_alias",
      event_id: "evt_alias",
      evidence_id: "raw_alias",
      fact_type: "exchange_announcement",
      metric_name: "shareholding_change",
      value: null,
      unit: null,
      previous_value: null,
      delta: null,
      direction: null,
      effective_at: now,
      entity_id: "603501",
      confidence: 0.9,
      payload_json: "{}",
    }])

    const result = await table.repairCanonicalEntityLinks()
    const detail = await table.getEventDetail("evt_alias")
    const repairedEvent = await table.getEventById("evt_alias")

    expect(result.updatedEvents).toBe(1)
    expect(result.removedEntityAliases).toBe(1)
    expect(result.normalizedFactEntityIds).toBe(1)
    expect(result.normalizedPrimaryEntityNames).toBe(1)
    expect(repairedEvent?.primary_entity_name).toBe("豪威集团")
    expect(detail?.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entityType: "stock",
        entityName: "豪威集团",
        fullCode: "sh603501",
      }),
      expect.objectContaining({
        entityType: "company",
        entityName: "豪威集团",
        fullCode: "sh603501",
      }),
    ]))
    expect(detail?.entities.some(entity => entity.entityType === "stock" && entity.entityName === "603501")).toBe(false)
    expect(detail?.facts[0]?.entityId).toBe("sh603501")
  })

  it("repairs explicit offshore ticker mentions into follow-up entities", async () => {
    const db = createTempDb("ticker-repair")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_ticker_repair",
      cluster_key: "cluster_ticker_repair",
      title: "加密货币板块集体走高 Strategy涨超12%",
      summary: "盘中异动",
      event_type: "market_move",
      event_subtype: "other",
      source_kind: "media_fast_feed",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/ticker-repair",
      primary_entity_name: "加密货币板块集体走高",
      importance: "medium",
      sentiment: null,
      directional_view: "positive",
      directional_confidence: 69,
      materiality_score: 74,
      tradability_score: 72,
      authority_score: 60,
      freshness_score: 83,
      surprise_score: 36,
      affected_markets_json: JSON.stringify(["A", "HK"]),
      impact_summary_json: JSON.stringify(["这类信息时效高，但持续性要结合成交额、板块扩散和后续公告确认。"]),
      degraded: 0,
      topic_tags_json: JSON.stringify([]),
      last_seen_at: now,
      status: "active",
    })

    const instance: any = db.getInstance()
    instance.prepare(`
      INSERT INTO raw_items (
        raw_id, source_id, source_item_id, title, url, mobile_url, published_at, fetched_at, fingerprint, payload_json, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "raw_ticker_repair",
      "cls-telegraph",
      "ticker-repair",
      "加密货币板块集体走高 Strategy涨超12%",
      "https://example.com/ticker-repair",
      null,
      now,
      now,
      "fingerprint_ticker_repair",
      JSON.stringify({
        id: "ticker-repair",
        title: "加密货币板块集体走高 Strategy涨超12%",
        extra: {
          raw: {
            brief: "加密货币板块周五集体走高，比特币涨超3%，报77195美元；以太坊涨超3.8%，报2433.5美元。截至发稿，Coinbase(COIN.US)涨超4.5%，Robinhood(HOOD.US)涨超5%，Strategy(MSTR.US)涨超12%，Bit Digital(BTBT.US)涨近4%，CleanSpark(CLSK.US)涨近4%。",
          },
        },
      }),
      "ready",
    )
    await table.addEvidence({
      event_id: "evt_ticker_repair",
      raw_id: "raw_ticker_repair",
      source_id: "cls-telegraph",
      source_item_id: "ticker-repair",
      title: "加密货币板块集体走高 Strategy涨超12%",
      summary: "盘中异动",
      canonical_url: "https://example.com/ticker-repair",
      published_at: now,
      fetched_at: now,
      source_priority: 0,
      authority_level: "media",
      parser_family: "cls",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })
    await table.upsertEntityLinks([{
      event_id: "evt_ticker_repair",
      entity_type: "company",
      entity_name: "加密货币板块集体走高",
      code: "",
      full_code: "",
      confidence: 0.65,
      resolver: "primary-entity-fallback",
    }])

    const result = await table.repairExplicitTickerEntityLinks({
      eventIds: ["evt_ticker_repair"],
    })
    const detail = await table.getEventDetail("evt_ticker_repair")

    expect(result.updatedEvents).toBe(1)
    expect(detail?.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entityType: "stock",
        entityName: "Strategy",
        code: "MSTR",
        fullCode: "us:mstr",
      }),
      expect.objectContaining({
        entityType: "stock",
        entityName: "Coinbase",
        code: "COIN",
        fullCode: "us:coin",
      }),
    ]))
    expect(detail?.entities.some(entity => entity.entityType === "company" && entity.entityName === "加密货币板块集体走高")).toBe(false)
  })

  it("repairs event-container primary entity names such as 法说会 into the underlying issuer", async () => {
    const db = createTempDb("primary-entity-container-repair")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_primary_entity_container_repair",
      cluster_key: "cluster_primary_entity_container_repair",
      title: "台积电法说会：AI需求极为强劲，供不应求将持续至至少2027年",
      summary: "魏哲家称，对2026年台积全年营收以美元计成长超过30%充满信心。",
      event_type: "industry",
      event_subtype: "industry_news",
      source_kind: "industry_news_feed",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/tsmc-briefing",
      primary_entity_name: "台积电法说会",
      importance: "medium",
      sentiment: null,
      directional_view: "positive",
      directional_confidence: 61,
      materiality_score: 72,
      tradability_score: 58,
      authority_score: 70,
      freshness_score: 76,
      surprise_score: 34,
      affected_markets_json: JSON.stringify(["A", "HK"]),
      impact_summary_json: JSON.stringify([]),
      degraded: 0,
      topic_tags_json: JSON.stringify(["ai-computing"]),
      last_seen_at: now,
      status: "active",
    })
    await table.upsertRawItem({
      raw_id: "raw_primary_entity_container_repair",
      source_id: "semi-semiconductor",
      source_item_id: "primary-entity-container-repair",
      title: "台积电法说会：AI需求极为强劲，供不应求将持续至至少2027年",
      url: "https://example.com/tsmc-briefing",
      mobile_url: null,
      published_at: now,
      fetched_at: now,
      fingerprint: "台积电法说会：AI需求极为强劲，供不应求将持续至至少2027年|primary-entity-container-repair",
      payload_json: JSON.stringify({
        url: "https://example.com/tsmc-briefing",
        title: "台积电法说会：AI需求极为强劲，供不应求将持续至至少2027年",
        pubDate: "2026-04-17",
        extra: {
          info: "魏哲家称，对2026年台积全年营收以美元计成长超过30%充满信心。",
        },
      }),
      status: "ready",
    })
    await table.addEvidence({
      event_id: "evt_primary_entity_container_repair",
      raw_id: "raw_primary_entity_container_repair",
      source_id: "semi-semiconductor",
      source_item_id: "primary-entity-container-repair",
      title: "台积电法说会：AI需求极为强劲，供不应求将持续至至少2027年",
      summary: "魏哲家称，对2026年台积全年营收以美元计成长超过30%充满信心。",
      canonical_url: "https://example.com/tsmc-briefing",
      published_at: now,
      fetched_at: now,
      source_priority: 0,
      authority_level: "association",
      parser_family: "industry_news",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })
    await table.upsertEntityLinks([{
      event_id: "evt_primary_entity_container_repair",
      entity_type: "company",
      entity_name: "台积电法说会",
      code: "",
      full_code: "",
      confidence: 0.65,
      resolver: "primary-entity-fallback",
    }])

    const result = await table.repairPrimaryEntityContainerNames({
      eventIds: ["evt_primary_entity_container_repair"],
    })
    const detail = await table.getEventDetail("evt_primary_entity_container_repair")

    expect(result.updatedEvents).toBe(1)
    expect(result.updatedPrimaryEntityNames).toBe(1)
    expect(detail?.primaryEntityName).toBe("台积电")
    expect(detail?.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entityType: "company",
        entityName: "台积电",
        resolver: "primary-entity-fallback",
      }),
    ]))
    expect(detail?.entities.some(entity => entity.entityType === "company" && entity.entityName === "台积电法说会")).toBe(false)
  })

  it("repairs nested HK tickers and broad market descriptor fallbacks out of follow-up entities", async () => {
    const db = createTempDb("nested-ticker-and-broad-descriptor-repair")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_nested_hk_repair",
      cluster_key: "cluster_nested_hk_repair",
      title: "广南(集团)(01203.HK)拟4月28日举行董事会会议审批第一季度业绩",
      summary: "港股公告摘要",
      event_type: "announcement",
      event_subtype: "earnings",
      source_kind: "media_analysis",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/nested-hk-repair",
      primary_entity_name: "集团",
      importance: "medium",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 52,
      materiality_score: 66,
      tradability_score: 54,
      authority_score: 48,
      freshness_score: 70,
      surprise_score: 30,
      affected_markets_json: JSON.stringify(["HK"]),
      impact_summary_json: JSON.stringify([]),
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })
    await table.upsertRawItem({
      raw_id: "raw_nested_hk_repair",
      source_id: "gelonghui",
      source_item_id: "nested-hk-repair",
      title: "广南(集团)(01203.HK)拟4月28日举行董事会会议审批第一季度业绩",
      url: "https://example.com/nested-hk-repair",
      mobile_url: null,
      published_at: now,
      fetched_at: now,
      fingerprint: "广南(集团)(01203.HK)拟4月28日举行董事会会议审批第一季度业绩|nested-hk-repair",
      payload_json: JSON.stringify({
        url: "https://example.com/nested-hk-repair",
        title: "广南(集团)(01203.HK)拟4月28日举行董事会会议审批第一季度业绩",
        id: "/news/nested-hk-repair",
        extra: {
          date: now,
          info: "港股公告摘要",
        },
      }),
      status: "ready",
    })
    await table.addEvidence({
      event_id: "evt_nested_hk_repair",
      raw_id: "raw_nested_hk_repair",
      source_id: "gelonghui",
      source_item_id: "nested-hk-repair",
      title: "广南(集团)(01203.HK)拟4月28日举行董事会会议审批第一季度业绩",
      summary: "港股公告摘要",
      canonical_url: "https://example.com/nested-hk-repair",
      published_at: now,
      fetched_at: now,
      source_priority: 0,
      authority_level: "media",
      parser_family: "news",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })
    await table.upsertEntityLinks([
      {
        event_id: "evt_nested_hk_repair",
        entity_type: "company",
        entity_name: "上港集团",
        code: "600018",
        full_code: "sh600018",
        confidence: 0.9,
        resolver: "primary-entity-name",
      },
      {
        event_id: "evt_nested_hk_repair",
        entity_type: "stock",
        entity_name: "上港集团",
        code: "600018",
        full_code: "sh600018",
        confidence: 0.9,
        resolver: "primary-entity-name",
      },
    ])

    await table.upsertEvent({
      event_id: "evt_broad_descriptor_repair",
      cluster_key: "cluster_broad_descriptor_repair",
      title: "数字货币市场走高",
      summary: "盘中异动",
      event_type: "market_move",
      event_subtype: "other",
      source_kind: "media_fast_feed",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/broad-descriptor-repair",
      primary_entity_name: "数字货币市场走高",
      importance: "medium",
      sentiment: null,
      directional_view: "positive",
      directional_confidence: 58,
      materiality_score: 55,
      tradability_score: 62,
      authority_score: 40,
      freshness_score: 74,
      surprise_score: 28,
      affected_markets_json: JSON.stringify(["A"]),
      impact_summary_json: JSON.stringify([]),
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })
    await table.upsertRawItem({
      raw_id: "raw_broad_descriptor_repair",
      source_id: "cls-telegraph",
      source_item_id: "broad-descriptor-repair",
      title: "数字货币市场走高",
      url: "https://example.com/broad-descriptor-repair",
      mobile_url: null,
      published_at: now,
      fetched_at: now,
      fingerprint: "数字货币市场走高|broad-descriptor-repair",
      payload_json: JSON.stringify({
        url: "https://example.com/broad-descriptor-repair",
        title: "数字货币市场走高",
        extra: {
          info: "盘中异动",
          raw: {
            brief: "市场走高，但未直接点名具体上市公司",
          },
        },
      }),
      status: "ready",
    })
    await table.addEvidence({
      event_id: "evt_broad_descriptor_repair",
      raw_id: "raw_broad_descriptor_repair",
      source_id: "cls-telegraph",
      source_item_id: "broad-descriptor-repair",
      title: "数字货币市场走高",
      summary: "盘中异动",
      canonical_url: "https://example.com/broad-descriptor-repair",
      published_at: now,
      fetched_at: now,
      source_priority: 0,
      authority_level: "media",
      parser_family: "cls",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })
    await table.upsertEntityLinks([{
      event_id: "evt_broad_descriptor_repair",
      entity_type: "company",
      entity_name: "数字货币市场走高",
      code: "",
      full_code: "",
      confidence: 0.65,
      resolver: "primary-entity-fallback",
    }])

    const result = await table.repairExplicitTickerEntityLinks()
    const nestedDetail = await table.getEventDetail("evt_nested_hk_repair")
    const broadDetail = await table.getEventDetail("evt_broad_descriptor_repair")

    expect(result.updatedEvents).toBeGreaterThanOrEqual(2)
    expect(nestedDetail?.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entityType: "stock",
        entityName: "广南(集团)",
        code: "01203",
        fullCode: "hk01203",
      }),
    ]))
    expect(nestedDetail?.entities.some(entity => entity.entityType === "stock" && entity.fullCode === "sh600018")).toBe(false)
    expect(broadDetail?.entities.some(entity => entity.entityType === "company" && entity.entityName === "数字货币市场走高")).toBe(false)
  })

  it("repairs exchange disclosure affected markets to the actual listing venue", async () => {
    const db = createTempDb("market-repair")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_market_repair",
      cluster_key: "cluster_market_repair",
      title: "春兰股份：600854_春兰股份_2025年_年度报告",
      summary: "年度报告",
      event_type: "announcement",
      event_subtype: "earnings",
      source_kind: "exchange_disclosure",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/market-repair",
      primary_entity_name: "春兰股份",
      importance: "high",
      sentiment: null,
      directional_view: "unknown",
      directional_confidence: 32,
      materiality_score: 82,
      tradability_score: 72,
      authority_score: 90,
      freshness_score: 86,
      surprise_score: 40,
      affected_markets_json: JSON.stringify(["A", "HK"]),
      impact_summary_json: JSON.stringify(["业绩公告对个股与板块定价敏感，等待具体数据进一步确认"]),
      degraded: 0,
      topic_tags_json: "[]",
      last_seen_at: now,
      status: "active",
    })
    await table.addEvidence({
      event_id: "evt_market_repair",
      raw_id: "raw_market_repair",
      source_id: "sse-latest",
      source_item_id: "market-repair",
      title: "春兰股份：600854_春兰股份_2025年_年度报告",
      summary: "年度报告",
      canonical_url: "https://example.com/market-repair",
      published_at: now,
      fetched_at: now,
      source_priority: 100,
      authority_level: "exchange",
      parser_family: "exchange_announcement",
      passthrough_payload_json: "{}",
      extraction_status: "ready",
      extraction_error: null,
      rank: 0,
    })
    await table.upsertEventSource({
      source_id: "sse-latest",
      source_kind: "exchange_disclosure",
      authority_level: "exchange",
      parser_family: "exchange_announcement",
      default_event_type: "announcement",
      default_event_subtype: null,
      asset_classes_json: JSON.stringify(["equity", "fund"]),
      markets_json: JSON.stringify(["A", "HK"]),
      profile_json: JSON.stringify({
        sourceKind: "exchange_disclosure",
        defaultEventType: "announcement",
        authorityLevel: "exchange",
        parserFamily: "exchange_announcement",
        assetClasses: ["equity", "fund"],
        markets: ["A", "HK"],
      }),
      updated_at: now,
    })

    const result = await table.repairExchangeDisclosureMarkets()
    const repairedEvent = await table.getEventById("evt_market_repair")
    const instance: any = db.getInstance()
    const repairedSource = instance.prepare(`
      SELECT markets_json
      FROM event_sources
      WHERE source_id = 'sse-latest'
    `).get() as { markets_json: string } | undefined

    expect(result.updatedEvents).toBe(1)
    expect(result.normalizedAffectedMarkets).toBe(1)
    expect(result.updatedSourceProfiles).toBe(1)
    expect(repairedEvent?.affected_markets_json).toBe(JSON.stringify(["A"]))
    expect(repairedSource?.markets_json).toBe(JSON.stringify(["A"]))
  })

  it("matches Chinese industry keyword queries against canonical topic tags", async () => {
    const db = createTempDb("topic-search")
    const table = new EventTable(db as any)
    await table.init()

    const now = Date.now()
    await table.upsertEvent({
      event_id: "evt_topic_medicine",
      cluster_key: "cluster_topic_medicine",
      title: "某政策跟踪",
      summary: "与医药字面无关的摘要",
      event_type: "industry",
      event_subtype: "industry_news",
      source_kind: "industry_news_feed",
      published_at: now,
      ingested_at: now,
      canonical_url: "https://example.com/topic-medicine",
      primary_entity_name: null,
      importance: "medium",
      sentiment: null,
      directional_view: "neutral",
      directional_confidence: 32,
      materiality_score: 55,
      tradability_score: 44,
      authority_score: 70,
      freshness_score: 60,
      surprise_score: 35,
      affected_markets_json: JSON.stringify(["A"]),
      impact_summary_json: JSON.stringify(["主题线索"]),
      degraded: 0,
      topic_tags_json: JSON.stringify(["medicine"]),
      last_seen_at: now,
      status: "active",
    })

    const results = await table.listEvents({
      limit: 20,
      q: "创新药",
      sortBy: "investment",
    })

    expect(results.some(item => item.eventId === "evt_topic_medicine")).toBe(true)
  })
})
