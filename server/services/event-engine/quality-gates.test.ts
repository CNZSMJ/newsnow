import { describe, expect, it } from "vitest"
import { evaluateEventQualityGates } from "#/services/event-engine/quality-gates"
import type { EventBaseQualitySnapshot } from "#/services/event-engine/slo"

function createSnapshot(overrides?: Partial<EventBaseQualitySnapshot>): EventBaseQualitySnapshot {
  return {
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
      coarsePublicationClockEventCount: 10,
      backlogCatchupEventCount: 4,
      latencySampleCount: 90,
      avgIngestLatencyMs: 100000,
      p95IngestLatencyMs: 120000,
      initialCanonicalLatency: {
        instrumentation: "automated",
        latencySampleCount: 90,
        avgLatencyMs: 100000,
        p95LatencyMs: 120000,
      },
      fullSemanticEnrichmentLatency: {
        instrumentation: "not_instrumented",
        latencySampleCount: 0,
        avgLatencyMs: null,
        p95LatencyMs: null,
      },
    },
    latencyTiers: [],
    highValueSourceEventCount: 100,
    highValueStructuredEventCount: 91,
    highValueStructuredCoveragePct: 91,
    highValueDegradedEventCount: 0,
    highValueGenericFallbackEventCount: 3,
    highValueGenericFallbackSharePct: 3,
    highValueCoarsePublicationClockEventCount: 10,
    highValueBacklogCatchupEventCount: 4,
    prioritySourceAvgIngestLatencyMs: 100000,
    prioritySourceIngestLatencyP95Ms: 120000,
    tradeCriticalInitialCanonicalLatencyP95Ms: 120000,
    highValueNonIntradayInitialCanonicalLatencyP95Ms: 600000,
    longFormHeavyParsingInitialCanonicalLatencyP95Ms: 900000,
    ...overrides,
  }
}

describe("event quality gate evaluation", () => {
  it("blocks release when an automated blocking gate fails", () => {
    const result = evaluateEventQualityGates(createSnapshot({
      highValueStructuredCoveragePct: 84,
    }))

    expect(result.contractVersion).toBe("event-quality-gates-v2")
    expect(result.releaseStatus).toBe("blocked")
    expect(result.releaseBlocked).toBe(true)
    expect(result.blockingGateKeys).toContain("highValueStructuredCoveragePct")
  })

  it("keeps runtime non-automated tier gates visible while automated gates are ready", () => {
    const result = evaluateEventQualityGates(createSnapshot({
      highValueNonIntradayInitialCanonicalLatencyP95Ms: 2_000_000,
      longFormHeavyParsingInitialCanonicalLatencyP95Ms: 4_000_000,
    }))

    expect(result.releaseStatus).toBe("ready")
    expect(result.summary.automatedTotal).toBe(3)
    expect(result.summary.notAutomated).toBe(7)
    expect(result.summary.manualReviewRequired).toBe(7)
    expect(result.gates.find(gate => gate.key === "highValueNonIntradayInitialCanonicalLatencyP95Ms")).toMatchObject({
      automated: false,
      status: "fail",
      source: "runtime_snapshot",
    })
    expect(result.gates.find(gate => gate.key === "longFormHeavyParsingInitialCanonicalLatencyP95Ms")).toMatchObject({
      automated: false,
      status: "fail",
      source: "runtime_snapshot",
    })
  })
})
