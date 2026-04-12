import type { InvestmentWatchlistDetail, WatchlistDetail, WatchlistRecord } from "@shared/types"
import { getWatchlist, getWatchlistDetail } from "#/services/watchlists"
import { projectInvestmentEventBrief } from "#/services/event-engine/investment-view"

export default defineEventHandler(async (event): Promise<WatchlistRecord | WatchlistDetail | InvestmentWatchlistDetail> => {
  const id = getRouterParam(event, "id")
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "Missing watchlist id",
    })
  }

  const query = getQuery(event)
  const sortBy = query.sort === "latest" ? "latest" : "investment"
  if (query.detail === "true") {
    const limit = Number(query.limit ?? 20)
    const detail = await getWatchlistDetail(id, {
      limit: Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 100),
      latest: query.latest !== "false",
      sortBy,
    })
    if (!detail) {
      throw createError({
        statusCode: 404,
        message: "Watchlist not found",
      })
    }
    if (query.projection === "investment") {
      return {
        ...detail,
        recentEvents: detail.recentEvents.map(item => projectInvestmentEventBrief(item)),
      }
    }
    return detail
  }

  const item = await getWatchlist(id)
  if (!item) {
    throw createError({
      statusCode: 404,
      message: "Watchlist not found",
    })
  }

  return item
})
