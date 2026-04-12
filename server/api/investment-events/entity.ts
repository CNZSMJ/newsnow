import type {
  AffectedMarket,
  DirectionalView,
} from "@shared/event-profile"
import type {
  InvestmentEventFamily,
  InvestmentProviderEventListResponse,
} from "@shared/types"
import { getEntityEvents } from "#/services/event-engine/query"
import { filterInvestmentBriefsByFocus, type InvestmentScanFocus } from "#/services/event-engine/investment-filters"
import { matchesInvestmentEventFamily, projectInvestmentEventBrief } from "#/services/event-engine/investment-view"
import { buildInvestmentProviderMeta } from "#/services/event-engine/provider"

export default defineEventHandler(async (event): Promise<InvestmentProviderEventListResponse> => {
  const query = getQuery(event)
  const entity = typeof query.entity === "string" ? query.entity.trim() : ""
  if (!entity) {
    throw createError({
      statusCode: 400,
      message: "Missing entity",
    })
  }

  const limit = Number(query.limit ?? 20)
  const focus = typeof query.focus === "string" ? query.focus as InvestmentScanFocus : "all"
  const eventFamily = typeof query.event_family === "string" ? query.event_family as InvestmentEventFamily : undefined
  const minMaterialityScore = Number(query.min_materiality_score)
  const minAuthorityScore = Number(query.min_authority_score)

  const res = await getEntityEvents({
    entity,
    limit: Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 400),
    latest: query.latest !== "false",
    sortBy: query.sort === "latest" ? "latest" : "investment",
    market: typeof query.market === "string" ? query.market as AffectedMarket : undefined,
    directionalView: typeof query.directional_view === "string" ? query.directional_view as DirectionalView : undefined,
    minMaterialityScore: Number.isNaN(minMaterialityScore) ? undefined : minMaterialityScore,
    minAuthorityScore: Number.isNaN(minAuthorityScore) ? undefined : minAuthorityScore,
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
