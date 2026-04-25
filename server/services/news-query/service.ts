import type { NewsItem, SourceID, SourceResponse } from "@shared/types"
import { scheduleNewsRefreshDrain } from "./refresh-worker"
import type { CacheInfo } from "#/types"
import type { NewsSnapshotRecord, NewsSnapshotTable } from "#/database/news-snapshots"
import type { NeutralRefreshIntent, SharedSourceRuntime } from "#/services/source-runtime/runtime"

export interface NewsCacheStore {
  get: (key: string) => Promise<CacheInfo | undefined>
  getEntire?: (keys: string[]) => Promise<CacheInfo[]>
  set: (key: string, value: NewsItem[]) => Promise<void>
}

export interface NewsSnapshotStore {
  readSnapshot: (sourceId: string, options: { now: number, maxAgeMs: number }) => Promise<NewsSnapshotRecord>
  readSnapshots?: (sourceIds: string[], options: { now: number, maxAgeMs: number }) => Promise<NewsSnapshotRecord[]>
  upsertSnapshot: (input: { sourceId: string, fetchedAt: number, items: NewsItem[] }) => Promise<void>
  recordFetchFailure: (input: { sourceId: string, failedAt: number, error: string }) => Promise<void>
}

export interface NewsRefreshRuntime {
  submitRefreshIntent: (intent: NeutralRefreshIntent) => ReturnType<SharedSourceRuntime["submitRefreshIntent"]>
  takeNextBatch?: SharedSourceRuntime["takeNextBatch"]
  recordFetchSuccess?: SharedSourceRuntime["recordFetchSuccess"]
  recordFetchFailure?: SharedSourceRuntime["recordFetchFailure"]
}

export type NewsGetterMap = Partial<Record<SourceID, () => Promise<NewsItem[]>>>

export interface NewsQueryServiceOptions {
  snapshots?: NewsSnapshotStore | NewsSnapshotTable
  cache?: NewsCacheStore
  refreshRuntime?: NewsRefreshRuntime
  getters: NewsGetterMap
  now?: () => number
}

export interface NewsSourceQuery {
  sourceId: SourceID
  intervalMs: number
  forceRefresh: boolean
  waitUntil?: (promise: Promise<unknown>) => void
}

export interface NewsSourcesBatchQuery {
  sourceIds: SourceID[]
  getIntervalMs: (sourceId: SourceID) => number
  waitUntil?: (promise: Promise<unknown>) => void
}

function isFreshCache(cache: CacheInfo, now: number, intervalMs: number) {
  return now - cache.updated < intervalMs
}

