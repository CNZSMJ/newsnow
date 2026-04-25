import md5 from "md5"
import type { AffectedMarket, DirectionalView } from "@shared/event-profile"
import type { WatchlistQuery } from "@shared/types"
import { getWatchlistTable } from "#/database/watchlists"

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

export async function touchWatchlistCheckedAt(id: string, checkedAt = Date.now()) {
  const table = await getWatchlistTable()
  if (!table) return undefined
  await table.touchCheckedAt(id, checkedAt)
  return checkedAt
}
