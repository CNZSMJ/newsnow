import type { AffectedMarket, DirectionalView } from "@shared/event-profile"
import type {
  EventSubType,
  EventType,
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
import type { EventProjectionQueryOptions, EventProjectionRecord } from "#/database/event-projections"
import {
  getInvestmentEventFamilyLabel,
  getInvestmentRelatedSectionDisplayLabel,
} from "#/services/event-engine/investment-view"

export interface InvestmentProjectionQueryStore {
  getProjection: (eventId: string) => Promise<EventProjectionRecord | undefined>
  listProjections: (options: EventProjectionQueryOptions) => Promise<EventProjectionRecord[]>
  countProjections: (options: EventProjectionQueryOptions) => Promise<number>
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

export class InvestmentQueryService {
  constructor(private readonly store: InvestmentProjectionQueryStore) {}

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

    return this.query({
      ...options,
      q,
      limit: normalizeLimit(options.limit),
    })
  }

  async getEntityEvents(options: InvestmentEntityQueryOptions): Promise<InvestmentQueryResult> {
    const entity = normalizeText(options.entity)
    if (!entity) return toResult([], 0)

    return this.query({
      ...options,
      indexName: "entity",
      indexValue: entity,
      limit: normalizeLimit(options.limit),
    })
  }

  async getEventDetail(eventId: string, options: InvestmentEventDetailQueryOptions = {}): Promise<InvestmentEventDetail | undefined> {
    const projection = await this.store.getProjection(eventId)
    if (!projection?.detail) return undefined

    if (options.includeRelatedEvents === false) return projection.detail

    return {
      ...projection.detail,
      relatedEvents: await this.getRelatedEvents(projection.detail, options),
    }
  }

  async getWatchlistEvents(query: WatchlistQuery, options: InvestmentBaseQueryOptions = {}): Promise<InvestmentQueryResult> {
    const limit = normalizeLimit(options.limit)
    const records = await this.store.listProjections({
      ...options,
      indexName: "latest",
      indexValue: "all",
      limit: normalizeScanLimit(options.scanLimit, limit),
      sortBy: options.sortBy ?? "investment",
    })
    const matched = records
      .filter(record => matchesWatchlistQuery(record, query))
      .slice(0, limit)

    return toResult(matched, matched.length)
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
    const limitPerSection = Math.min(Math.max(Math.floor(options.limitPerSection ?? 4), 1), 12)
    const queryLimit = Math.max(limitPerSection + 2, 6)
    const sortBy = options.sortBy ?? "investment"
    const seen = new Set<string>([detail.eventId])
    const primaryEntity = detail.primarySubject ?? detail.affectedEntities[0]
    const primaryEntityLookup = primaryEntity
      ? collectEntityKeys(primaryEntity).find(Boolean)
      : undefined
    const primaryTopic = detail.relatedTopics[0]
    const primaryMarket = detail.affectedMarkets[0]
    const familyLabel = getInvestmentEventFamilyLabel(detail.eventFamily)

    const [indexedRelated, entityResult, topicResult, marketResult, familyResult] = await Promise.all([
      this.store.listProjections({
        indexName: "related",
        indexValue: detail.eventId,
        limit: queryLimit,
        sortBy,
      }),
      primaryEntityLookup
        ? this.getEntityEvents({
            entity: primaryEntityLookup,
            limit: queryLimit,
            sortBy,
            includeTotalCount: false,
          })
        : Promise.resolve(null),
      primaryTopic
        ? this.listLatestEvents({
            topic: primaryTopic,
            limit: queryLimit,
            sortBy,
            includeTotalCount: false,
          })
        : Promise.resolve(null),
      primaryMarket
        ? this.listLatestEvents({
            market: primaryMarket,
            limit: queryLimit,
            sortBy,
            includeTotalCount: false,
          })
        : Promise.resolve(null),
      this.listLatestEvents({
        eventFamily: detail.eventFamily,
        limit: queryLimit,
        sortBy,
        includeTotalCount: false,
      }),
    ])

    const sections: InvestmentRelatedEventsSection[] = []
    const appendSection = (
      context: InvestmentRelatedEventsSection["context"],
      label: string | undefined,
      items: InvestmentEventBrief[],
    ) => {
      if (!label) return
      const filtered: InvestmentEventBrief[] = []
      for (const item of items) {
        if (seen.has(item.eventId)) continue
        seen.add(item.eventId)
        filtered.push(item)
        if (filtered.length >= limitPerSection) break
      }
      if (!filtered.length) return
      sections.push({
        context,
        label,
        displayLabel: getInvestmentRelatedSectionDisplayLabel(context, label),
        items: filtered,
      })
    }

    appendSection("entity", primaryEntity?.label, [
      ...indexedRelated.map(record => record.brief),
      ...(entityResult?.items ?? []),
    ])
    appendSection("topic", primaryTopic, topicResult?.items ?? [])
    appendSection("market", primaryMarket, marketResult?.items ?? [])
    appendSection("family", familyLabel, familyResult.items)

    return sections
  }

  private async query(options: EventProjectionQueryOptions & { includeTotalCount?: boolean }) {
    const records = await this.store.listProjections(options)
    const totalCount = options.includeTotalCount === false
      ? records.length
      : await this.store.countProjections(options)
    return toResult(records, totalCount)
  }
}
