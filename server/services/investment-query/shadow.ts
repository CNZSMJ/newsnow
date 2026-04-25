import type { EventRecord, InvestmentEventBrief } from "@shared/types"
import { projectInvestmentEventBrief } from "#/services/event-engine/investment-view"
import type { InvestmentQueryResult } from "#/services/investment-query/service"

export interface InvestmentQueryShadowComparison {
  status: "match" | "diff"
  projectionCount: number
  canonicalCount: number
  totalCountDelta: number
  missingFromProjection: string[]
  extraInProjection: string[]
}

export interface InvestmentQueryShadowInput {
  projection: InvestmentQueryResult
  canonical: {
    items: EventRecord[]
    totalCount: number
  }
}

function eventIds(items: Array<InvestmentEventBrief | EventRecord>) {
  return items.map(item => item.eventId)
}

export function compareInvestmentQueryShadow(input: InvestmentQueryShadowInput): InvestmentQueryShadowComparison {
  const projectionIds = new Set(eventIds(input.projection.items))
  const canonicalBriefs = input.canonical.items.map(projectInvestmentEventBrief)
  const canonicalIds = new Set(eventIds(canonicalBriefs))
  const missingFromProjection = [...canonicalIds].filter(eventId => !projectionIds.has(eventId))
  const extraInProjection = [...projectionIds].filter(eventId => !canonicalIds.has(eventId))

  return {
    status: missingFromProjection.length || extraInProjection.length ? "diff" : "match",
    projectionCount: input.projection.items.length,
    canonicalCount: canonicalBriefs.length,
    totalCountDelta: input.projection.totalCount - input.canonical.totalCount,
    missingFromProjection,
    extraInProjection,
  }
}

export async function runInvestmentQueryShadowValidation(input: {
  projectionQuery: () => Promise<InvestmentQueryResult>
  canonicalQuery: () => Promise<{ items: EventRecord[], totalCount: number }>
}) {
  const [projection, canonical] = await Promise.all([
    input.projectionQuery(),
    input.canonicalQuery(),
  ])
  return compareInvestmentQueryShadow({
    projection,
    canonical,
  })
}
