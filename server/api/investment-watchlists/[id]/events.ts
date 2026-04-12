import type { InvestmentEventFamily, InvestmentProviderEventListResponse } from "@shared/types"
import { getWatchlistEvents } from "#/services/watchlists"
import { filterInvestmentBriefsByFocus, type InvestmentScanFocus } from "#/services/event-engine/investment-filters"
import { matchesInvestmentEventFamily, projectInvestmentEventBrief } from "#/services/event-engine/investment-view"
import { buildInvestmentProviderMeta } from "#/services/event-engine/provider"

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

  const items = await getWatchlistEvents(id, {
    limit: Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 100),
    latest: query.latest !== "false",
    sortBy,
  })

  return {
    status: "success",
    updatedTime: Date.now(),
    contract: buildInvestmentProviderMeta("watchlist_events"),
    items: filterInvestmentBriefsByFocus(
      items
        .map(item => projectInvestmentEventBrief(item))
        .filter(item => matchesInvestmentEventFamily(item, eventFamily)),
      focus,
    ),
  }
})
