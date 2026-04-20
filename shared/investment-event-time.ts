import type { EventSourceKind } from "./event-profile"
import type { EventType } from "./types"

export interface EventTimingLike {
  eventType?: EventType | null
  sourceKind?: EventSourceKind | null
  publishedAt?: number | null
  latestLifecycleAt?: number | null
  ingestedAt?: number | null
}

export const DEFERRED_PUBLISH_GAP_MS = 30 * 60 * 1000

function shouldPreferFirstSeenAnchor(input: EventTimingLike) {
  return !input.publishedAt
    && Boolean(input.ingestedAt)
    && input.eventType === "market_move"
    && input.sourceKind === "media_fast_feed"
}

function getObservationAnchor(input: EventTimingLike) {
  if (shouldPreferFirstSeenAnchor(input))
    return input.ingestedAt ?? input.latestLifecycleAt
  return input.latestLifecycleAt ?? input.ingestedAt
}

export function isDeferredPublication(input: EventTimingLike, now = Date.now()) {
  if (!input.publishedAt) return false

  const observationAnchor = getObservationAnchor(input)
  if (!observationAnchor) return false

  return input.publishedAt > now && input.publishedAt - observationAnchor >= DEFERRED_PUBLISH_GAP_MS
}

export function getPrimaryEventTimestamp(input: EventTimingLike, now = Date.now()) {
  if (isDeferredPublication(input, now)) {
    return getObservationAnchor(input) ?? input.publishedAt ?? now
  }

  return input.publishedAt ?? getObservationAnchor(input) ?? now
}

export function getPrimaryEventTimestampLabel(input: EventTimingLike, now = Date.now()) {
  if (isDeferredPublication(input, now)) return "识别时间"
  if (!input.publishedAt && getObservationAnchor(input)) return "识别时间"
  return "发布时间"
}

export function getObservedEventTimestampFallback(input: EventTimingLike, now = Date.now()) {
  const observationAnchor = getObservationAnchor(input)
  if (!input.publishedAt || !observationAnchor) return undefined
  if (isDeferredPublication(input, now)) return undefined
  if (input.publishedAt - observationAnchor < DEFERRED_PUBLISH_GAP_MS) return undefined
  return observationAnchor
}

export function getDeferredPublishedTimestampFallback(input: EventTimingLike, now = Date.now()) {
  if (!isDeferredPublication(input, now)) return undefined
  return input.publishedAt ?? undefined
}
