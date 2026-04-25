import { describe, expect, it, vi } from "vitest"
import type { NewsItem, SourceID } from "@shared/types"
import { NewsQueryService } from "./service"
import { SharedSourceRuntime } from "#/services/source-runtime/runtime"
import type { CacheInfo } from "#/types"
import type { NewsSnapshotRecord } from "#/database/news-snapshots"

function newsItem(id: string): NewsItem {
  return {
    id,
    title: id,
    url: `https://example.com/${id}`,
  }
}

function snapshot(input: Partial<NewsSnapshotRecord> & Pick<NewsSnapshotRecord, "sourceId" | "state" | "items">): NewsSnapshotRecord {
  return {
    updatedAt: 1000,
    lastSuccessfulFetchedAt: 1000,
    lastFailedAt: null,
    lastError: null,
    itemCount: input.items.length,
    ...input,
  }
}

describe("newsQueryService", () => {
  it("serves fresh snapshots without calling the upstream getter", async () => {
    const getter = vi.fn(async () => [newsItem("from-getter")])
    const submitRefreshIntent = vi.fn()
    const service = new NewsQueryService({
      snapshots: {
        readSnapshot: vi.fn(async () => snapshot({
          sourceId: "wallstreetcn-quick",
          state: "fresh",
          items: [newsItem("from-snapshot")],
        })),
        upsertSnapshot: vi.fn(),
        recordFetchFailure: vi.fn(),
      },
      cache: undefined,
      refreshRuntime: { submitRefreshIntent },
      getters: { "wallstreetcn-quick": getter },
      now: () => 1200,
    })

    const response = await service.getSource({
      sourceId: "wallstreetcn-quick",
      intervalMs: 1000,
      forceRefresh: false,
    })

    expect(response).toMatchObject({
      status: "success",
      id: "wallstreetcn-quick",
      updatedTime: 1200,
    })
    expect(response.items.map(item => item.id)).toEqual(["from-snapshot"])
    expect(getter).not.toHaveBeenCalled()
    expect(submitRefreshIntent).not.toHaveBeenCalled()
  })

  it("serves stale snapshots and submits a neutral refresh intent without blocking on the getter", async () => {
    const getter = vi.fn(async () => [newsItem("from-getter")])
    const submitRefreshIntent = vi.fn()
    const service = new NewsQueryService({
      snapshots: {
        readSnapshot: vi.fn(async () => snapshot({
          sourceId: "wallstreetcn-quick",
          state: "stale",
          items: [newsItem("stale")],
        })),
        upsertSnapshot: vi.fn(),
        recordFetchFailure: vi.fn(),
      },
      cache: undefined,
      refreshRuntime: { submitRefreshIntent },
      getters: { "wallstreetcn-quick": getter },
      now: () => 2500,
    })

    const response = await service.getSource({
      sourceId: "wallstreetcn-quick",
      intervalMs: 1000,
      forceRefresh: false,
    })

    expect(response.status).toBe("cache")
    expect(response.updatedTime).toBe(1000)
    expect(response.items.map(item => item.id)).toEqual(["stale"])
    expect(getter).not.toHaveBeenCalled()
    expect(submitRefreshIntent).toHaveBeenCalledWith(expect.objectContaining({
      businessLine: "news",
      sourceId: "wallstreetcn-quick",
      priorityClass: "routine_fetch",
      fallbackPolicy: "serve_stale",
    }))
  })

  it("drains accepted stale-snapshot refresh intents in the background", async () => {
    let resolveGetter: (items: NewsItem[]) => void = () => {}
    const getterPromise = new Promise<NewsItem[]>((resolve) => {
      resolveGetter = resolve
    })
    const getter = vi.fn(() => getterPromise)
    const upsertSnapshot = vi.fn()
    const cacheSet = vi.fn()
    const waitUntilPromises: Promise<unknown>[] = []
    const runtime = new SharedSourceRuntime()
    const service = new NewsQueryService({
      snapshots: {
        readSnapshot: vi.fn(async () => snapshot({
          sourceId: "wallstreetcn-quick",
          state: "stale",
          items: [newsItem("stale")],
        })),
        upsertSnapshot,
        recordFetchFailure: vi.fn(),
      },
      cache: {
        get: vi.fn(),
        set: cacheSet,
      },
      refreshRuntime: runtime,
      getters: { "wallstreetcn-quick": getter },
      now: () => 2500,
    })

    const response = await service.getSource({
      sourceId: "wallstreetcn-quick",
      intervalMs: 1000,
      forceRefresh: false,
      waitUntil: promise => waitUntilPromises.push(promise),
    })

    expect(response.status).toBe("cache")
    expect(response.items.map(item => item.id)).toEqual(["stale"])
    expect(waitUntilPromises).toHaveLength(1)
    expect(upsertSnapshot).not.toHaveBeenCalled()

    resolveGetter([newsItem("fresh")])
    await waitUntilPromises[0]

    expect(getter).toHaveBeenCalledTimes(1)
    expect(upsertSnapshot).toHaveBeenCalledWith({
      sourceId: "wallstreetcn-quick",
      fetchedAt: 2500,
      items: [newsItem("fresh")],
    })
    expect(cacheSet).toHaveBeenCalledWith("wallstreetcn-quick", [newsItem("fresh")])
    expect(runtime.getSourceFetchState("wallstreetcn-quick")).toMatchObject({
      status: "fresh",
      itemCount: 1,
    })
  })

  it("uses force refresh as the controlled path that calls the getter and updates snapshot plus legacy cache", async () => {
    const getter = vi.fn(async () => [newsItem("fresh")])
    const upsertSnapshot = vi.fn()
    const cacheSet = vi.fn()
    const service = new NewsQueryService({
      snapshots: {
        readSnapshot: vi.fn(async () => snapshot({
          sourceId: "wallstreetcn-quick",
          state: "stale",
          items: [newsItem("stale")],
        })),
        upsertSnapshot,
        recordFetchFailure: vi.fn(),
      },
      cache: {
        get: vi.fn(),
        set: cacheSet,
      },
      refreshRuntime: undefined,
      getters: { "wallstreetcn-quick": getter },
      now: () => 3000,
    })

    const response = await service.getSource({
      sourceId: "wallstreetcn-quick",
      intervalMs: 1000,
      forceRefresh: true,
    })

    expect(response.status).toBe("success")
    expect(response.items.map(item => item.id)).toEqual(["fresh"])
    expect(upsertSnapshot).toHaveBeenCalledWith({
      sourceId: "wallstreetcn-quick",
      fetchedAt: 3000,
      items: [newsItem("fresh")],
    })
    expect(cacheSet).toHaveBeenCalledWith("wallstreetcn-quick", [newsItem("fresh")])
  })

  it("seeds snapshots from the legacy cache during migration", async () => {
    const legacyCache: CacheInfo = {
      id: "wallstreetcn-quick",
      updated: 1000,
      items: [newsItem("legacy")],
    }
    const upsertSnapshot = vi.fn()
    const submitRefreshIntent = vi.fn()
    const service = new NewsQueryService({
      snapshots: {
        readSnapshot: vi.fn(async () => snapshot({
          sourceId: "wallstreetcn-quick",
          state: "missing",
          updatedAt: null,
          lastSuccessfulFetchedAt: null,
          itemCount: 0,
          items: [],
        })),
        upsertSnapshot,
        recordFetchFailure: vi.fn(),
      },
      cache: {
        get: vi.fn(async () => legacyCache),
        set: vi.fn(),
      },
      refreshRuntime: { submitRefreshIntent },
      getters: {},
      now: () => 1200,
    })

    const response = await service.getSource({
      sourceId: "wallstreetcn-quick",
      intervalMs: 1000,
      forceRefresh: false,
    })

    expect(response.status).toBe("success")
    expect(response.items.map(item => item.id)).toEqual(["legacy"])
    expect(upsertSnapshot).toHaveBeenCalledWith({
      sourceId: "wallstreetcn-quick",
      fetchedAt: 1000,
      items: [newsItem("legacy")],
    })
    expect(submitRefreshIntent).not.toHaveBeenCalled()
  })

  it("serves stale legacy cache rows and submits refresh intents during migration", async () => {
    const legacyCache: CacheInfo = {
      id: "wallstreetcn-quick",
      updated: 1000,
      items: [newsItem("legacy-stale")],
    }
    const upsertSnapshot = vi.fn()
    const submitRefreshIntent = vi.fn()
    const service = new NewsQueryService({
      snapshots: {
        readSnapshot: vi.fn(async () => snapshot({
          sourceId: "wallstreetcn-quick",
          state: "missing",
          updatedAt: null,
          lastSuccessfulFetchedAt: null,
          itemCount: 0,
          items: [],
        })),
        upsertSnapshot,
        recordFetchFailure: vi.fn(),
      },
      cache: {
        get: vi.fn(async () => legacyCache),
        set: vi.fn(),
      },
      refreshRuntime: { submitRefreshIntent },
      getters: {},
      now: () => 3000,
    })

    const response = await service.getSource({
      sourceId: "wallstreetcn-quick",
      intervalMs: 1000,
      forceRefresh: false,
    })

    expect(response.status).toBe("cache")
    expect(response.updatedTime).toBe(1000)
    expect(response.items.map(item => item.id)).toEqual(["legacy-stale"])
    expect(upsertSnapshot).toHaveBeenCalledWith({
      sourceId: "wallstreetcn-quick",
      fetchedAt: 1000,
      items: [newsItem("legacy-stale")],
    })
    expect(submitRefreshIntent).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "wallstreetcn-quick",
      priorityClass: "routine_fetch",
      fallbackPolicy: "serve_stale",
    }))
  })

  it("batch reads available snapshots and omits missing sources without calling getters", async () => {
    const getter = vi.fn(async () => [newsItem("from-getter")])
    const submitRefreshIntent = vi.fn()
    const service = new NewsQueryService({
      snapshots: {
        readSnapshot: vi.fn(),
        readSnapshots: vi.fn(async () => [
          snapshot({
            sourceId: "wallstreetcn-quick",
            state: "fresh",
            items: [newsItem("fresh")],
          }),
          snapshot({
            sourceId: "cls-telegraph",
            state: "stale",
            updatedAt: 500,
            lastSuccessfulFetchedAt: 500,
            items: [newsItem("stale")],
          }),
          snapshot({
            sourceId: "weibo",
            state: "missing",
            updatedAt: null,
            lastSuccessfulFetchedAt: null,
            itemCount: 0,
            items: [],
          }),
        ]),
        upsertSnapshot: vi.fn(),
        recordFetchFailure: vi.fn(),
      },
      cache: undefined,
      refreshRuntime: { submitRefreshIntent },
      getters: { weibo: getter },
      now: () => 2000,
    })

    const responses = await service.getSourcesBatch({
      sourceIds: ["wallstreetcn-quick", "cls-telegraph", "weibo"],
      getIntervalMs: () => 1000,
    })

    expect(responses.map(response => response.id)).toEqual(["wallstreetcn-quick", "cls-telegraph"])
    expect(responses.map(response => response.status)).toEqual(["success", "cache"])
    expect(submitRefreshIntent).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "cls-telegraph",
      priorityClass: "routine_fetch",
    }))
    expect(getter).not.toHaveBeenCalled()
  })

  it("batch reads and seeds legacy cache rows during migration", async () => {
    const upsertSnapshot = vi.fn()
    const submitRefreshIntent = vi.fn()
    const service = new NewsQueryService({
      snapshots: {
        readSnapshot: vi.fn(),
        readSnapshots: vi.fn(async () => [
          snapshot({
            sourceId: "wallstreetcn-quick",
            state: "missing",
            updatedAt: null,
            lastSuccessfulFetchedAt: null,
            itemCount: 0,
            items: [],
          }),
        ]),
        upsertSnapshot,
        recordFetchFailure: vi.fn(),
      },
      cache: {
        get: vi.fn(),
        getEntire: vi.fn(async () => [{
          id: "wallstreetcn-quick" as SourceID,
          updated: 1500,
          items: [newsItem("legacy")],
        }, {
          id: "cls-telegraph" as SourceID,
          updated: 200,
          items: [newsItem("legacy-stale")],
        }]),
        set: vi.fn(),
      },
      refreshRuntime: { submitRefreshIntent },
      getters: {},
      now: () => 1800,
    })

    const responses = await service.getSourcesBatch({
      sourceIds: ["wallstreetcn-quick", "cls-telegraph"],
      getIntervalMs: () => 1000,
    })

    expect(responses.map(response => response.id)).toEqual(["wallstreetcn-quick", "cls-telegraph"])
    expect(responses.map(response => response.status)).toEqual(["success", "cache"])
    expect(upsertSnapshot).toHaveBeenCalledWith({
      sourceId: "wallstreetcn-quick",
      fetchedAt: 1500,
      items: [newsItem("legacy")],
    })
    expect(upsertSnapshot).toHaveBeenCalledWith({
      sourceId: "cls-telegraph",
      fetchedAt: 200,
      items: [newsItem("legacy-stale")],
    })
    expect(submitRefreshIntent).toHaveBeenCalledTimes(1)
    expect(submitRefreshIntent).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "cls-telegraph",
      priorityClass: "routine_fetch",
      fallbackPolicy: "serve_stale",
    }))
  })
})
