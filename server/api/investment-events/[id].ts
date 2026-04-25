import type { InvestmentProviderEventDetailResponse } from "@shared/types"
import { buildInvestmentProviderMeta } from "#/services/event-engine/provider"
import { getInvestmentQueryService } from "#/services/investment-query/factory"

export default defineEventHandler(async (event): Promise<InvestmentProviderEventDetailResponse> => {
  const id = getRouterParam(event, "id")
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "Missing event id",
    })
  }

  const investmentQueryService = await getInvestmentQueryService()
  const detail = await investmentQueryService?.getEventDetail(id)
  if (!detail) {
    throw createError({
      statusCode: 404,
      message: "Event not found",
    })
  }

  return {
    status: "success",
    contract: buildInvestmentProviderMeta("event_detail"),
    item: detail,
  }
})
