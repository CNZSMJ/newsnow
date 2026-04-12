import type { EventListResponse, InvestmentEventFamily, InvestmentEventListResponse } from "@shared/types"
import { getWatchlistEvents } from "#/services/watchlists"
import { matchesInvestmentEventFamily, projectInvestmentEventBrief } from "#/services/event-engine/investment-view"

export default defineEventHandler(async (event): Promise<EventListResponse | InvestmentEventListResponse> => {
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
  const items = await getWatchlistEvents(id, {
    limit: Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 100),
    latest: query.latest !== "false",
    sortBy,
  })

  if (query.projection === "investment") {
    const projected = items
      .map(item => projectInvestmentEventBrief(item))
      .filter(item => matchesInvestmentEventFamily(item, eventFamily))
    return {
      status: "success",
      updatedTime: Date.now(),
      items: projected,
    }
  }

  return {
    status: "success",
    updatedTime: Date.now(),
    items,
  }
})
