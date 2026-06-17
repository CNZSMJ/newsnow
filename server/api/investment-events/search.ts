import type {
  InvestmentProviderEventListResponse,
} from "@shared/types"
import { buildInvestmentListResponse, parseInvestmentListQuery } from "./query-adapter"
import { getInvestmentQueryService } from "#/services/investment-query/factory"

export default defineEventHandler(async (event): Promise<InvestmentProviderEventListResponse> => {
  const query = getQuery(event) as Record<string, unknown>
  const listQuery = parseInvestmentListQuery(query)
  const q = typeof query.q === "string" ? query.q.trim() : ""
  if (!q) {
    throw createError({
      statusCode: 400,
      message: "Missing q",
    })
  }

  const investmentQueryService = await getInvestmentQueryService()
  const res = investmentQueryService
    ? await investmentQueryService.searchEvents({
      q,
      limit: listQuery.limit,
      eventFamily: listQuery.eventFamily,
      focus: listQuery.focus,
      market: listQuery.market,
      directionalView: listQuery.directionalView,
      minMaterialityScore: listQuery.minMaterialityScore,
      minAuthorityScore: listQuery.minAuthorityScore,
      changedSince: listQuery.changedSince,
      lifecycleAfter: listQuery.lifecycleAfter,
      seriesKey: listQuery.seriesKey,
      periodKey: listQuery.periodKey,
      sortBy: listQuery.sortBy,
      includeTotalCount: listQuery.includeTotalCount,
    })
    : { updatedAt: Date.now(), items: [], totalCount: 0 }

  return buildInvestmentListResponse(res)
})
