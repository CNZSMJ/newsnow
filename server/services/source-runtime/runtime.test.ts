import { describe, expect, it } from "vitest"
import {
  type NeutralRefreshIntent,
  SharedSourceRuntime,
} from "./runtime"

function intent(input: Partial<NeutralRefreshIntent> & Pick<NeutralRefreshIntent, "businessLine" | "sourceId" | "priorityClass" | "reason">): NeutralRefreshIntent {
  return {
    requestedAt: 1000,
    fallbackPolicy: "serve_stale",
    ...input,
  }
}

describe("sharedSourceRuntime", () => {
  it("orders refresh intents by neutral priority class and queue age", () => {
    const runtime = new SharedSourceRuntime({ maxConcurrency: 10 })
    runtime.submitRefreshIntent(intent({
      businessLine: "news",
      sourceId: "routine-source",
      priorityClass: "routine_fetch",
      reason: "scheduled",
      requestedAt: 3000,
    }))
    runtime.submitRefreshIntent(intent({
      businessLine: "investment-event",
      sourceId: "force-source",
      priorityClass: "force_refresh",
      reason: "operator",
      requestedAt: 2000,
    }))
    runtime.submitRefreshIntent(intent({
      businessLine: "news",
      sourceId: "backfill-source",
      priorityClass: "backfill_catch_up",
      reason: "catch-up",
      requestedAt: 4000,
    }))
    runtime.submitRefreshIntent(intent({
      businessLine: "investment-event",
      sourceId: "older-force-source",
      priorityClass: "force_refresh",
      reason: "operator",
      requestedAt: 1000,
    }))

    expect(runtime.takeNextBatch().map(item => item.sourceId)).toEqual([
      "backfill-source",
      "older-force-source",
      "force-source",
      "routine-source",
    ])
  })

  it("dedupes queued and running refresh intents", () => {
    const runtime = new SharedSourceRuntime({ maxConcurrency: 1 })
    const first = runtime.submitRefreshIntent(intent({
      businessLine: "news",
      sourceId: "wallstreetcn-quick",
      priorityClass: "force_refresh",
      reason: "manual",
      dedupeKey: "news:wallstreetcn-quick",
    }))
    const duplicateQueued = runtime.submitRefreshIntent(intent({
      businessLine: "news",
      sourceId: "wallstreetcn-quick",
      priorityClass: "force_refresh",
      reason: "manual",
      dedupeKey: "news:wallstreetcn-quick",
    }))

    expect(first.accepted).toBe(true)
    expect(duplicateQueued.accepted).toBe(false)
    expect(runtime.takeNextBatch()).toHaveLength(1)

    const duplicateRunning = runtime.submitRefreshIntent(intent({
      businessLine: "news",
      sourceId: "wallstreetcn-quick",
      priorityClass: "force_refresh",
      reason: "manual",
      dedupeKey: "news:wallstreetcn-quick",
    }))
    expect(duplicateRunning.accepted).toBe(false)
  })

  it("dedupes the same physical source across business lines and priorities", () => {
    const runtime = new SharedSourceRuntime({ maxConcurrency: 4 })
    const first = runtime.submitRefreshIntent(intent({
      businessLine: "news",
      sourceId: "shared-source",
      priorityClass: "routine_fetch",
      reason: "scheduled",
    }))
    const duplicate = runtime.submitRefreshIntent(intent({
      businessLine: "investment-event",
      sourceId: "shared-source",
      priorityClass: "force_refresh",
      reason: "event catch-up",
    }))

    expect(first.accepted).toBe(true)
    expect(first.dedupeKey).toBe("shared-source")
    expect(duplicate.accepted).toBe(false)
    expect(duplicate.reason).toBe("duplicate")
    expect(runtime.getQueueDepth()).toBe(1)
  })

  it("can drain one business line without consuming another line's intents", () => {
    const runtime = new SharedSourceRuntime({ maxConcurrency: 4 })
    runtime.submitRefreshIntent(intent({
      businessLine: "news",
      sourceId: "wallstreetcn-quick",
      priorityClass: "routine_fetch",
      reason: "news stale",
    }))
    runtime.submitRefreshIntent(intent({
      businessLine: "investment-event",
      sourceId: "sse-latest",
      priorityClass: "force_refresh",
      reason: "event catch-up",
    }))

    expect(runtime.takeNextBatch(2000, { businessLine: "news" }).map(item => item.sourceId)).toEqual([
      "wallstreetcn-quick",
    ])
    runtime.recordFetchSuccess({
      sourceId: "wallstreetcn-quick",
      fetchedAt: 2500,
      itemCount: 3,
    })

    expect(runtime.takeNextBatch(3000).map(item => item.sourceId)).toEqual(["sse-latest"])
  })

  it("respects concurrency and records source fetch state", () => {
    const runtime = new SharedSourceRuntime({ maxConcurrency: 1 })
    runtime.submitRefreshIntent(intent({
      businessLine: "news",
      sourceId: "source-a",
      priorityClass: "routine_fetch",
      reason: "scheduled",
    }))
    runtime.submitRefreshIntent(intent({
      businessLine: "investment-event",
      sourceId: "source-b",
      priorityClass: "routine_fetch",
      reason: "scheduled",
    }))

    const firstBatch = runtime.takeNextBatch()
    expect(firstBatch).toHaveLength(1)
    expect(runtime.getSourceFetchState("source-a").status).toBe("refreshing")
    expect(runtime.takeNextBatch()).toEqual([])

    runtime.recordFetchSuccess({
      sourceId: "source-a",
      fetchedAt: 2000,
      itemCount: 12,
    })
    expect(runtime.getSourceFetchState("source-a")).toMatchObject({
      status: "fresh",
      lastSuccessfulFetchedAt: 2000,
      itemCount: 12,
    })
    expect(runtime.takeNextBatch()).toHaveLength(1)

    runtime.recordFetchFailure({
      sourceId: "source-b",
      fetchedAt: 3000,
      error: "timeout",
    })
    expect(runtime.getSourceFetchState("source-b")).toMatchObject({
      status: "failed",
      lastError: "timeout",
    })
  })

  it("rejects non-neutral priorities and cross-business hot-path hints", () => {
    const runtime = new SharedSourceRuntime()
    const invalidPriority = runtime.submitRefreshIntent({
      businessLine: "news",
      sourceId: "source-a",
      priorityClass: "urgent",
      reason: "invalid",
    } as unknown as NeutralRefreshIntent)
    const crossBusinessHint = runtime.submitRefreshIntent({
      businessLine: "news",
      sourceId: "source-a",
      priorityClass: "force_refresh",
      reason: "invalid",
      targetBusinessLine: "investment-event",
    } as unknown as NeutralRefreshIntent)

    expect(invalidPriority.accepted).toBe(false)
    expect(crossBusinessHint.accepted).toBe(false)
    expect(runtime.getQueueDepth()).toBe(0)
  })
})
