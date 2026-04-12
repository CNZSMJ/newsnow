import { describe, expect, it } from "vitest"
import type { EventRecord } from "@shared/types"
import { sortWatchlistEvents } from "#/database/watchlists"

function makeEvent(overrides: Partial<EventRecord>): EventRecord {
  return {
    eventId: overrides.eventId ?? "evt_default",
    title: overrides.title ?? "default",
    eventType: overrides.eventType ?? "news",
    eventSubType: overrides.eventSubType ?? "other",
    ingestedAt: overrides.ingestedAt ?? 1000,
    importance: overrides.importance ?? "medium",
    affectedMarkets: overrides.affectedMarkets ?? [],
    topicTags: overrides.topicTags ?? [],
    evidenceCount: overrides.evidenceCount ?? 1,
    sourceIds: overrides.sourceIds ?? ["cls-telegraph"],
    ...overrides,
  }
}

describe("sortWatchlistEvents", () => {
  it("prefers investment score by default", () => {
    const lowFreshButHighSignal = makeEvent({
      eventId: "evt_signal",
      title: "signal",
      latestLifecycleState: "confirmed",
      latestLifecycleAt: 2_000,
      materialityScore: 88,
      tradabilityScore: 80,
      authorityScore: 90,
      freshnessScore: 20,
      directionalView: "positive",
      directionalConfidence: 80,
    })
    const veryFreshButWeakSignal = makeEvent({
      eventId: "evt_fresh",
      title: "fresh",
      latestLifecycleState: "detected",
      latestLifecycleAt: 5_000,
      materialityScore: 30,
      tradabilityScore: 20,
      authorityScore: 40,
      freshnessScore: 90,
      directionalView: "unknown",
      directionalConfidence: 0,
    })

    const sorted = sortWatchlistEvents([veryFreshButWeakSignal, lowFreshButHighSignal], "investment")
    expect(sorted[0]?.eventId).toBe("evt_signal")
  })

  it("prefers recency when sortBy is latest", () => {
    const olderHigherSignal = makeEvent({
      eventId: "evt_old",
      title: "old",
      latestLifecycleState: "confirmed",
      latestLifecycleAt: 1_000,
      materialityScore: 95,
      tradabilityScore: 90,
      authorityScore: 95,
    })
    const newerLowerSignal = makeEvent({
      eventId: "evt_new",
      title: "new",
      latestLifecycleState: "detected",
      latestLifecycleAt: 10_000,
      materialityScore: 20,
      tradabilityScore: 15,
      authorityScore: 30,
    })

    const sorted = sortWatchlistEvents([olderHigherSignal, newerLowerSignal], "latest")
    expect(sorted[0]?.eventId).toBe("evt_new")
  })
})
