import type { AffectedMarket, DirectionalView } from "@shared/event-profile"
import { getPrimaryEventTimestamp } from "@shared/investment-event-time"
import { consola } from "consola"
import type {
  EventSubType,
  EventType,
  InvestmentActionBucket,
  InvestmentEntityRef,
  InvestmentEventBrief,
  InvestmentEventDetail,
  InvestmentEventFamily,
  InvestmentRelatedEventsSection,
  InvestmentWatchlistDetail,
  SourceID,
  WatchlistQuery,
  WatchlistRecord,
} from "@shared/types"
import type { EventProjectionQueryOptions, EventProjectionRecord, EventQueryIndexName } from "#/database/event-projections"
import type { CanonicalEventDetailStore, CausalProjectionStore, InvestmentProjectionStore } from "#/services/event-engine/projection-pipeline"
import {
  getInvestmentEventFamilyLabel,
  getInvestmentRelatedSectionDisplayLabel,
} from "#/services/event-engine/investment-view"
import { type InvestmentScanFocus, getInvestmentScanFocusActionBuckets } from "#/services/event-engine/investment-filters"
import { refreshInvestmentProjectionForEvent } from "#/services/event-engine/projection-pipeline"

export interface InvestmentProjectionQueryStore {
  getProjection: (eventId: string) => Promise<EventProjectionRecord | undefined>
  listProjections: (options: EventProjectionQueryOptions) => Promise<EventProjectionRecord[]>
  countProjections: (options: EventProjectionQueryOptions) => Promise<number>
}

interface CanonicalProjectionRepairQueryOptions extends InvestmentBaseQueryOptions {
  q?: string
  entity?: string
  limit: number
  scanLimit?: number
}

type InvestmentProjectionQueryOptions = EventProjectionQueryOptions & {
  focus?: InvestmentScanFocus
  includeTotalCount?: boolean
}

type CausalProjectionStoreInput = CausalProjectionStore | (() => Promise<CausalProjectionStore | undefined>)

export interface CanonicalProjectionRepairStore extends CanonicalEventDetailStore {
  listEvents: (options: CanonicalProjectionRepairQueryOptions) => Promise<Array<{ eventId: string }>>
}

function getInvestmentQueryLogger() {
  return (globalThis as typeof globalThis & {
    logger?: Pick<typeof consola, "warn">
  }).logger ?? consola.withTag("investment-query")
}

export interface InvestmentQueryResult {
  updatedAt: number
  items: InvestmentEventBrief[]
  totalCount: number
}

interface InvestmentBaseQueryOptions {
  limit?: number
  scanLimit?: number
  eventFamily?: InvestmentEventFamily
  focus?: InvestmentScanFocus
  eventType?: EventType
  eventSubType?: EventSubType
  sourceId?: SourceID
  sourceIds?: SourceID[]
  topic?: string
  market?: AffectedMarket
  directionalView?: DirectionalView
  minMaterialityScore?: number
  minAuthorityScore?: number
  changedSince?: number
  lifecycleAfter?: number
  seriesKey?: string
  periodKey?: string
  sortBy?: "latest" | "investment" | "changed"
  includeTotalCount?: boolean
}

export interface InvestmentRelatedEventsOptions {
  limitPerSection?: number
  sortBy?: "latest" | "investment"
}

export interface InvestmentEventDetailQueryOptions extends InvestmentRelatedEventsOptions {
  includeRelatedEvents?: boolean
}

export interface InvestmentSearchQueryOptions extends Omit<InvestmentBaseQueryOptions, "eventType" | "eventSubType" | "sourceId" | "sourceIds" | "topic"> {
  q: string
}

export interface InvestmentEntityQueryOptions extends Omit<InvestmentBaseQueryOptions, "eventType" | "eventSubType" | "sourceId" | "topic"> {
  entity: string
}

type RelatedEventsSectionContext = InvestmentRelatedEventsSection["context"]