function toSourceResponse(input: {
  sourceId: SourceID
  status: SourceResponse["status"]
  updatedTime: number
  items: NewsItem[]
}): SourceResponse {
  return {
    status: input.status,
    id: input.sourceId,
    updatedTime: input.updatedTime,
    items: input.items,
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function resolveSnapshotState(snapshot: NewsSnapshotRecord, now: number, intervalMs: number) {
  if (!snapshot.items.length || snapshot.updatedAt === null) return "missing"
  if (snapshot.state === "failed") return "failed"
  return now - snapshot.updatedAt <= intervalMs ? "fresh" : "stale"
}

type NewsSnapshotState = ReturnType<typeof resolveSnapshotState>

export class NewsQueryService {
  private readonly snapshots?: NewsSnapshotStore | NewsSnapshotTable
  private readonly cache?: NewsCacheStore
  private readonly refreshRuntime?: NewsRefreshRuntime
  private readonly getters: NewsGetterMap
  private readonly now: () => number

  constructor(options: NewsQueryServiceOptions) {
    this.snapshots = options.snapshots
    this.cache = options.cache
    this.refreshRuntime = options.refreshRuntime
    this.getters = options.getters
    this.now = options.now ?? Date.now
  }

  async getSource(query: NewsSourceQuery): Promise<SourceResponse> {
    const now = this.now()
    const snapshot = await this.snapshots?.readSnapshot(query.sourceId, {
      now,
      maxAgeMs: query.intervalMs,
    })
    const snapshotState = snapshot ? resolveSnapshotState(snapshot, now, query.intervalMs) : "missing"

    if (snapshot?.items.length && !query.forceRefresh) {
      if (snapshotState !== "fresh") {
        this.submitRefreshIntent(query.sourceId, now, query.waitUntil)
      }
      return this.responseFromSnapshot(query.sourceId, snapshot, snapshotState, now)
    }

    if (!query.forceRefresh) {
      const legacy = await this.cache?.get(query.sourceId)
      if (legacy) {
        this.persistLegacyAsSnapshot(query.sourceId, legacy, query.waitUntil)
        const legacyIsFresh = isFreshCache(legacy, now, query.intervalMs)
        if (!legacyIsFresh) {
          this.submitRefreshIntent(query.sourceId, now, query.waitUntil)
        }
        return this.responseFromLegacyCache(query.sourceId, legacy, legacyIsFresh, now)
      }
    }

    try {
      const items = await this.fetchSource(query.sourceId)
      this.persistSnapshot({
        sourceId: query.sourceId,
        fetchedAt: now,
        items,
        waitUntil: query.waitUntil,
      })
      this.persistLegacyCache(query.sourceId, items, query.waitUntil)
      return toSourceResponse({
        sourceId: query.sourceId,
        status: "success",
        updatedTime: now,
        items,
      })
    } catch (error) {
      return await this.fallbackAfterFetchFailure(query.sourceId, now, snapshot, error)
    }
  }

  async getSourcesBatch(query: NewsSourcesBatchQuery): Promise<SourceResponse[]> {
    if (!query.sourceIds.length) return []

    const now = this.now()
    const responsesBySourceId = new Map<SourceID, SourceResponse>()
    const snapshots = await this.readSnapshots(query.sourceIds, now, query.getIntervalMs)
    const missingSourceIds: SourceID[] = []

    for (const snapshot of snapshots) {
      const sourceId = snapshot.sourceId as SourceID
      if (!snapshot.items.length) {
        missingSourceIds.push(sourceId)
        continue
      }
      const snapshotState = resolveSnapshotState(snapshot, now, query.getIntervalMs(sourceId))

      if (snapshotState !== "fresh") {
        this.submitRefreshIntent(sourceId, now, query.waitUntil)
      }

      responsesBySourceId.set(sourceId, this.responseFromSnapshot(sourceId, snapshot, snapshotState, now))
    }

    const legacyRows = await this.readLegacyCaches(missingSourceIds)
    for (const legacy of legacyRows) {
      const sourceId = legacy.id
      this.persistLegacyAsSnapshot(sourceId, legacy, query.waitUntil)
      const legacyIsFresh = isFreshCache(legacy, now, query.getIntervalMs(sourceId))
      if (!legacyIsFresh) {
        this.submitRefreshIntent(sourceId, now, query.waitUntil)
      }
      responsesBySourceId.set(sourceId, this.responseFromLegacyCache(sourceId, legacy, legacyIsFresh, now))
    }

    return query.sourceIds
      .map(sourceId => responsesBySourceId.get(sourceId))
      .filter((response): response is SourceResponse => Boolean(response))
  }

  private async fetchSource(sourceId: SourceID) {
    const getter = this.getters[sourceId]
    if (!getter) throw new Error(`Missing source getter: ${sourceId}`)
    return (await getter()).slice(0, 30)
  }

  private responseFromSnapshot(
    sourceId: SourceID,
    snapshot: NewsSnapshotRecord,
    snapshotState: NewsSnapshotState,
    now: number,
  ) {
    return toSourceResponse({
      sourceId,
      status: snapshotState === "fresh" ? "success" : "cache",
      updatedTime: snapshotState === "fresh" ? now : snapshot.updatedAt ?? now,
      items: snapshot.items,
    })
  }

  private responseFromLegacyCache(sourceId: SourceID, legacy: CacheInfo, legacyIsFresh: boolean, now: number) {
    return toSourceResponse({
      sourceId,
      status: legacyIsFresh ? "success" : "cache",
      updatedTime: legacyIsFresh ? now : legacy.updated,
      items: legacy.items,
    })
  }

  private persistLegacyAsSnapshot(
    sourceId: SourceID,
    legacy: CacheInfo,
    waitUntil?: (promise: Promise<unknown>) => void,
  ) {
    this.persistSnapshot({
      sourceId,
      fetchedAt: legacy.updated,
      items: legacy.items,
      waitUntil,
    })
  }

  private async fallbackAfterFetchFailure(
    sourceId: SourceID,
    failedAt: number,
    snapshot: NewsSnapshotRecord | undefined,
    error: unknown,
  ) {
    await this.snapshots?.recordFetchFailure({
      sourceId,
      failedAt,
      error: getErrorMessage(error),
    })

    if (snapshot?.items.length) {
      return toSourceResponse({
        sourceId,
        status: "cache",
        updatedTime: snapshot.updatedAt ?? failedAt,
        items: snapshot.items,
      })
    }

    const legacy = await this.cache?.get(sourceId)
    if (legacy) {
      return toSourceResponse({
        sourceId,
        status: "cache",
        updatedTime: legacy.updated,
        items: legacy.items,
      })
    }

    throw error
  }

  private submitRefreshIntent(sourceId: SourceID, requestedAt: number, waitUntil?: (promise: Promise<unknown>) => void) {
    const receipt = this.refreshRuntime?.submitRefreshIntent({
      businessLine: "news",
      sourceId,
      priorityClass: "routine_fetch",
      reason: "news snapshot stale or missing",
      requestedAt,
      fallbackPolicy: "serve_stale",
    })
    if (receipt?.accepted) {
      scheduleNewsRefreshDrain({
        refreshRuntime: this.refreshRuntime,
        snapshots: this.snapshots,
        cache: this.cache,
        getters: this.getters,
        waitUntil,
        now: this.now,
      })
    }
  }

  private persistSnapshot(input: {
    sourceId: SourceID
    fetchedAt: number
    items: NewsItem[]
    waitUntil?: (promise: Promise<unknown>) => void
  }) {
    const promise = this.snapshots?.upsertSnapshot({
      sourceId: input.sourceId,
      fetchedAt: input.fetchedAt,
      items: input.items,
    })
    if (!promise) return
    const observed = promise.catch((error) => {
      logger.error("failed to persist news snapshot", {
        sourceId: input.sourceId,
        error: getErrorMessage(error),
      })
    })
    if (input.waitUntil) input.waitUntil(observed)
    else void observed
  }

  private persistLegacyCache(
    sourceId: SourceID,
    items: NewsItem[],
    waitUntil?: (promise: Promise<unknown>) => void,
  ) {
    const promise = this.cache?.set(sourceId, items)
    if (!promise) return
    const observed = promise.catch((error) => {
      logger.error("failed to persist legacy news cache", {
        sourceId,
        error: getErrorMessage(error),
      })
    })
    if (waitUntil) waitUntil(observed)
    else void observed
  }

  private async readSnapshots(sourceIds: SourceID[], now: number, getIntervalMs: (sourceId: SourceID) => number) {
    if (!this.snapshots) {
      return sourceIds.map(sourceId => ({
        sourceId,
        state: "missing" as const,
        updatedAt: null,
        lastSuccessfulFetchedAt: null,
        lastFailedAt: null,
        lastError: null,
        itemCount: 0,
        items: [],
      }))
    }
    if (this.snapshots.readSnapshots) {
      return await this.snapshots.readSnapshots(sourceIds, {
        now,
        maxAgeMs: Math.min(...sourceIds.map(getIntervalMs)),
      })
    }
    return await Promise.all(sourceIds.map(sourceId =>
      this.snapshots!.readSnapshot(sourceId, {
        now,
        maxAgeMs: getIntervalMs(sourceId),
      }),
    ))
  }

  private async readLegacyCaches(sourceIds: SourceID[]) {
    if (!sourceIds.length || !this.cache) return []
    if (this.cache.getEntire) return await this.cache.getEntire(sourceIds)

    const rows: CacheInfo[] = []
    for (const sourceId of sourceIds) {
      const row = await this.cache.get(sourceId)
      if (row) rows.push(row)
    }
    return rows
  }
}
