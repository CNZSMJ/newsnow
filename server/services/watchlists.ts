import md5 from "md5"
import type { AffectedMarket, DirectionalView } from "@shared/event-profile"
import type { WatchlistDetail, WatchlistQuery } from "@shared/types"
import { getWatchlistTable, queryWatchlistEvents } from "#/database/watchlists"

function sanitizeQuery(query?: WatchlistQuery): WatchlistQuery {
  const normalizeList = (items?: string[]) => items?.map(item => item.trim()).filter(Boolean)
  return {
    entities: normalizeList(query?.entities),
    topics: normalizeList(query?.topics),
    eventTypes: query?.eventTypes?.filter(Boolean),
    eventSubTypes: query?.eventSubTypes?.filter(Boolean),
    sourceIds: query?.sourceIds?.filter(Boolean),
    markets: query?.markets?.filter(Boolean) as AffectedMarket[] | undefined,
    directionalViews: query?.directionalViews?.filter(Boolean) as DirectionalView[] | undefined,
    minMaterialityScore: query?.minMaterialityScore,
    minAuthorityScore: query?.minAuthorityScore,
  }
}

export async function listWatchlists() {
  const table = await getWatchlistTable()
  if (!table) return []
  return table.list()
}

export async function upsertWatchlist(input: {
  watchlistId?: string
  name: string
  description?: string
  query?: WatchlistQuery
}) {
  const table = await getWatchlistTable()
  if (!table) return undefined

  const now = Date.now()
  const query = sanitizeQuery(input.query)
  const watchlistId = input.watchlistId?.trim() || `wl_${md5(`${input.name}|${now}`)}`
  const existing = await table.get(watchlistId)

  await table.upsert({
    watchlist_id: watchlistId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    query_json: JSON.stringify(query),
    created_at: existing?.createdAt ?? now,
    updated_at: now,
    last_checked_at: existing?.lastCheckedAt ?? null,
  })

  return table.get(watchlistId)
}

export async function getWatchlist(id: string) {
  const table = await getWatchlistTable()
  if (!table) return undefined
  return table.get(id)
}

export async function getWatchlistDetail(id: string, options?: {
  limit?: number
  latest?: boolean
  sortBy?: "latest" | "investment"
}) {
  const table = await getWatchlistTable()
  if (!table) return undefined
  const record = await table.get(id)
  if (!record) return undefined

  const sortBy = options?.sortBy ?? (options?.latest ? "latest" : "investment")
  const recentEvents = await queryWatchlistEvents(record.query, {
    limit: options?.limit ?? 20,
    sortBy,
  })
  await table.touchCheckedAt(id)

  return {
    ...record,
    recentEvents,
    lastCheckedAt: Date.now(),
  } satisfies WatchlistDetail
}

export async function getWatchlistEvents(id: string, options?: {
  limit?: number
  latest?: boolean
  sortBy?: "latest" | "investment"
}) {
  const detail = await getWatchlistDetail(id, options)
  return detail?.recentEvents ?? []
}
