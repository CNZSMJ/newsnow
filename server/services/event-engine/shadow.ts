import type { SourceID } from "@shared/types"
import { getEventTable } from "#/database/events"
import { EVENT_ENGINE_METRICS, incrementEventEngineMetric, toMetricLabels } from "#/services/event-engine/metrics"
import { resolveEventClassification } from "#/services/event-engine/resolver"
import { resolveLegacyEventClassification } from "#/services/event-engine/legacy"
import { stripHtml } from "#/services/event-engine/text"

export interface EventShadowDiff {
  rawId: string
  sourceId: SourceID
  title: string
  publishedAt?: number | null
  legacy: {
    eventType: string
    eventSubType: string
    importance: string
  }
  current: {
    eventType: string
    eventSubType: string
    importance: string
    sourceKind?: string
  }
  changes: string[]
}

function getSummary(payload: Record<string, any>) {
  const hover = payload.extra?.hover
  return typeof hover === "string" ? stripHtml(hover) : null
}

export async function compareEventShadow(options?: {
  sourceIds?: SourceID[]
  since?: number
  limit?: number
  rawIds?: string[]
}) {
  const eventTable = await getEventTable()
  if (!eventTable) {
    return {
      compared: 0,
      changed: 0,
      unchanged: 0,
      differences: [] as EventShadowDiff[],
      typeChanges: {} as Record<string, number>,
      subtypeChanges: {} as Record<string, number>,
    }
  }

  const rawItems = options?.rawIds?.length
    ? await eventTable.getRawItemsByIds(options.rawIds)
    : await eventTable.listRawItems({
      sourceIds: options?.sourceIds,
      since: options?.since,
      limit: options?.limit ?? 200,
    })

  const differences: EventShadowDiff[] = []
  const typeChanges: Record<string, number> = {}
  const subtypeChanges: Record<string, number> = {}

  for (const rawItem of rawItems) {
    const payload = JSON.parse(rawItem.payload_json) as Record<string, any>
    const summary = getSummary(payload)
    const legacy = resolveLegacyEventClassification(rawItem.source_id, rawItem.title, summary)
    const current = resolveEventClassification(rawItem.source_id, rawItem.title, summary)
    const changes: string[] = []

    if (legacy.eventType !== current.eventType) {
      changes.push("event_type")
      const key = `${legacy.eventType}->${current.eventType}`
      typeChanges[key] = (typeChanges[key] ?? 0) + 1
    }
    if (legacy.eventSubType !== current.eventSubType) {
      changes.push("event_subtype")
      const key = `${legacy.eventSubType}->${current.eventSubType}`
      subtypeChanges[key] = (subtypeChanges[key] ?? 0) + 1
    }
    if (legacy.importance !== current.importance) {
      changes.push("importance")
    }

    if (!changes.length) continue

    differences.push({
      rawId: rawItem.raw_id,
      sourceId: rawItem.source_id,
      title: rawItem.title,
      publishedAt: rawItem.published_at,
      legacy,
      current: {
        eventType: current.eventType,
        eventSubType: current.eventSubType,
        importance: current.importance,
        sourceKind: current.profile?.sourceKind,
      },
      changes,
    })
  }

  const labels = toMetricLabels({
    mode: "shadow",
    source_count: options?.sourceIds?.length ?? 0,
  })
  incrementEventEngineMetric(EVENT_ENGINE_METRICS.shadowComparisons, labels)
  incrementEventEngineMetric(EVENT_ENGINE_METRICS.shadowDiffs, labels, differences.length)
  await eventTable.incrementMetric(EVENT_ENGINE_METRICS.shadowComparisons, labels)
  await eventTable.incrementMetric(EVENT_ENGINE_METRICS.shadowDiffs, labels, differences.length)

  return {
    compared: rawItems.length,
    changed: differences.length,
    unchanged: rawItems.length - differences.length,
    differences,
    typeChanges,
    subtypeChanges,
  }
}
