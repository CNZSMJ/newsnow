import { describe, expect, it } from "vitest"
import { evaluateEventQualityGates } from "#/services/event-engine/quality-gates"

describe("event quality gate evaluation", () => {
  it("blocks release when an automated blocking gate fails", () => {
    const result = evaluateEventQualityGates({
      generatedAt: Date.UTC(2026, 3, 17, 0, 0, 0),
      windowStartAt: Date.UTC(2026, 3, 16, 0, 0, 0),
      highValue: {
        sourceKinds: [],
        totalEventCount: 100,
        structuredEventCount: 84,
        degradedEventCount: 0,
        genericFallbackEventCount: 3,
        structuredCoveragePct: 84,
        genericFallbackSharePct: 3,
        latencySampleCount: 100,
        avgIngestLatencyMs: 120000,
        p95IngestLatencyMs: 120000,
      },
      highValueSourceEventCount: 100,
      highValueStructuredEventCount: 84,
      highValueStructuredCoveragePct: 84,
      highValueDegradedEventCount: 0,
      highValueGenericFallbackEventCount: 3,
      highValueGenericFallbackSharePct: 3,
      prioritySourceAvgIngestLatencyMs: 120000,
      prioritySourceIngestLatencyP95Ms: 120000,
    })

    expect(result.releaseStatus).toBe("blocked")
    expect(result.releaseBlocked).toBe(true)
    expect(result.blockingGateKeys).toContain("highValueStructuredCoveragePct")
  })

  it("keeps manual and replay gates visible even when automated gates are ready", () => {
    const result = evaluateEventQualityGates({
      generatedAt: Date.UTC(2026, 3, 17, 0, 0, 0),
      windowStartAt: Date.UTC(2026, 3, 16, 0, 0, 0),
      highValue: {
        sourceKinds: [],
        totalEventCount: 100,
        structuredEventCount: 91,
        degradedEventCount: 0,
        genericFallbackEventCount: 3,
        structuredCoveragePct: 91,
        genericFallbackSharePct: 3,
        latencySampleCount: 100,
        avgIngestLatencyMs: 100000,
        p95IngestLatencyMs: 120000,
      },
      highValueSourceEventCount: 100,
      highValueStructuredEventCount: 91,
      highValueStructuredCoveragePct: 91,
      highValueDegradedEventCount: 0,
      highValueGenericFallbackEventCount: 3,
      highValueGenericFallbackSharePct: 3,
      prioritySourceAvgIngestLatencyMs: 100000,
      prioritySourceIngestLatencyP95Ms: 120000,
    })

    expect(result.releaseStatus).toBe("ready")
    expect(result.summary.manualReviewRequired).toBe(5)
    expect(result.gates.filter(gate => gate.status === "not_automated")).toHaveLength(5)
    expect(result.enforcement.command).toBe("pnpm events:check-quality")
  })
})
