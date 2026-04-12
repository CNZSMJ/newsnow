import type { AffectedMarket, DirectionalView } from "@shared/event-profile"
import type { EventSubType, EventType, SourceID } from "@shared/types"
import { getEventTable } from "#/database/events"

export async function listLatestEvents(options?: {
  limit?: number
  eventType?: EventType
  eventSubType?: EventSubType
  sourceId?: SourceID
  topic?: string
  latest?: boolean
  sourceIds?: SourceID[]
  market?: AffectedMarket
  directionalView?: DirectionalView
  minMaterialityScore?: number
  minAuthorityScore?: number
  sortBy?: "latest" | "investment"
}) {
  const eventTable = await getEventTable()
  if (!eventTable) return { updatedAt: Date.now(), items: [], totalCount: 0 }
  const filters = {
    limit: options?.limit ?? 20,
    eventType: options?.eventType,
    eventSubType: options?.eventSubType,
    sourceId: options?.sourceId,
    sourceIds: options?.sourceIds,
    topic: options?.topic,
    market: options?.market,
    directionalView: options?.directionalView,
    minMaterialityScore: options?.minMaterialityScore,
    minAuthorityScore: options?.minAuthorityScore,
    sortBy: options?.sortBy ?? "investment",
  } as const
  const [items, totalCount] = await Promise.all([
    eventTable.listEvents(filters),
    eventTable.countEvents(filters),
  ])
  return {
    updatedAt: Date.now(),
    items,
    totalCount,
  }
}

export async function searchEvents(options: {
  q: string
  limit?: number
  latest?: boolean
  sourceIds?: SourceID[]
  market?: AffectedMarket
  directionalView?: DirectionalView
  minMaterialityScore?: number
  minAuthorityScore?: number
  sortBy?: "latest" | "investment"
}) {
  const eventTable = await getEventTable()
  if (!eventTable) return { updatedAt: Date.now(), items: [], totalCount: 0 }
  const filters = {
    limit: options.limit ?? 20,
    q: options.q.trim(),
    sourceIds: options.sourceIds,
    market: options.market,
    directionalView: options.directionalView,
    minMaterialityScore: options.minMaterialityScore,
    minAuthorityScore: options.minAuthorityScore,
    sortBy: options.sortBy ?? "investment",
  } as const
  const [items, totalCount] = await Promise.all([
    eventTable.listEvents(filters),
    eventTable.countEvents(filters),
  ])
  return {
    updatedAt: Date.now(),
    items,
    totalCount,
  }
}

export async function getEntityEvents(options: {
  entity: string
  limit?: number
  latest?: boolean
  sourceIds?: SourceID[]
  market?: AffectedMarket
  directionalView?: DirectionalView
  minMaterialityScore?: number
  minAuthorityScore?: number
  sortBy?: "latest" | "investment"
}) {
  const eventTable = await getEventTable()
  if (!eventTable) return { updatedAt: Date.now(), items: [], totalCount: 0 }
  const filters = {
    limit: options.limit ?? 20,
    entity: options.entity.trim(),
    sourceIds: options.sourceIds,
    market: options.market,
    directionalView: options.directionalView,
    minMaterialityScore: options.minMaterialityScore,
    minAuthorityScore: options.minAuthorityScore,
    sortBy: options.sortBy ?? "investment",
  } as const
  const [items, totalCount] = await Promise.all([
    eventTable.listEvents(filters),
    eventTable.countEvents(filters),
  ])
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
