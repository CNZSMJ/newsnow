import type { SchemaOwner } from "#/database/sql-ownership"

export interface SurfaceQueryPlanStatement {
  name: string
  surface: "news_user" | "news_agent" | "investment_user" | "investment_agent" | "ops"
  owner: SchemaOwner
  tables: string[]
  decisionRefs: string[]
  sql: string
  params: Array<string | number>
}

export function buildSurfaceQueryPlanStatements(): SurfaceQueryPlanStatement[] {
  return [
    {
      name: "news_cache_single_source",
      surface: "news_user",
      owner: "news",
      tables: ["cache"],
      decisionRefs: ["PD-4", "TD-2", "TD-13"],
      sql: "SELECT id, data, updated FROM cache WHERE id = ?",
      params: ["wallstreetcn-quick"],
    },
    {
      name: "news_cache_entire_batch",
      surface: "news_user",
      owner: "news",
      tables: ["cache"],
      decisionRefs: ["PD-4", "TD-9", "TD-10", "TD-13"],
      sql: "SELECT id, data, updated FROM cache WHERE id IN (?, ?, ?)",
      params: ["wallstreetcn-quick", "cls-telegraph", "weibo"],
    },
    {
      name: "investment_latest_events",
      surface: "investment_user",
      owner: "investment-event",
      tables: ["event_projection", "event_query_indexes"],
      decisionRefs: ["PD-4", "TD-3", "TD-10", "TD-11"],
      sql: `
        SELECT p.event_id
        FROM event_projection p
        INNER JOIN event_query_indexes i
          ON i.event_id = p.event_id
         AND i.index_name = ?
         AND i.index_value = ?
        WHERE p.repair_status = 'ok'
        ORDER BY ((p.materiality_score * 0.4) + (p.tradability_score * 0.35) + (p.authority_score * 0.25)) DESC,
                 COALESCE(p.latest_lifecycle_at, p.published_at, p.ingested_at, 0) DESC
        LIMIT ?
      `,
      params: ["latest", "all", 20],
    },
    {
      name: "investment_search_events",
      surface: "investment_user",
      owner: "investment-event",
      tables: ["event_projection"],
      decisionRefs: ["PD-4", "TD-3", "TD-10", "TD-11"],
      sql: `
        SELECT p.event_id
        FROM event_projection p
        WHERE p.repair_status = 'ok'
          AND p.search_text LIKE ?
        ORDER BY ((p.materiality_score * 0.4) + (p.tradability_score * 0.35) + (p.authority_score * 0.25)) DESC,
                 COALESCE(p.latest_lifecycle_at, p.published_at, p.ingested_at, 0) DESC
        LIMIT ?
      `,
      params: ["%政策%", 20],
    },
    {
      name: "investment_entity_lookup",
      surface: "investment_user",
      owner: "investment-event",
      tables: ["event_projection", "event_query_indexes"],
      decisionRefs: ["PD-4", "TD-3", "TD-10", "TD-11"],
      sql: `
        SELECT p.event_id
        FROM event_query_indexes i
        INNER JOIN event_projection p
          ON p.event_id = i.event_id
        WHERE i.index_name = ?
          AND i.index_value = ?
          AND p.repair_status = 'ok'
        ORDER BY i.sort_time DESC, i.rank_score DESC
        LIMIT ?
      `,
      params: ["entity", "贵州茅台", 20],
    },
    {
      name: "investment_event_detail_projection",
      surface: "investment_user",
      owner: "investment-event",
      tables: ["event_projection"],
      decisionRefs: ["PD-4", "TD-3", "TD-9", "TD-11"],
      sql: `
        SELECT p.event_id, p.detail_json
        FROM event_projection p
        WHERE p.event_id = ?
          AND p.repair_status = 'ok'
        LIMIT ?
      `,
      params: ["evt_sample", 1],
    },
    {
      name: "investment_related_events_lookup",
      surface: "investment_user",
      owner: "investment-event",
      tables: ["event_projection", "event_query_indexes"],
      decisionRefs: ["PD-4", "TD-3", "TD-9", "TD-11"],
      sql: `
        SELECT p.event_id
        FROM event_query_indexes i
        INNER JOIN event_projection p
          ON p.event_id = i.event_id
        WHERE i.index_name = ?
          AND i.index_value = ?
          AND p.repair_status = 'ok'
        ORDER BY i.sort_time DESC, i.rank_score DESC
        LIMIT ?
      `,
      params: ["related", "evt_sample", 6],
    },
    {
      name: "investment_watchlist_index_seed_scan",
      surface: "investment_user",
      owner: "investment-event",
      tables: ["event_projection", "event_query_indexes"],
      decisionRefs: ["PD-4", "TD-3", "TD-9", "TD-11"],
      sql: `
        SELECT p.event_id, p.brief_json, p.event_type, p.event_subtype, p.source_ids_json
        FROM event_projection p
        INNER JOIN event_query_indexes i
          ON i.event_id = p.event_id
         AND i.index_name = ?
         AND i.index_value = ?
        WHERE p.repair_status = 'ok'
          AND p.topic_tags_json LIKE ?
        ORDER BY ((p.materiality_score * 0.4) + (p.tradability_score * 0.35) + (p.authority_score * 0.25)) DESC,
                 COALESCE(p.latest_lifecycle_at, p.published_at, p.ingested_at, 0) DESC
        LIMIT ?
      `,
      params: ["entity", "贵州茅台", "%\"ai-computing\"%", 120],
    },
    {
      name: "shared_source_fetch_runs_latest",
      surface: "ops",
      owner: "shared-source",
      tables: ["source_fetch_runs"],
      decisionRefs: ["TD-12", "TD-14"],
      sql: `
        SELECT source_id, MAX(fetched_at) AS fetched_at
        FROM source_fetch_runs
        WHERE source_id IN (?, ?, ?)
        GROUP BY source_id
      `,
      params: ["wallstreetcn-quick", "cls-telegraph", "sse-latest"],
    },
  ]
}
