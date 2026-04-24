export type SchemaOwner = "news" | "investment-event" | "shared-source" | "ops"

export interface SqlAccessDeclaration {
  name: string
  owner: SchemaOwner
  tables: string[]
  decisionRefs: string[]
  crossOwnerReason?: string
}

export const SCHEMA_OWNER_BASELINE: Record<string, SchemaOwner> = {
  cache: "news",
  source_snapshots: "news",
  source_items: "news",
  raw_items: "investment-event",
  events: "investment-event",
  event_evidence: "investment-event",
  event_sources: "investment-event",
  event_facts: "investment-event",
  event_timeline: "investment-event",
  event_metrics: "ops",
  entity_links: "investment-event",
  watchlists: "investment-event",
  source_fetch_runs: "shared-source",
  event_projection: "investment-event",
  event_query_indexes: "investment-event",
  watchlist_event_matches: "investment-event",
  related_event_edges: "investment-event",
} as const

export function declareSqlAccess(input: SqlAccessDeclaration): SqlAccessDeclaration {
  if (!input.name.trim()) throw new Error("SQL access declaration requires a name")
  if (!input.tables.length) throw new Error(`SQL access ${input.name} must declare at least one table`)
  if (!input.decisionRefs.length) throw new Error(`SQL access ${input.name} must declare decisionRefs`)

  for (const table of input.tables) {
    const tableOwner = SCHEMA_OWNER_BASELINE[table]
    if (!tableOwner) throw new Error(`Unknown SQL table in ${input.name}: ${table}`)
    if (tableOwner !== input.owner && !input.crossOwnerReason) {
      throw new Error(`SQL access ${input.name} is cross-owner and must declare crossOwnerReason`)
    }
  }

  return input
}

export function assertSqlAccessDeclarations(declarations: readonly SqlAccessDeclaration[]) {
  for (const declaration of declarations) {
    declareSqlAccess(declaration)
  }
}
