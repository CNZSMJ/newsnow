import type {
  AffectedMarket,
  DirectionalView,
} from "@shared/event-profile"
import type {
  EventSubType,
  EventType,
  InvestmentEventFamily,
  InvestmentProviderEventListResponse,
  SourceID,
} from "@shared/types"
import { listLatestEvents } from "#/services/event-bus"
import { filterInvestmentBriefsByFocus, type InvestmentScanFocus } from "#/services/event-engine/investment-filters"
import { matchesInvestmentEventFamily, projectInvestmentEventBrief } from "#/services/event-engine/investment-view"
import { buildInvestmentProviderMeta } from "#/services/event-engine/provider"

export default defineEventHandler(async (event): Promise<InvestmentProviderEventListResponse> => {
  const query = getQuery(event)
  const limit = Number(query.limit ?? 20)
  const sourceIds = typeof query.sources === "string"
    ? query.sources.split(",").map(item => item.trim()).filter(Boolean) as SourceID[]
    : undefined
  const sortBy = query.sort === "latest" ? "latest" : "investment"
  const focus = typeof query.focus === "string" ? query.focus as InvestmentScanFocus : "all"
  const eventFamily = typeof query.event_family === "string" ? query.event_family as InvestmentEventFamily : undefined
  const minMaterialityScore = Number(query.min_materiality_score)
  const minAuthorityScore = Number(query.min_authority_score)

  const res = await listLatestEvents({
    limit: Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 400),
    eventType: typeof query.event_type === "string" ? query.event_type as EventType : undefined,
    eventSubType: typeof query.event_subtype === "string" ? query.event_subtype as EventSubType : undefined,
    sourceId: typeof query.source_id === "string" ? query.source_id as SourceID : undefined,
    topic: typeof query.topic === "string" ? query.topic : undefined,
    latest: query.latest !== "false",
    sourceIds,
    market: typeof query.market === "string" ? query.market as AffectedMarket : undefined,
    directionalView: typeof query.directional_view === "string" ? query.directional_view as DirectionalView : undefined,
    minMaterialityScore: Number.isNaN(minMaterialityScore) ? undefined : minMaterialityScore,
    minAuthorityScore: Number.isNaN(minAuthorityScore) ? undefined : minAuthorityScore,
    sortBy,
  })

  const items = filterInvestmentBriefsByFocus(
    res.items
      .map(item => projectInvestmentEventBrief(item))
      .filter(item => matchesInvestmentEventFamily(item, eventFamily)),
    focus,
  )

  return {
    status: "success",
    updatedTime: res.updatedAt,
    contract: buildInvestmentProviderMeta("event_list"),
    items,
    totalCount: res.totalCount,
    displayedCount: items.length,
    hasMore: items.length < res.totalCount,
  }
})
