import type { NewsItem, SourceID } from "@shared/types"
import type { NewsCacheStore, NewsGetterMap, NewsRefreshRuntime, NewsSnapshotStore } from "./service"
import { drainSourceRuntime } from "#/services/source-runtime/worker"

interface NewsRefreshDrainOptions {
  refreshRuntime?: NewsRefreshRuntime
  snapshots?: NewsSnapshotStore
  cache?: NewsCacheStore
  getters: NewsGetterMap
  waitUntil?: (promise: Promise<unknown>) => void
  now?: () => number
}

interface DrainableNewsRefreshRuntime extends Required<Pick<NewsRefreshRuntime, "takeNextBatch" | "recordFetchSuccess" | "recordFetchFailure">> {}

let drainPromise: Promise<unknown> | undefined

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isDrainableRuntime(runtime: NewsRefreshRuntime | undefined): runtime is NewsRefreshRuntime & DrainableNewsRefreshRuntime {
  return Boolean(
    runtime
    && typeof runtime.takeNextBatch === "function"
    && typeof runtime.recordFetchSuccess === "function"
    && typeof runtime.recordFetchFailure === "function",
  )
}

async function executeNewsRefresh(input: {
  sourceId: SourceID
  fetchedAt: number
  getters: NewsGetterMap
  snapshots?: NewsSnapshotStore
  cache?: NewsCacheStore
}) {
  const getter = input.getters[input.sourceId]
  if (!getter) throw new Error(`Missing source getter: ${input.sourceId}`)
  let items: NewsItem[]
  try {
    items = (await getter()).slice(0, 30)
    await input.snapshots?.upsertSnapshot({
      sourceId: input.sourceId,
      fetchedAt: input.fetchedAt,
      items,
    })
    await input.cache?.set(input.sourceId, items)
  } catch (error) {
    await input.snapshots?.recordFetchFailure({
      sourceId: input.sourceId,
      failedAt: input.fetchedAt,
      error: getErrorMessage(error),
    })
    throw error
  }
  return items
}

async function drainNewsRefreshQueue(options: NewsRefreshDrainOptions) {
  if (!isDrainableRuntime(options.refreshRuntime)) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
    }
  }

  return await drainSourceRuntime(options.refreshRuntime, {
    businessLine: "news",
    execute: async (intent) => {
      const sourceId = intent.sourceId as SourceID
      const fetchedAt = options.now?.() ?? Date.now()
      const items = await executeNewsRefresh({
        sourceId,
        fetchedAt,
        getters: options.getters,
        snapshots: options.snapshots,
        cache: options.cache,
      })
      return {
        fetchedAt,
        itemCount: items.length,
      }
    },
  })
}

export function scheduleNewsRefreshDrain(options: NewsRefreshDrainOptions) {
  if (!isDrainableRuntime(options.refreshRuntime)) return
  if (!drainPromise) {
    drainPromise = Promise.resolve()
      .then(() => drainNewsRefreshQueue(options))
      .finally(() => {
        drainPromise = undefined
      })
  }
  if (options.waitUntil) options.waitUntil(drainPromise)
  else void drainPromise
}
