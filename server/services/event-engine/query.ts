import type { AffectedMarket, DirectionalView } from "@shared/event-profile"
import type { EventSubType, EventType, SourceID } from "@shared/types"
import { getEventTable } from "#/database/events"

export async function listLatestEvents(options?: {
  limit?: number
  scanLimit?: number
  eventType?: EventType
  eventSubType?: EventSubType
  sourceId?: SourceID
  topic?: string
  sourceIds?: SourceID[]
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
}) {
  const eventTable = await getEventTable()
  if (!eventTable) return { updatedAt: Date.now(), items: [], totalCount: 0 }
  const filters = {
    limit: options?.limit ?? 20,
    scanLimit: options?.scanLimit,
    eventType: options?.eventType,
    eventSubType: options?.eventSubType,
    sourceId: options?.sourceId,
    sourceIds: options?.sourceIds,
    topic: options?.topic,
    market: options?.market,
    directionalView: options?.directionalView,
    minMaterialityScore: options?.minMaterialityScore,
    minAuthorityScore: options?.minAuthorityScore,
    changedSince: options?.changedSince,
    lifecycleAfter: options?.lifecycleAfter,
    seriesKey: options?.seriesKey,
    periodKey: options?.periodKey,
    sortBy: options?.sortBy ?? "investment",
  } as const
  const items = await eventTable.listEvents(filters)
  const totalCount = options?.includeTotalCount === false
    ? items.length
    : await eventTable.countEvents(filters)
  return {
    updatedAt: Date.now(),
    items,
    totalCount,
  }
}

export async function searchEvents(options: {
  q: string
  limit?: number
  scanLimit?: number
  sourceIds?: SourceID[]
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
}) {
  const eventTable = await getEventTable()
  if (!eventTable) return { updatedAt: Date.now(), items: [], totalCount: 0 }
  const filters = {
    limit: options.limit ?? 20,
    scanLimit: options.scanLimit,
    q: options.q.trim(),
    sourceIds: options.sourceIds,
    market: options.market,
    directionalView: options.directionalView,
    minMaterialityScore: options.minMaterialityScore,
    minAuthorityScore: options.minAuthorityScore,
    changedSince: options.changedSince,
    lifecycleAfter: options.lifecycleAfter,
    seriesKey: options.seriesKey,
    periodKey: options.periodKey,
    sortBy: options.sortBy ?? "investment",
  } as const
  const items = await eventTable.listEvents(filters)
  const totalCount = options.includeTotalCount === false
    ? items.length
    : await eventTable.countEvents(filters)
  return {
    updatedAt: Date.now(),
    items,
    totalCount,
  }
}

export async function getEntityEvents(options: {
  entity: string
  limit?: number
  scanLimit?: number
  sourceIds?: SourceID[]
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
}) {
  const eventTable = await getEventTable()
  if (!eventTable) return { updatedAt: Date.now(), items: [], totalCount: 0 }
  const filters = {
    limit: options.limit ?? 20,
    scanLimit: options.scanLimit,
    entity: options.entity.trim(),
    sourceIds: options.sourceIds,
    market: options.market,
    directionalView: options.directionalView,
    minMaterialityScore: options.minMaterialityScore,
    minAuthorityScore: options.minAuthorityScore,
    changedSince: options.changedSince,
    lifecycleAfter: options.lifecycleAfter,
    seriesKey: options.seriesKey,
    periodKey: options.periodKey,
    sortBy: options.sortBy ?? "investment",
  } as const
  const items = await eventTable.listEvents(filters)
  const totalCount = options.includeTotalCount === false
    ? items.length
    : await eventTable.countEvents(filters)
  return {
    updatedAt: Date.now(),
    items,
    totalCount,
  }
}

export async function getEventDetailById(eventId: string) {
  const eventTable = await getEventTable()
  if (!eventTable) return undefined
  return eventTable.getEventDetail(eventId)
}
