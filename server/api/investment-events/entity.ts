import type {
  InvestmentProviderEventListResponse,
} from "@shared/types"
import { buildInvestmentListResponse, parseInvestmentListQuery } from "./query-adapter"
import { getInvestmentQueryService } from "#/services/investment-query/factory"

export default defineEventHandler(async (event): Promise<InvestmentProviderEventListResponse> => {
  const query = getQuery(event) as Record<string, unknown>
  const listQuery = parseInvestmentListQuery(query)
  const entity = typeof query.entity === "string" ? query.entity.trim() : ""
  if (!entity) {
    throw createError({
      statusCode: 400,
      message: "Missing entity",
    })
  }

  const investmentQueryService = await getInvestmentQueryService()
  const res = investmentQueryService
    ? await investmentQueryService.getEntityEvents({
      entity,
      limit: listQuery.limit,
      eventFamily: listQuery.eventFamily,
      focus: listQuery.focus,
      sortBy: listQuery.sortBy,
      market: listQuery.market,
      directionalView: listQuery.directionalView,
      minMaterialityScore: listQuery.minMaterialityScore,
      minAuthorityScore: listQuery.minAuthorityScore,
      changedSince: listQuery.changedSince,
      lifecycleAfter: listQuery.lifecycleAfter,
      seriesKey: listQuery.seriesKey,
      periodKey: listQuery.periodKey,
    })
    : { updatedAt: Date.now(), items: [], totalCount: 0 }

  return buildInvestmentListResponse(res)
})
