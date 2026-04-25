import { createHash } from "node:crypto"
import type { EventDetail, InvestmentEventBrief, InvestmentEventDetail } from "@shared/types"
import type { EventProjectionInput, EventProjectionRecord } from "#/database/event-projections"
import { projectInvestmentEventDetail } from "#/services/event-engine/investment-view"

export type ProjectionConsistencyStatus = "ok" | "missing" | "stale"
export type ProjectionRefreshStatus = ProjectionConsistencyStatus | "missing_canonical"

export interface InvestmentProjectionStore {
  upsertProjection: (input: EventProjectionInput) => Promise<void>
  getProjection: (eventId: string) => Promise<EventProjectionRecord | undefined>
}

export interface CanonicalEventDetailStore {
  getEventDetail: (eventId: string) => Promise<EventDetail | undefined>
}

export interface InvestmentProjectionBuildOptions {
  relatedEventIds?: string[]
  watchlistKeys?: string[]
}

export interface ProjectionConsistencyResult {
  eventId: string
  status: ProjectionConsistencyStatus
  expectedChecksum: string
  actualChecksum?: string
  canonicalUpdatedAt: number
  projectionUpdatedAt?: number
}

export interface ProjectionRefreshResult {
  eventId: string
  status: ProjectionRefreshStatus
  expectedChecksum?: string
  actualChecksum?: string
  canonicalUpdatedAt?: number
  projectionUpdatedAt?: number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue)
  }
  if (!isPlainObject(value)) return value

  return Object.keys(value)
    .filter(key => value[key] !== undefined)
    .sort()
    .reduce<Record<string, unknown>>((record, key) => {
      record[key] = stableValue(value[key])
      return record
    }, {})
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value))))
}

function toInvestmentBrief(detail: InvestmentEventDetail): InvestmentEventBrief {
  const {
    thesis: _thesis,
    keyFacts: _keyFacts,
    evidence: _evidence,
    timelineSummary: _timelineSummary,
    watchTargetCandidates: _watchTargetCandidates,
    relatedEvents: _relatedEvents,
    ...brief
  } = detail
  return brief
}

function sortByStableJson<T>(items: T[]) {
  return [...items].sort((a, b) => JSON.stringify(stableValue(a)).localeCompare(JSON.stringify(stableValue(b))))
}

function canonicalChecksumPayload(detail: EventDetail) {
  return {
    event: {
      eventId: detail.eventId,
      title: detail.title,
      summary: detail.summary,
      eventType: detail.eventType,
      eventSubType: detail.eventSubType,
      sourceKind: detail.sourceKind,
      publishedAt: detail.publishedAt,
      ingestedAt: detail.ingestedAt,
      canonicalUrl: detail.canonicalUrl,
      primaryEntityName: detail.primaryEntityName,
      seriesKey: detail.seriesKey,
      periodKey: detail.periodKey,
      releaseCadence: detail.releaseCadence,
      importance: detail.importance,
      sentiment: detail.sentiment,
      directionalView: detail.directionalView,
      directionalConfidence: detail.directionalConfidence,
      materialityScore: detail.materialityScore,
      tradabilityScore: detail.tradabilityScore,
      authorityScore: detail.authorityScore,
      freshnessScore: detail.freshnessScore,
      surpriseScore: detail.surpriseScore,
      affectedMarkets: detail.affectedMarkets,
      impactSummary: detail.impactSummary,
      degraded: detail.degraded,
      latestLifecycleState: detail.latestLifecycleState,
      latestLifecycleAt: detail.latestLifecycleAt,
      topicTags: detail.topicTags,
      evidenceCount: detail.evidenceCount,
      sourceIds: detail.sourceIds,
      watchTargetCandidates: detail.watchTargetCandidates,
    },
    evidences: sortByStableJson(detail.evidences),
    entities: sortByStableJson(detail.entities),
    facts: sortByStableJson(detail.facts),
    timeline: sortByStableJson(detail.timeline),
  }
}

export function computeInvestmentProjectionChecksum(detail: EventDetail) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(canonicalChecksumPayload(detail))))
    .digest("hex")
}

export function getInvestmentProjectionCanonicalUpdatedAt(detail: EventDetail) {
  const timestamps = [
    detail.latestLifecycleAt,
    detail.ingestedAt,
    detail.publishedAt,
    ...detail.evidences.flatMap(evidence => [evidence.fetchedAt, evidence.publishedAt]),
    ...detail.facts.map(fact => fact.effectiveAt),
    ...detail.timeline.map(entry => entry.changedAt),
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  return Math.max(...timestamps, 0)
}

export function buildInvestmentProjectionInput(
  detail: EventDetail,
  options: InvestmentProjectionBuildOptions = {},
): EventProjectionInput {
  const projectedDetail = projectInvestmentEventDetail(detail)
  const indexedEntities = uniqueValues([
    detail.primaryEntityName,
    ...detail.entities.flatMap(entity => [entity.entityName, entity.code, entity.fullCode]),
    ...projectedDetail.affectedEntities.flatMap(entity => [entity.entityId, entity.label, entity.code, entity.market]),
    ...projectedDetail.whoIsAffected,
    ...projectedDetail.relatedTopics,
  ])

  return {
    eventId: detail.eventId,
    canonicalUpdatedAt: getInvestmentProjectionCanonicalUpdatedAt(detail),
    canonicalChecksum: computeInvestmentProjectionChecksum(detail),
    brief: toInvestmentBrief(projectedDetail),
    detail: projectedDetail,
    indexedEntities,
    relatedEventIds: options.relatedEventIds,
    watchlistKeys: options.watchlistKeys,
  }
}

export async function writeInvestmentProjection(
  detail: EventDetail,
  store: InvestmentProjectionStore,
  options: InvestmentProjectionBuildOptions = {},
) {
  const input = buildInvestmentProjectionInput(detail, options)
  await store.upsertProjection(input)
  return input
}

export async function checkInvestmentProjectionConsistency(
  detail: EventDetail,
  store: Pick<InvestmentProjectionStore, "getProjection">,
): Promise<ProjectionConsistencyResult> {
  const expectedChecksum = computeInvestmentProjectionChecksum(detail)
  const canonicalUpdatedAt = getInvestmentProjectionCanonicalUpdatedAt(detail)
  const projection = await store.getProjection(detail.eventId)
  if (!projection) {
    return {
      eventId: detail.eventId,
      status: "missing",
      expectedChecksum,
      canonicalUpdatedAt,
    }
  }
  if (projection.canonicalChecksum !== expectedChecksum) {
    return {
      eventId: detail.eventId,
      status: "stale",
      expectedChecksum,
      actualChecksum: projection.canonicalChecksum,
      canonicalUpdatedAt,
      projectionUpdatedAt: projection.projectionUpdatedAt,
    }
  }
  return {
    eventId: detail.eventId,
    status: "ok",
    expectedChecksum,
    actualChecksum: projection.canonicalChecksum,
    canonicalUpdatedAt,
    projectionUpdatedAt: projection.projectionUpdatedAt,
  }
}

export async function refreshInvestmentProjectionForEvent(
  eventId: string,
  canonicalStore: CanonicalEventDetailStore,
  projectionStore: InvestmentProjectionStore,
  options: InvestmentProjectionBuildOptions = {},
): Promise<ProjectionRefreshResult> {
  const detail = await canonicalStore.getEventDetail(eventId)
  if (!detail) {
    return {
      eventId,
      status: "missing_canonical",
    }
  }

  await writeInvestmentProjection(detail, projectionStore, options)
  return checkInvestmentProjectionConsistency(detail, projectionStore)
}
