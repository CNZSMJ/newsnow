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
      tables: ["events"],
      decisionRefs: ["PD-4", "TD-3"],
      sql: `
        SELECT event_id
        FROM events
        WHERE status = 'active'
        ORDER BY COALESCE(published_at, ingested_at) DESC, ingested_at DESC
        LIMIT ?
      `,
      params: [20],
    },
    {
      name: "investment_search_events",
      surface: "investment_user",
      owner: "investment-event",
      tables: ["events"],
      decisionRefs: ["PD-4", "TD-3"],
      sql: `
        SELECT event_id
        FROM events
        WHERE status = 'active'
          AND (title LIKE ? OR summary LIKE ?)
        ORDER BY COALESCE(published_at, ingested_at) DESC, ingested_at DESC
        LIMIT ?
      `,
      params: ["%政策%", "%政策%", 20],
    },
    {
      name: "investment_entity_lookup",
      surface: "investment_user",
      owner: "investment-event",
      tables: ["entity_links"],
      decisionRefs: ["PD-4", "TD-3"],
      sql: `
        SELECT event_id
        FROM entity_links
        WHERE entity_name = ?
           OR code = ?
           OR full_code = ?
        LIMIT ?
      `,
      params: ["贵州茅台", "600519", "sh600519", 20],
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