interface RelatedEventLookupPlan {
  limitPerSection: number
  queryLimit: number
  sortBy: NonNullable<InvestmentRelatedEventsOptions["sortBy"]>
  primaryEntityLabel?: string
  primaryEntityLookup?: string
  primaryTopic?: string
  primaryMarket?: AffectedMarket
  familyLabel: string
}

interface RelatedEventLookupResults {
  indexedRelated: EventProjectionRecord[]
  entityItems: InvestmentEventBrief[]
  topicItems: InvestmentEventBrief[]
  marketItems: InvestmentEventBrief[]
  familyItems: InvestmentEventBrief[]
}

interface RelatedSectionInput {
  context: RelatedEventsSectionContext
  label?: string
  items: InvestmentEventBrief[]
}

export interface RelatedEventsFanoutDiagnostics {
  relatedQueryCount: number
  relatedScanLimit: number
}

function normalizeLimit(limit?: number) {
  if (!Number.isFinite(limit)) return 20
  return Math.min(Math.max(Math.floor(limit as number), 1), 400)
}

function normalizeScanLimit(scanLimit: number | undefined, limit: number) {
  if (!Number.isFinite(scanLimit)) return Math.min(Math.max(limit * 12, 120), 1000)
  return Math.min(Math.max(Math.floor(scanLimit as number), limit), 2000)
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function normalizeTextList(values?: string[]) {
  return values?.map(value => normalizeText(value)).filter(Boolean) ?? []
}

function uniqueValues<T extends string>(values: T[]) {
  return Array.from(new Set(values))
}

function hasAnyMatch(candidates: string[], expected?: string[]) {
  const normalizedExpected = normalizeTextList(expected)
  if (!normalizedExpected.length) return true
  const normalizedCandidates = new Set(normalizeTextList(candidates))
  return normalizedExpected.some(value => normalizedCandidates.has(value))
}

function collectEntityKeys(entity?: InvestmentEntityRef) {
  return [
    entity?.entityId,
    entity?.label,
    entity?.code,
    entity?.market,
  ].filter((value): value is string => Boolean(value))
}

function collectBriefEntityKeys(brief: InvestmentEventBrief) {
  return [
    ...brief.affectedEntities.flatMap(collectEntityKeys),
    ...collectEntityKeys(brief.primarySubject),
    ...brief.whoIsAffected,
    brief.subjectSummary,
  ]
}

function matchesWatchlistQuery(record: EventProjectionRecord, query: WatchlistQuery) {
  const brief = record.brief

  if (!hasAnyMatch(collectBriefEntityKeys(brief), query.entities)) return false
  if (!hasAnyMatch(brief.relatedTopics, query.topics)) return false
  if (query.eventTypes?.length && (!record.eventType || !query.eventTypes.includes(record.eventType))) return false
  if (query.eventSubTypes?.length && (!record.eventSubType || !query.eventSubTypes.includes(record.eventSubType))) return false
  if (!hasAnyMatch(record.sourceIds, query.sourceIds)) return false
  if (query.markets?.length && !brief.affectedMarkets.some(market => query.markets?.includes(market))) return false
  if (query.directionalViews?.length && !query.directionalViews.includes(brief.signalDirection)) return false
  if (query.minMaterialityScore !== undefined && brief.materialityScore < query.minMaterialityScore) return false
  if (query.minAuthorityScore !== undefined && brief.authorityScore < query.minAuthorityScore) return false
  return true
}

function toResult(records: EventProjectionRecord[], totalCount: number): InvestmentQueryResult {
  return {
    updatedAt: Date.now(),
    items: records.map(record => record.brief),
    totalCount,
  }
}

function needsDetailContractRepair(detail: InvestmentEventDetail) {
  const rawDetail = detail as Partial<InvestmentEventDetail>
  if (!rawDetail.causalStatus) return true
  if (!Array.isArray(rawDetail.causalHypotheses)) return true
  return detail.keyFacts.some(fact => !("factId" in fact))
}

function getInvestmentRankScore(brief: InvestmentEventBrief) {
  return (brief.materialityScore * 0.4) + (brief.tradabilityScore * 0.35) + (brief.authorityScore * 0.25)
}

function getLatestSortTime(record: EventProjectionRecord) {
  return getPrimaryEventTimestamp({
    eventType: record.eventType,
    sourceKind: record.sourceKind,
    publishedAt: record.brief.publishedAt,
    latestLifecycleAt: record.brief.latestLifecycleAt,
    ingestedAt: record.brief.ingestedAt,
  })
}

function sortProjectionRecords(records: EventProjectionRecord[], sortBy: InvestmentBaseQueryOptions["sortBy"]) {
  const mode = sortBy ?? "investment"
  return [...records].sort((a, b) => {
    if (mode === "latest") {
      const latestDiff = getLatestSortTime(b) - getLatestSortTime(a)
      if (latestDiff !== 0) return latestDiff
      return (b.brief.latestLifecycleAt ?? b.brief.ingestedAt ?? 0) - (a.brief.latestLifecycleAt ?? a.brief.ingestedAt ?? 0)
    }
    if (mode === "changed") {
      const changedDiff = (b.brief.latestLifecycleAt ?? b.brief.publishedAt ?? b.brief.ingestedAt ?? 0)
        - (a.brief.latestLifecycleAt ?? a.brief.publishedAt ?? a.brief.ingestedAt ?? 0)
      if (changedDiff !== 0) return changedDiff
      return (b.brief.publishedAt ?? b.brief.ingestedAt ?? 0) - (a.brief.publishedAt ?? a.brief.ingestedAt ?? 0)
    }
    const scoreDiff = getInvestmentRankScore(b.brief) - getInvestmentRankScore(a.brief)
    if (scoreDiff !== 0) return scoreDiff
    return (b.brief.latestLifecycleAt ?? b.brief.publishedAt ?? b.brief.ingestedAt ?? 0)
      - (a.brief.latestLifecycleAt ?? a.brief.publishedAt ?? a.brief.ingestedAt ?? 0)
  })
}

type RepairableProjectionStore = InvestmentProjectionQueryStore & InvestmentProjectionStore

function isRepairableProjectionStore(store: InvestmentProjectionQueryStore): store is RepairableProjectionStore {
  return typeof (store as Partial<InvestmentProjectionStore>).upsertProjection === "function"
}

function normalizeActionBuckets(
  actionBuckets: InvestmentActionBucket[] | undefined,
  focus?: InvestmentScanFocus,
) {
  return getInvestmentScanFocusActionBuckets(focus) ?? actionBuckets
}

function toProjectionQueryOptions(options: InvestmentProjectionQueryOptions): EventProjectionQueryOptions {
  const { includeTotalCount: _includeTotalCount, focus, actionBuckets, ...projectionOptions } = options
  const normalizedActionBuckets = normalizeActionBuckets(actionBuckets, focus)
  return normalizedActionBuckets?.length
    ? { ...projectionOptions, actionBuckets: normalizedActionBuckets }
    : projectionOptions
}

function buildWatchlistIndexSeeds(query: WatchlistQuery) {
  const seeds: Array<{ indexName: EventQueryIndexName, indexValue: string }> = [
    ...normalizeTextList(query.entities).map(indexValue => ({ indexName: "entity" as const, indexValue })),
    ...uniqueValues(query.topics?.map(value => value.trim()).filter(Boolean) ?? []).map(indexValue => ({ indexName: "topic" as const, indexValue })),
    ...uniqueValues(query.sourceIds?.map(value => value.trim()).filter(Boolean) ?? []).map(indexValue => ({ indexName: "source" as const, indexValue })),
    ...uniqueValues(query.markets ?? []).map(indexValue => ({ indexName: "market" as const, indexValue })),
  ]
  const seen = new Set<string>()
  return seeds.filter((seed) => {
    const key = `${seed.indexName}:${seed.indexValue}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildWatchlistProjectionFilters(query: WatchlistQuery): Partial<EventProjectionQueryOptions> {
  return {
    eventType: query.eventTypes?.length === 1 ? query.eventTypes[0] : undefined,
    eventSubType: query.eventSubTypes?.length === 1 ? query.eventSubTypes[0] : undefined,
    sourceIds: query.sourceIds?.length ? query.sourceIds : undefined,
    topic: query.topics?.length === 1 ? query.topics[0] : undefined,
    market: query.markets?.length === 1 ? query.markets[0] : undefined,
    directionalView: query.directionalViews?.length === 1 ? query.directionalViews[0] : undefined,
    minMaterialityScore: query.minMaterialityScore,
    minAuthorityScore: query.minAuthorityScore,
  }
}

function buildRelatedEventLookups(
  detail: InvestmentEventDetail,
  options: InvestmentRelatedEventsOptions,
): RelatedEventLookupPlan {
  const limitPerSection = Math.min(Math.max(Math.floor(options.limitPerSection ?? 4), 1), 12)
  const primaryEntity = detail.primarySubject ?? detail.affectedEntities[0]

  return {
    limitPerSection,
    queryLimit: Math.max(limitPerSection + 2, 6),
    sortBy: options.sortBy ?? "investment",
    primaryEntityLabel: primaryEntity?.label,
    primaryEntityLookup: primaryEntity ? collectEntityKeys(primaryEntity).find(Boolean) : undefined,
    primaryTopic: detail.relatedTopics[0],
    primaryMarket: detail.affectedMarkets[0],
    familyLabel: getInvestmentEventFamilyLabel(detail.eventFamily),
  }
}

export function getRelatedEventsFanoutDiagnostics(
  detail: InvestmentEventDetail,
  options: InvestmentRelatedEventsOptions = {},
): RelatedEventsFanoutDiagnostics {
  const plan = buildRelatedEventLookups(detail, options)
  const relatedQueryCount = [
    true,
    plan.primaryEntityLookup,
    plan.primaryTopic,
    plan.primaryMarket,
    true,
  ].filter(Boolean).length

  return {
    relatedQueryCount,
    relatedScanLimit: relatedQueryCount * plan.queryLimit,
  }
}

function buildRelatedSectionLabel(context: RelatedEventsSectionContext, label: string) {
  return getInvestmentRelatedSectionDisplayLabel(context, label)
}

function appendDistinctRelatedSection(
  sections: InvestmentRelatedEventsSection[],
  seen: Set<string>,
  limitPerSection: number,
  input: RelatedSectionInput,
) {
  if (!input.label) return
  const filtered: InvestmentEventBrief[] = []
  for (const item of input.items) {
    if (seen.has(item.eventId)) continue
    seen.add(item.eventId)
    filtered.push(item)
    if (filtered.length >= limitPerSection) break
  }
  if (!filtered.length) return
  sections.push({
    context: input.context,
    label: input.label,
    displayLabel: buildRelatedSectionLabel(input.context, input.label),
    items: filtered,
  })
}

export class InvestmentQueryService {
  constructor(
    private readonly store: InvestmentProjectionQueryStore,
    private readonly canonicalStore?: CanonicalProjectionRepairStore,
    private readonly causalProjectionStore?: CausalProjectionStoreInput,
  ) {}

  async listLatestEvents(options: InvestmentBaseQueryOptions = {}): Promise<InvestmentQueryResult> {
    return this.query({
      ...options,
      indexName: "latest",
      indexValue: "all",
      limit: normalizeLimit(options.limit),
    })
  }

  async searchEvents(options: InvestmentSearchQueryOptions): Promise<InvestmentQueryResult> {
    const q = normalizeText(options.q)
    if (!q) return toResult([], 0)

    const limit = normalizeLimit(options.limit)
    const queryOptions: InvestmentProjectionQueryOptions = {
      ...options,
      indexName: "latest" as const,
      indexValue: "all",
      q,
      limit,
    }
    let result = await this.query(queryOptions)
    if (result.items.length < limit) {
      const repairLimit = normalizeScanLimit(options.scanLimit, limit)
      const repaired = await this.repairProjectionsForCanonicalMatches({
        ...options,
        q,
        limit: repairLimit,
        scanLimit: repairLimit,
      }, new Set(result.items.map(item => item.eventId)))
      if (repaired > 0) {
        result = await this.query(queryOptions)
      }
    }
    return result
  }

  async getEntityEvents(options: InvestmentEntityQueryOptions): Promise<InvestmentQueryResult> {
    const entity = normalizeText(options.entity)
    if (!entity) return toResult([], 0)

    const limit = normalizeLimit(options.limit)
    const queryOptions: InvestmentProjectionQueryOptions = {
      ...options,
      indexName: "entity" as const,
      indexValue: entity,
      limit,
    }
    let result = await this.query(queryOptions)
    if (result.items.length < limit) {
      const repairLimit = normalizeScanLimit(options.scanLimit, limit)
      const repaired = await this.repairProjectionsForCanonicalMatches({
        ...options,
        entity,
        limit: repairLimit,
        scanLimit: repairLimit,
      }, new Set(result.items.map(item => item.eventId)))
      if (repaired > 0) {
        result = await this.query(queryOptions)
      }
    }
    return result
  }

  async getEventDetail(eventId: string, options: InvestmentEventDetailQueryOptions = {}): Promise<InvestmentEventDetail | undefined> {
    let projection = await this.store.getProjection(eventId)
    if (!projection?.detail || needsDetailContractRepair(projection.detail)) {
      await this.repairProjectionForEvent(eventId)
      projection = await this.store.getProjection(eventId)
    }
    if (!projection?.detail) return undefined

    if (options.includeRelatedEvents === false) return projection.detail

    return {
      ...projection.detail,
      relatedEvents: await this.getRelatedEvents(projection.detail, options),
    }
  }

  async getWatchlistEvents(query: WatchlistQuery, options: InvestmentBaseQueryOptions = {}): Promise<InvestmentQueryResult> {
    const limit = normalizeLimit(options.limit)
    const scanLimit = normalizeScanLimit(options.scanLimit, limit)
    const seeds = buildWatchlistIndexSeeds(query)
    const projectionFilters = buildWatchlistProjectionFilters(query)
    const seedQueries = seeds.length
      ? seeds
      : [{ indexName: "latest" as const, indexValue: "all" }]
    const recordsByEventId = new Map<string, EventProjectionRecord>()

    for (const seed of seedQueries) {
      const records = await this.store.listProjections(toProjectionQueryOptions({
        ...options,
        ...projectionFilters,
        ...seed,
        limit: scanLimit,
        sortBy: options.sortBy ?? "investment",
      }))
      for (const record of records) {
        if (matchesWatchlistQuery(record, query)) {
          recordsByEventId.set(record.eventId, record)
        }
      }
    }

    const matched = sortProjectionRecords([...recordsByEventId.values()], options.sortBy)
    const items = matched.slice(0, limit)

    return toResult(items, matched.length)
  }

  async getWatchlistDetail(record: WatchlistRecord, options: InvestmentBaseQueryOptions = {}): Promise<InvestmentWatchlistDetail> {
    const res = await this.getWatchlistEvents(record.query, options)
    return {
      ...record,
      recentEvents: res.items,
      lastCheckedAt: Date.now(),
    }
  }

  async getRelatedEvents(detail: InvestmentEventDetail, options: InvestmentRelatedEventsOptions = {}): Promise<InvestmentRelatedEventsSection[]> {
    const plan = buildRelatedEventLookups(detail, options)
    const results = await this.executeRelatedEventLookups(detail, plan)
    return this.buildRelatedEventSections(detail, plan, results)
  }

  private async executeRelatedEventLookups(
    detail: InvestmentEventDetail,
    plan: RelatedEventLookupPlan,
  ): Promise<RelatedEventLookupResults> {
    const [indexedRelated, entityResult, topicResult, marketResult, familyResult] = await Promise.all([
      this.store.listProjections({
        indexName: "related",
        indexValue: detail.eventId,
        limit: plan.queryLimit,
        sortBy: plan.sortBy,
      }),
      plan.primaryEntityLookup
        ? this.getEntityEvents({
            entity: plan.primaryEntityLookup,
            limit: plan.queryLimit,
            sortBy: plan.sortBy,
            includeTotalCount: false,
          })
        : Promise.resolve(null),
      plan.primaryTopic
        ? this.listLatestEvents({
            topic: plan.primaryTopic,
            limit: plan.queryLimit,
            sortBy: plan.sortBy,
            includeTotalCount: false,
          })
        : Promise.resolve(null),
      plan.primaryMarket
        ? this.listLatestEvents({
            market: plan.primaryMarket,
            limit: plan.queryLimit,
            sortBy: plan.sortBy,
            includeTotalCount: false,
          })
        : Promise.resolve(null),
      this.listLatestEvents({
        eventFamily: detail.eventFamily,
        limit: plan.queryLimit,
        sortBy: plan.sortBy,
        includeTotalCount: false,
      }),
    ])

    return {
      indexedRelated,
      entityItems: entityResult?.items ?? [],
      topicItems: topicResult?.items ?? [],
      marketItems: marketResult?.items ?? [],
      familyItems: familyResult.items,
    }
  }

  private buildRelatedEventSections(
    detail: InvestmentEventDetail,
    plan: RelatedEventLookupPlan,
    results: RelatedEventLookupResults,
  ) {
    const seen = new Set<string>([detail.eventId])
    const sections: InvestmentRelatedEventsSection[] = []

    appendDistinctRelatedSection(sections, seen, plan.limitPerSection, {
      context: "entity",
      label: plan.primaryEntityLabel,
      items: [
        ...results.indexedRelated.map(record => record.brief),
        ...results.entityItems,
      ],
    })
    appendDistinctRelatedSection(sections, seen, plan.limitPerSection, {
      context: "topic",
      label: plan.primaryTopic,
      items: results.topicItems,
    })
    appendDistinctRelatedSection(sections, seen, plan.limitPerSection, {
      context: "market",
      label: plan.primaryMarket,
      items: results.marketItems,
    })
    appendDistinctRelatedSection(sections, seen, plan.limitPerSection, {
      context: "family",
      label: plan.familyLabel,
      items: results.familyItems,
    })

    return sections
  }

  private async query(options: InvestmentProjectionQueryOptions) {
    const projectionOptions = toProjectionQueryOptions(options)
    const records = await this.store.listProjections(projectionOptions)
    const totalCount = options.includeTotalCount === false
      ? records.length
      : await this.store.countProjections(projectionOptions)
    return toResult(records, totalCount)
  }

  private async repairProjectionsForCanonicalMatches(
    options: CanonicalProjectionRepairQueryOptions,
    projectedEventIds: ReadonlySet<string>,
  ) {
    if (!this.canonicalStore || !isRepairableProjectionStore(this.store)) return 0

    const candidates = await this.canonicalStore.listEvents(options)
    let repaired = 0
    for (const candidate of candidates) {
      if (projectedEventIds.has(candidate.eventId)) continue
      let result
      try {
        result = await refreshInvestmentProjectionForEvent(candidate.eventId, this.canonicalStore, this.store, {
          causalProjectionStore: await this.getCausalProjectionStore(),
        })
      } catch (error) {
        getInvestmentQueryLogger().warn(`failed to repair investment projection for ${candidate.eventId}`, error)
        continue
      }
      if (result.status !== "missing_canonical") {
        repaired += 1
      }
    }
    return repaired
  }

  private async repairProjectionForEvent(eventId: string) {
    if (!this.canonicalStore || !isRepairableProjectionStore(this.store)) return false
    const result = await refreshInvestmentProjectionForEvent(eventId, this.canonicalStore, this.store, {
      causalProjectionStore: await this.getCausalProjectionStore(),
    })
    return result.status !== "missing_canonical"
  }

  private async getCausalProjectionStore() {
    if (typeof this.causalProjectionStore === "function") return this.causalProjectionStore()
    return this.causalProjectionStore
  }
}
