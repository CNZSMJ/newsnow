import { describe, expect, it } from "vitest"
import { buildSurfaceQueryPlanStatements } from "./sql-plan"
import { assertSqlAccessDeclarations } from "#/database/sql-ownership"

describe("surface query plan statements", () => {
  it("declares owner and decision refs for every plan", () => {
    const plans = buildSurfaceQueryPlanStatements()

    expect(plans.length).toBeGreaterThan(0)
    for (const plan of plans) {
      expect(plan.owner).toMatch(/^(news|investment-event|shared-source|ops)$/)
      expect(plan.decisionRefs.length).toBeGreaterThan(0)
      expect(plan.tables.length).toBeGreaterThan(0)
    }
    expect(() => assertSqlAccessDeclarations(plans)).not.toThrow()
  })

  it("uses parameter placeholders for benchmark inputs", () => {
    const plans = buildSurfaceQueryPlanStatements()

    expect(plans.some(plan => plan.name === "news_cache_entire_batch")).toBe(true)
    for (const plan of plans) {
      expect(plan.sql).not.toContain("${")
      expect(plan.sql).not.toContain("id = '")
    }
  })

  it("covers the current hot-path owner boundaries", () => {
    const plans = buildSurfaceQueryPlanStatements()
    const names = plans.map(plan => plan.name)

    expect(names).toEqual(expect.arrayContaining([
      "news_cache_single_source",
      "news_cache_entire_batch",
      "investment_latest_events",
      "investment_search_events",
      "investment_entity_lookup",
      "investment_event_detail_projection",
      "investment_related_events_lookup",
      "investment_watchlist_projection_scan",
      "shared_source_fetch_runs_latest",
    ]))
    for (const plan of plans.filter(plan => plan.name.startsWith("investment_"))) {
      expect(plan.tables).not.toContain("events")
      expect(plan.tables).not.toContain("entity_links")
      expect(plan.tables).toEqual(expect.arrayContaining(["event_projection"]))
    }
  })
})
