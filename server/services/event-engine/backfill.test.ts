import { describe, expect, it, vi } from "vitest"

vi.mock("#/getters", () => ({
  getters: {},
}))

describe("event-engine backfill window", () => {
  it("clamps the requested window to the supported max", async () => {
    const { resolveBackfillSince } = await import("#/services/event-engine/scheduler")
    const currentHours = 24 * 365
    const res = resolveBackfillSince(currentHours + 500)

    expect(res.hours).toBe(currentHours)
    expect(Date.now() - res.since).toBeGreaterThanOrEqual((currentHours - 1) * 60 * 60 * 1000)
  })

  it("falls back to the default max window for invalid input", async () => {
    const { resolveBackfillSince } = await import("#/services/event-engine/scheduler")
    expect(resolveBackfillSince(0).hours).toBe(24 * 365)
    expect(resolveBackfillSince(-1).hours).toBe(24 * 365)
    expect(resolveBackfillSince(Number.NaN).hours).toBe(24 * 365)
  })
})
