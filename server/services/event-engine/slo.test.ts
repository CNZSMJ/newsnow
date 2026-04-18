import { describe, expect, it } from "vitest"
import { type EventBaseQualitySnapshot, evaluateEventBaseSLOs } from "#/services/event-engine/slo"

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

describe("event-base SLO evaluation", () => {
  it("marks automated gates as pass when the snapshot clears thresholds", () => {
    const result = evaluateEventBaseSLOs(createSnapshot())

    expect(result.targetsVersion).toBe("event-base-slo-v2")
    expect(result.summary.blockingFailures).toBe(0)
    expect(result.gates.find(gate => gate.key === "tradeCriticalInitialCanonicalLatencyP95Ms")?.status).toBe("pass")
  })

  it("marks the trade-critical automated gate as fail when the snapshot regresses below thresholds", () => {
    const result = evaluateEventBaseSLOs(createSnapshot({
      highValueStructuredCoveragePct: 70,
      highValueGenericFallbackSharePct: 12,
      tradeCriticalInitialCanonicalLatencyP95Ms: 600000,
    }))

    expect(result.summary.blockingFailures).toBe(3)
    expect(result.gates.find(gate => gate.key === "highValueStructuredCoveragePct")?.status).toBe("fail")
    expect(result.gates.find(gate => gate.key === "highValueGenericFallbackSharePct")?.status).toBe("fail")
    expect(result.gates.find(gate => gate.key === "tradeCriticalInitialCanonicalLatencyP95Ms")?.status).toBe("fail")
  })

  it("keeps non-automated tier gates visible without making them release blockers", () => {
    const result = evaluateEventBaseSLOs(createSnapshot({
      highValueNonIntradayInitialCanonicalLatencyP95Ms: 2_000_000,
      longFormHeavyParsingInitialCanonicalLatencyP95Ms: 4_000_000,
    }))

    expect(result.gates.find(gate => gate.key === "highValueNonIntradayInitialCanonicalLatencyP95Ms")).toMatchObject({
      automated: false,
      status: "fail",
    })
    expect(result.gates.find(gate => gate.key === "longFormHeavyParsingInitialCanonicalLatencyP95Ms")).toMatchObject({
      automated: false,
      status: "fail",
    })
    expect(result.summary.blockingFailures).toBe(0)
  })

  it("keeps gates pending when the snapshot lacks enough data", () => {
    const result = evaluateEventBaseSLOs(createSnapshot({
      highValueStructuredCoveragePct: null,
      highValueGenericFallbackSharePct: null,
      prioritySourceAvgIngestLatencyMs: null,
      prioritySourceIngestLatencyP95Ms: null,
      tradeCriticalInitialCanonicalLatencyP95Ms: null,
      highValueNonIntradayInitialCanonicalLatencyP95Ms: null,
      longFormHeavyParsingInitialCanonicalLatencyP95Ms: null,
    }))

    expect(result.summary.pending).toBe(5)
    expect(result.summary.blockingFailures).toBe(0)
  })
})
