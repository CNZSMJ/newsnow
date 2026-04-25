import type { InvestmentEventFamily, InvestmentProviderEventListResponse } from "@shared/types"
import { type InvestmentScanFocus, filterInvestmentBriefsByFocus } from "#/services/event-engine/investment-filters"
import { matchesInvestmentEventFamily } from "#/services/event-engine/investment-view"
import { buildInvestmentProviderMeta } from "#/services/event-engine/provider"
import { getInvestmentQueryService } from "#/services/investment-query/factory"
import { getWatchlist, touchWatchlistCheckedAt } from "#/services/watchlists"

export default defineEventHandler(async (event): Promise<InvestmentProviderEventListResponse> => {
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
  const focus = typeof query.focus === "string" ? query.focus as InvestmentScanFocus : "all"
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
  const items = filterInvestmentBriefsByFocus(
    res.items
      .filter(item => matchesInvestmentEventFamily(item, eventFamily)),
    focus,
  )

  return {
    status: "success",
    updatedTime: res.updatedAt,
    contract: buildInvestmentProviderMeta("watchlist_events"),
    items,
    totalCount: res.totalCount,
    displayedCount: items.length,
    hasMore: items.length < res.totalCount,
  }
})
