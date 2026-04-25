import type { InvestmentEventFamily, InvestmentEventListResponse } from "@shared/types"
import { matchesInvestmentEventFamily } from "#/services/event-engine/investment-view"
import { getInvestmentQueryService } from "#/services/investment-query/factory"
import { getWatchlist, touchWatchlistCheckedAt } from "#/services/watchlists"

export default defineEventHandler(async (event): Promise<InvestmentEventListResponse> => {
  const id = getRouterParam(event, "id")
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "Missing watchlist id",
    })
  }

  const query = getQuery(event)
  const limit = Number(query.limit ?? 20)
  const sortBy = query.sort === "latest" ? "latest" : "investment"
  const eventFamily = typeof query.event_family === "string" ? query.event_family as InvestmentEventFamily : undefined
  const watchlist = await getWatchlist(id)
  if (!watchlist) {
    throw createError({
      statusCode: 404,
      message: "Watchlist not found",
    })
  }

  const investmentQueryService = await getInvestmentQueryService()
  const res = investmentQueryService
    ? await investmentQueryService.getWatchlistEvents(watchlist.query, {
      limit: Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 100),
      sortBy,
    })
    : { updatedAt: Date.now(), items: [], totalCount: 0 }
  await touchWatchlistCheckedAt(id, res.updatedAt)
  const items = res.items.filter(item => matchesInvestmentEventFamily(item, eventFamily))
  return {
    status: "success",
    updatedTime: res.updatedAt,
    items,
    totalCount: res.totalCount,
    displayedCount: items.length,
    hasMore: items.length < res.totalCount,
  }
})
