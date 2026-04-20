import { describe, expect, it } from "vitest"
import {
  getDeferredPublishedTimestampFallback,
  getObservedEventTimestampFallback,
  getPrimaryEventTimestamp,
  getPrimaryEventTimestampLabel,
} from "./investment-event-time"

describe("investment event time helpers", () => {
  it("prefers observed time while a deferred disclosure is still in the future", () => {
    const now = Date.UTC(2026, 3, 20, 1, 45, 0)
    const latestLifecycleAt = Date.UTC(2026, 3, 19, 16, 51, 0)
    const publishedAt = Date.UTC(2026, 3, 20, 8, 0, 0)

    expect(getPrimaryEventTimestamp({ publishedAt, latestLifecycleAt }, now)).toBe(latestLifecycleAt)
    expect(getPrimaryEventTimestampLabel({ publishedAt, latestLifecycleAt }, now)).toBe("识别时间")
    expect(getDeferredPublishedTimestampFallback({ publishedAt, latestLifecycleAt }, now)).toBe(publishedAt)
    expect(getObservedEventTimestampFallback({ publishedAt, latestLifecycleAt }, now)).toBeUndefined()
  })

  it("switches back to published time after the deferred disclosure is live", () => {
    const latestLifecycleAt = Date.UTC(2026, 3, 19, 16, 51, 0)
    const publishedAt = Date.UTC(2026, 3, 20, 8, 0, 0)
    const now = publishedAt + 60_000

    expect(getPrimaryEventTimestamp({ publishedAt, latestLifecycleAt }, now)).toBe(publishedAt)
    expect(getPrimaryEventTimestampLabel({ publishedAt, latestLifecycleAt }, now)).toBe("发布时间")
    expect(getObservedEventTimestampFallback({ publishedAt, latestLifecycleAt }, now)).toBe(latestLifecycleAt)
    expect(getDeferredPublishedTimestampFallback({ publishedAt, latestLifecycleAt }, now)).toBeUndefined()
  })

  it("uses first-seen time for media fast market moves without a published timestamp", () => {
    const ingestedAt = Date.UTC(2026, 3, 19, 13, 32, 0)
    const latestLifecycleAt = Date.UTC(2026, 3, 20, 1, 40, 0)

    expect(getPrimaryEventTimestamp({
      eventType: "market_move",
      sourceKind: "media_fast_feed",
      ingestedAt,
      latestLifecycleAt,
    })).toBe(ingestedAt)
    expect(getPrimaryEventTimestampLabel({
      eventType: "market_move",
      sourceKind: "media_fast_feed",
      ingestedAt,
      latestLifecycleAt,
    })).toBe("识别时间")
  })

  it("keeps lifecycle refresh time for other events without a published timestamp", () => {
    const ingestedAt = Date.UTC(2026, 3, 19, 13, 32, 0)
    const latestLifecycleAt = Date.UTC(2026, 3, 20, 1, 40, 0)

    expect(getPrimaryEventTimestamp({
      eventType: "news",
      sourceKind: "media_fast_feed",
      ingestedAt,
      latestLifecycleAt,
    })).toBe(latestLifecycleAt)
    expect(getPrimaryEventTimestampLabel({
      eventType: "news",
      sourceKind: "media_fast_feed",
      ingestedAt,
      latestLifecycleAt,
    })).toBe("识别时间")
  })
})
