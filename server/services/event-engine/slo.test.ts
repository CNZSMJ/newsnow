import { describe, expect, it } from "vitest"
import { evaluateEventBaseSLOs } from "#/services/event-engine/slo"

describe("event-base SLO evaluation", () => {
  it("marks automated gates as pass when the snapshot clears thresholds", () => {
    const result = evaluateEventBaseSLOs({
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

    expect(result.summary.blockingFailures).toBe(0)
    expect(result.gates.map(gate => gate.status)).toEqual(["pass", "pass", "pass"])
  })

  it("marks automated gates as fail when the snapshot regresses below thresholds", () => {
    const result = evaluateEventBaseSLOs({
      generatedAt: Date.UTC(2026, 3, 17, 0, 0, 0),
      windowStartAt: Date.UTC(2026, 3, 16, 0, 0, 0),
      highValue: {
        sourceKinds: [],
        totalEventCount: 100,
        structuredEventCount: 70,
        degradedEventCount: 10,
        genericFallbackEventCount: 12,
        structuredCoveragePct: 70,
        genericFallbackSharePct: 12,
        latencySampleCount: 100,
        avgIngestLatencyMs: 400000,
        p95IngestLatencyMs: 600000,
      },
      highValueSourceEventCount: 100,
      highValueStructuredEventCount: 70,
      highValueStructuredCoveragePct: 70,
      highValueDegradedEventCount: 10,
      highValueGenericFallbackEventCount: 12,
      highValueGenericFallbackSharePct: 12,
      prioritySourceAvgIngestLatencyMs: 400000,
      prioritySourceIngestLatencyP95Ms: 600000,
    })

    expect(result.summary.blockingFailures).toBe(3)
    expect(result.gates.map(gate => gate.status)).toEqual(["fail", "fail", "fail"])
  })

  it("keeps gates pending when the snapshot lacks enough data", () => {
    const result = evaluateEventBaseSLOs({
      generatedAt: Date.UTC(2026, 3, 17, 0, 0, 0),
      windowStartAt: Date.UTC(2026, 3, 16, 0, 0, 0),
      highValue: {
        sourceKinds: [],
        totalEventCount: 0,
        structuredEventCount: 0,
        degradedEventCount: 0,
        genericFallbackEventCount: 0,
        structuredCoveragePct: null,
        genericFallbackSharePct: null,
        latencySampleCount: 0,
        avgIngestLatencyMs: null,
        p95IngestLatencyMs: null,
      },
      highValueSourceEventCount: 0,
      highValueStructuredEventCount: 0,
      highValueStructuredCoveragePct: null,
      highValueDegradedEventCount: 0,
      highValueGenericFallbackEventCount: 0,
      highValueGenericFallbackSharePct: null,
      prioritySourceAvgIngestLatencyMs: null,
      prioritySourceIngestLatencyP95Ms: null,
    })

    expect(result.summary.pending).toBe(3)
    expect(result.summary.blockingFailures).toBe(0)
  })
})
