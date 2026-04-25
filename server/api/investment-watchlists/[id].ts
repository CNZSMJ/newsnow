import type { InvestmentProviderWatchlistDetailResponse } from "@shared/types"
import { buildInvestmentProviderMeta } from "#/services/event-engine/provider"
import { getInvestmentQueryService } from "#/services/investment-query/factory"
import { getWatchlist, touchWatchlistCheckedAt } from "#/services/watchlists"

export default defineEventHandler(async (event): Promise<InvestmentProviderWatchlistDetailResponse> => {
  const id = getRouterParam(event, "id")
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "Missing watchlist id",
    })
  }

  const query = getQuery(event)
  const sortBy = query.sort === "latest" ? "latest" : "investment"
  const limit = Number(query.limit ?? 20)
  const watchlist = await getWatchlist(id)
  if (!watchlist) {
    throw createError({
      statusCode: 404,
      message: "Watchlist not found",
    })
  }

  const investmentQueryService = await getInvestmentQueryService()
  const checkedAt = await touchWatchlistCheckedAt(id) ?? Date.now()
  const item = investmentQueryService
    ? await investmentQueryService.getWatchlistDetail(watchlist, {
      limit: Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 100),
      sortBy,
    })
    : { ...watchlist, recentEvents: [], lastCheckedAt: checkedAt }

  return {
    status: "success",
    updatedTime: checkedAt,
    contract: buildInvestmentProviderMeta("watchlist_detail"),
    item: {
      ...item,
      lastCheckedAt: checkedAt,
    },
  }
})
