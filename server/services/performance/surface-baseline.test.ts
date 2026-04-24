import { describe, expect, it } from "vitest"
import {
  type SurfaceBenchmarkSample,
  buildEventDetailFanoutBreakdown,
  buildWorkerStateComparison,
  summarizeSurfaceSamples,
  validateSurfaceCoverage,
} from "./surface-baseline"

function sample(input: Partial<SurfaceBenchmarkSample> & Pick<SurfaceBenchmarkSample, "surface" | "latencyMs">): SurfaceBenchmarkSample {
  return {
    name: input.name ?? `${input.surface}-sample`,
    surface: input.surface,
    latencyMs: input.latencyMs,
    ok: input.ok ?? true,
    status: input.status ?? 200,
    workerState: input.workerState ?? "inactive",
    measuredAt: input.measuredAt ?? 1000,
  }
}

describe("surface baseline summarization", () => {
  it("summarizes latency per surface with p50 and p95", () => {
    const summary = summarizeSurfaceSamples([
      sample({ surface: "news_user", latencyMs: 10 }),
      sample({ surface: "news_user", latencyMs: 20 }),
      sample({ surface: "news_user", latencyMs: 30 }),
      sample({ surface: "news_user", latencyMs: 40 }),
      sample({ surface: "news_user", latencyMs: 50 }),
      sample({ surface: "investment_agent", latencyMs: 100, ok: false, status: 500 }),
    ])

    expect(summary.news_user).toMatchObject({
      count: 5,
      successCount: 5,
      failureCount: 0,
      p50Ms: 30,
      p95Ms: 50,
    })
    expect(summary.investment_agent).toMatchObject({
      count: 1,
      successCount: 0,
      failureCount: 1,
    })
  })

  it("validates coverage for the four required surfaces", () => {
    const covered = validateSurfaceCoverage([
      sample({ surface: "news_user", latencyMs: 10 }),
      sample({ surface: "news_agent", latencyMs: 12 }),
      sample({ surface: "investment_user", latencyMs: 20 }),
      sample({ surface: "investment_agent", latencyMs: 30 }),
    ])

    expect(covered.ok).toBe(true)
    expect(covered.missingSurfaces).toEqual([])

    const missing = validateSurfaceCoverage([
      sample({ surface: "news_user", latencyMs: 10 }),
      sample({ surface: "investment_user", latencyMs: 20 }),
    ])

    expect(missing.ok).toBe(false)
    expect(missing.missingSurfaces).toEqual(["news_agent", "investment_agent"])
  })

  it("groups samples by observed worker state", () => {
    const comparison = buildWorkerStateComparison([
      sample({ surface: "investment_user", latencyMs: 30, workerState: "active" }),
      sample({ surface: "investment_user", latencyMs: 10, workerState: "inactive" }),
      sample({ surface: "news_user", latencyMs: 5, workerState: "unknown" }),
    ])

    expect(comparison.active?.count).toBe(1)
    expect(comparison.inactive?.avgMs).toBe(10)
    expect(comparison.unknown?.surfaces).toEqual(["news_user"])
  })

  it("builds event detail fan-out breakdown", () => {
    const breakdown = buildEventDetailFanoutBreakdown({
      eventId: "event_1",
      httpDetailMs: 100,
      mainDetailQueryMs: 20,
      relatedEventsMs: 60,
      relatedQueryCount: 4,
      relatedScanLimit: 120,
    })

    expect(breakdown.estimatedAdapterAndProjectionMs).toBe(20)
    expect(breakdown.relatedQueryCount).toBe(4)
  })
})
