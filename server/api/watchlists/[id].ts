import type { InvestmentWatchlistDetail, WatchlistRecord } from "@shared/types"
import { getInvestmentQueryService } from "#/services/investment-query/factory"
import { getWatchlist, touchWatchlistCheckedAt } from "#/services/watchlists"

export default defineEventHandler(async (event): Promise<WatchlistRecord | InvestmentWatchlistDetail> => {
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
    const item = await getWatchlist(id)
    if (!item) {
      throw createError({
        statusCode: 404,
        message: "Watchlist not found",
      })
    }
    const investmentQueryService = await getInvestmentQueryService()
    const checkedAt = await touchWatchlistCheckedAt(id) ?? Date.now()
    if (!investmentQueryService) return { ...item, recentEvents: [], lastCheckedAt: checkedAt }
    const detail = await investmentQueryService.getWatchlistDetail(item, {
      limit: Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 100),
      sortBy,
    })
    return {
      ...detail,
      lastCheckedAt: checkedAt,
    }
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
