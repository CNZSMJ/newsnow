import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RawItemRow } from "#/types"
import { createChinapvPolicyFixture } from "#/services/event-engine/fixtures"
import { EVENT_ENGINE_METRICS, getEventEngineMetricsSnapshot, resetEventEngineMetrics } from "#/services/event-engine/metrics"

const mockGetEventTable = vi.fn()

vi.mock("#/database/events", () => ({
  getEventTable: mockGetEventTable,
}))

describe("event-engine shadow comparison", () => {
  beforeEach(() => {
    mockGetEventTable.mockReset()
    resetEventEngineMetrics()
  })

  it("compares legacy and current classifications and records shadow metrics", async () => {
    const rawItem = createChinapvPolicyFixture()
    const incrementMetric = vi.fn()

    mockGetEventTable.mockResolvedValue({
      listRawItems: vi.fn(async () => [rawItem] satisfies RawItemRow[]),
      getRawItemsByIds: vi.fn(async () => [] satisfies RawItemRow[]),
      incrementMetric,
    })

    const { compareEventShadow } = await import("#/services/event-engine/shadow")
    const res = await compareEventShadow({
      sourceIds: ["chinapv-policy"],
      limit: 10,
    })

    expect(res.compared).toBe(1)
    expect(res.changed).toBe(1)
    expect(res.typeChanges).toEqual({
      "industry->policy": 1,
    })
    expect(res.subtypeChanges).toEqual({
      "other->industrial_policy": 1,
    })
    expect(incrementMetric).toHaveBeenCalledWith(
      EVENT_ENGINE_METRICS.shadowComparisons,
      expect.objectContaining({
        mode: "shadow",
        source_count: "1",
      }),
    )
    expect(incrementMetric).toHaveBeenCalledWith(
      EVENT_ENGINE_METRICS.shadowDiffs,
      expect.objectContaining({
        mode: "shadow",
        source_count: "1",
      }),
      1,
    )

    const snapshot = getEventEngineMetricsSnapshot()
    expect(snapshot.totals[EVENT_ENGINE_METRICS.shadowComparisons]).toBe(1)
    expect(snapshot.totals[EVENT_ENGINE_METRICS.shadowDiffs]).toBe(1)
  })
})
