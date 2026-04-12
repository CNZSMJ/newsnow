import type { InvestmentProviderEventDetailResponse } from "@shared/types"
import { getEventDetailById } from "#/services/event-bus"
import { projectInvestmentEventDetail } from "#/services/event-engine/investment-view"
import { buildInvestmentRelatedEvents } from "#/services/event-engine/related-events"
import { buildInvestmentProviderMeta } from "#/services/event-engine/provider"

export default defineEventHandler(async (event): Promise<InvestmentProviderEventDetailResponse> => {
  const id = getRouterParam(event, "id")
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "Missing event id",
    })
  }

  const detail = await getEventDetailById(id)
  if (!detail) {
    throw createError({
      statusCode: 404,
      message: "Event not found",
    })
  }

  return {
    status: "success",
    contract: buildInvestmentProviderMeta("event_detail"),
    item: {
      ...projectInvestmentEventDetail(detail),
      relatedEvents: await buildInvestmentRelatedEvents(detail),
    },
  }
})
