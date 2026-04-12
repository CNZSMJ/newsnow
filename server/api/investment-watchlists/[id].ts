import type { InvestmentProviderWatchlistDetailResponse, InvestmentWatchlistDetail } from "@shared/types"
import { getWatchlistDetail } from "#/services/watchlists"
import { projectInvestmentEventBrief } from "#/services/event-engine/investment-view"
import { buildInvestmentProviderMeta } from "#/services/event-engine/provider"

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

  const item: InvestmentWatchlistDetail = {
    ...detail,
    recentEvents: detail.recentEvents.map(event => projectInvestmentEventBrief(event)),
  }

  return {
    status: "success",
    updatedTime: Date.now(),
    contract: buildInvestmentProviderMeta("watchlist_detail"),
    item,
  }
})
