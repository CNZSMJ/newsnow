import type { EventRecord } from "@shared/types"

function getLifecycleBoost(event: EventRecord, options?: {
  confirmed?: number
  updated?: number
  detected?: number
}) {
  const weights = {
    confirmed: 22,
    updated: 12,
    detected: 8,
    ...options,
  }
  switch (event.latestLifecycleState) {
    case "confirmed":
      return weights.confirmed
    case "updated":
      return weights.updated
    case "detected":
      return weights.detected
    default:
      return 0
  }
}

function getDirectionalBoost(event: EventRecord, divisor = 10) {
  if (!event.directionalView || event.directionalView === "unknown" || event.directionalView === "mixed") return 0
  return Math.round((event.directionalConfidence ?? 0) / divisor)
}

export function getEventRecencyAnchor(event: EventRecord) {
  return event.latestLifecycleAt ?? event.publishedAt ?? event.ingestedAt
}

export function scoreInvestmentEvent(event: EventRecord, options?: {
  lifecycle?: {
    confirmed?: number
    updated?: number
    detected?: number
  }
  directionalDivisor?: number
  materialityWeight?: number
  tradabilityWeight?: number
  authorityWeight?: number
  freshnessWeight?: number
  surpriseWeight?: number
}) {
  const materialityWeight = options?.materialityWeight ?? 0.42
  const tradabilityWeight = options?.tradabilityWeight ?? 0.2
  const authorityWeight = options?.authorityWeight ?? 0.14
  const freshnessWeight = options?.freshnessWeight ?? 0.1
  const surpriseWeight = options?.surpriseWeight ?? 0.06

  return (event.materialityScore ?? 0) * materialityWeight
    + (event.tradabilityScore ?? 0) * tradabilityWeight
    + (event.authorityScore ?? 0) * authorityWeight
    + (event.freshnessScore ?? 0) * freshnessWeight
    + (event.surpriseScore ?? 0) * surpriseWeight
    + getLifecycleBoost(event, options?.lifecycle)
    + getDirectionalBoost(event, options?.directionalDivisor ?? 10)
}
