import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { EventTable } from "#/database/events"

const cleanupPaths: string[] = []

afterEach(() => {
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
