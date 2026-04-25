import type {
  AffectedMarket,
  DirectionalView,
} from "@shared/event-profile"
import type {
  InvestmentEventFamily,
  InvestmentProviderEventListResponse,
} from "@shared/types"
import { type InvestmentScanFocus, filterInvestmentBriefsByFocus } from "#/services/event-engine/investment-filters"
import { matchesInvestmentEventFamily } from "#/services/event-engine/investment-view"
import { buildInvestmentProviderMeta } from "#/services/event-engine/provider"
import { getInvestmentQueryService } from "#/services/investment-query/factory"

function parseTimestampQuery(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== "string") return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) return numeric

  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? undefined : parsed
}

function resolveLifecycleAfter(query: Record<string, unknown>) {
  return parseTimestampQuery(query.lifecycle_after) ?? parseTimestampQuery(query.changed_since)
}

function resolveSort(query: Record<string, unknown>) {
  if (query.sort === "changed") return "changed" as const
  if (query.sort === "latest") return "latest" as const
  if (query.sort === "investment") return "investment" as const
  if (query.latest === "true") return "latest" as const
  return "investment" as const
}

export default defineEventHandler(async (event): Promise<InvestmentProviderEventListResponse> => {
  const query = getQuery(event) as Record<string, unknown>
  const limit = Number(query.limit ?? 20)
  const q = typeof query.q === "string" ? query.q.trim() : ""
  if (!q) {
    throw createError({
      statusCode: 400,
      message: "Missing q",
    })
  }

  const focus = typeof query.focus === "string" ? query.focus as InvestmentScanFocus : "all"
  const eventFamily = typeof query.event_family === "string" ? query.event_family as InvestmentEventFamily : undefined
  const minMaterialityScore = Number(query.min_materiality_score)
  const minAuthorityScore = Number(query.min_authority_score)
  const lifecycleAfter = resolveLifecycleAfter(query)

  const investmentQueryService = await getInvestmentQueryService()
  const res = investmentQueryService
    ? await investmentQueryService.searchEvents({
      q,
      limit: Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 400),
      market: typeof query.market === "string" ? query.market as AffectedMarket : undefined,
      directionalView: typeof query.directional_view === "string" ? query.directional_view as DirectionalView : undefined,
      minMaterialityScore: Number.isNaN(minMaterialityScore) ? undefined : minMaterialityScore,
      minAuthorityScore: Number.isNaN(minAuthorityScore) ? undefined : minAuthorityScore,
      changedSince: parseTimestampQuery(query.changed_since),
      lifecycleAfter,
      seriesKey: typeof query.series_key === "string" ? query.series_key.trim() || undefined : undefined,
      periodKey: typeof query.period_key === "string" ? query.period_key.trim() || undefined : undefined,
      sortBy: resolveSort(query),
    })
    : { updatedAt: Date.now(), items: [], totalCount: 0 }

  const items = filterInvestmentBriefsByFocus(
    res.items
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
