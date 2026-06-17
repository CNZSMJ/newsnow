import type {
  AffectedMarket,
} from "@shared/event-profile"
import type {
  EventSubType,
  EventType,
  InvestmentProviderEventListResponse,
  SourceID,
} from "@shared/types"
import { buildInvestmentListResponse, parseInvestmentListQuery } from "./query-adapter"
import { getInvestmentQueryService } from "#/services/investment-query/factory"

export default defineEventHandler(async (event): Promise<InvestmentProviderEventListResponse> => {
  const query = getQuery(event) as Record<string, unknown>
  const listQuery = parseInvestmentListQuery(query)
  const sourceIds = typeof query.sources === "string"
    ? query.sources.split(",").map(item => item.trim()).filter(Boolean) as SourceID[]
    : undefined

  const investmentQueryService = await getInvestmentQueryService()
  const res = investmentQueryService
    ? await investmentQueryService.listLatestEvents({
      limit: listQuery.limit,
      eventFamily: listQuery.eventFamily,
      focus: listQuery.focus,
      eventType: typeof query.event_type === "string" ? query.event_type as EventType : undefined,
      eventSubType: typeof query.event_subtype === "string" ? query.event_subtype as EventSubType : undefined,
      sourceId: typeof query.source_id === "string" ? query.source_id as SourceID : undefined,
      topic: typeof query.topic === "string" ? query.topic : undefined,
      sourceIds,
      market: typeof query.market === "string" ? query.market as AffectedMarket : undefined,
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
