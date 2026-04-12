import type { EventSubType, EventType, SourceID, WatchlistQuery, WatchlistRecord } from "@shared/types"
import type { AffectedMarket, DirectionalView } from "@shared/event-profile"
import { listWatchlists, upsertWatchlist } from "#/services/watchlists"

export default defineEventHandler(async (event): Promise<{ status: "success", updatedTime: number, items?: WatchlistRecord[], item?: WatchlistRecord }> => {
  if (event.node.req.method === "POST") {
    const body = await readBody<{
      watchlistId?: string
      name: string
      description?: string
      query?: {
        entities?: string[]
        topics?: string[]
        eventTypes?: string[]
        eventSubTypes?: string[]
        sourceIds?: string[]
        markets?: string[]
        directionalViews?: string[]
        minMaterialityScore?: number
        minAuthorityScore?: number
      }
    }>(event)
    if (!body?.name?.trim()) {
      throw createError({
        statusCode: 400,
        message: "Missing name",
      })
    }

    const query: WatchlistQuery | undefined = body.query
      ? {
          entities: body.query.entities,
          topics: body.query.topics,
          eventTypes: body.query.eventTypes as EventType[] | undefined,
          eventSubTypes: body.query.eventSubTypes as EventSubType[] | undefined,
          sourceIds: body.query.sourceIds as SourceID[] | undefined,
          markets: body.query.markets as AffectedMarket[] | undefined,
          directionalViews: body.query.directionalViews as DirectionalView[] | undefined,
          minMaterialityScore: body.query.minMaterialityScore,
          minAuthorityScore: body.query.minAuthorityScore,
        }
      : undefined

    const item = await upsertWatchlist({
      watchlistId: body.watchlistId,
      name: body.name,
      description: body.description,
      query,
    })

    return {
      status: "success",
      updatedTime: Date.now(),
      item,
    }
  }

  const items = await listWatchlists()
  return {
    status: "success",
    updatedTime: Date.now(),
    items,
  }
})
