import type { AffectedMarket, DirectionalView } from "@shared/event-profile"
import type { EventSubType, EventType, InvestmentEventBrief, SourceID } from "@shared/types"
import type { EventProjectionQueryOptions, EventProjectionRecord } from "#/database/event-projections"

export interface InvestmentProjectionQueryStore {
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

function normalizeText(value: string) {
  return value.trim().toLowerCase()
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

  private async query(options: EventProjectionQueryOptions & { includeTotalCount?: boolean }) {
    const records = await this.store.listProjections(options)
    const totalCount = options.includeTotalCount === false
      ? records.length
      : await this.store.countProjections(options)
    return toResult(records, totalCount)
  }
}
