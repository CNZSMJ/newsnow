import type {
  AffectedMarket,
  DirectionalView,
} from "@shared/event-profile"
import type {
  InvestmentEventBrief,
  InvestmentEventFamily,
  InvestmentProviderEventListResponse,
} from "@shared/types"
import type { InvestmentScanFocus } from "#/services/event-engine/investment-filters"
import { buildInvestmentProviderMeta } from "#/services/event-engine/provider"

export interface InvestmentListQueryOptions {
  limit: number
  focus: InvestmentScanFocus
  eventFamily?: InvestmentEventFamily
  minMaterialityScore?: number
  minAuthorityScore?: number
  changedSince?: number
  lifecycleAfter?: number
  market?: AffectedMarket
  directionalView?: DirectionalView
  seriesKey?: string
  periodKey?: string
  sortBy: "changed" | "latest" | "investment"
}

export interface InvestmentListQueryResult {
  updatedAt: number
  items: InvestmentEventBrief[]
  totalCount: number
}

export function parseTimestampQuery(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== "string") return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) return numeric

  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? undefined : parsed
}

export function resolveLifecycleAfter(query: Record<string, unknown>) {
  return parseTimestampQuery(query.lifecycle_after) ?? parseTimestampQuery(query.changed_since)
}

export function parseInvestmentSort(query: Record<string, unknown>) {
  if (query.sort === "changed") return "changed" as const
  if (query.sort === "latest") return "latest" as const
  if (query.sort === "investment") return "investment" as const
  if (query.latest === "true") return "latest" as const
  return "investment" as const
}

export function parseInvestmentListQuery(query: Record<string, unknown>): InvestmentListQueryOptions {
  const limit = Number(query.limit ?? 20)
  const minMaterialityScore = Number(query.min_materiality_score)
  const minAuthorityScore = Number(query.min_authority_score)

  return {
    limit: Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 400),
    focus: typeof query.focus === "string" ? query.focus as InvestmentScanFocus : "all",
    eventFamily: typeof query.event_family === "string" ? query.event_family as InvestmentEventFamily : undefined,
    minMaterialityScore: Number.isNaN(minMaterialityScore) ? undefined : minMaterialityScore,
    minAuthorityScore: Number.isNaN(minAuthorityScore) ? undefined : minAuthorityScore,
    changedSince: parseTimestampQuery(query.changed_since),
    lifecycleAfter: resolveLifecycleAfter(query),
    market: typeof query.market === "string" ? query.market as AffectedMarket : undefined,
    directionalView: typeof query.directional_view === "string" ? query.directional_view as DirectionalView : undefined,
    seriesKey: typeof query.series_key === "string" ? query.series_key.trim() || undefined : undefined,
    periodKey: typeof query.period_key === "string" ? query.period_key.trim() || undefined : undefined,
    sortBy: parseInvestmentSort(query),
  }
}

export function buildInvestmentListResponse(
  result: InvestmentListQueryResult,
): InvestmentProviderEventListResponse {
  return {
    status: "success",
    updatedTime: result.updatedAt,
    contract: buildInvestmentProviderMeta("event_list"),
    items: result.items,
    totalCount: result.totalCount,
    displayedCount: result.items.length,
    hasMore: result.items.length < result.totalCount,
  }
}
