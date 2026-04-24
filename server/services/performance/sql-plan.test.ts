import { describe, expect, it } from "vitest"
import { buildSurfaceQueryPlanStatements } from "./sql-plan"

describe("surface query plan statements", () => {
  it("declares owner and decision refs for every plan", () => {
    const plans = buildSurfaceQueryPlanStatements()

    expect(plans.length).toBeGreaterThan(0)
    for (const plan of plans) {
      expect(plan.owner).toMatch(/^(news|investment-event|shared-source|ops)$/)
      expect(plan.decisionRefs.length).toBeGreaterThan(0)
      expect(plan.tables.length).toBeGreaterThan(0)
    }
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
      "shared_source_fetch_runs_latest",
    ]))
  })
})
