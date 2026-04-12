import { getEventBusWorkerStatus } from "#/services/event-bus"
import { getEventTable } from "#/database/events"
import { EVENT_ENGINE_VERSIONS } from "#/services/event-engine/versions"

export default defineEventHandler(async () => {
  const eventTable = await getEventTable()
  const operationalWindowHours = 24
  const defaultOperations = {
    totalActiveEvents: 0,
    recentEventCount: 0,
    avgIngestLatencyMs: null,
    maxIngestLatencyMs: null,
  }
  const metrics = eventTable
    ? await eventTable.getMetricsSnapshot()
    : {
        updatedAt: 0,
        totals: {},
        points: [],
      }
  const rawRange = eventTable
    ? await eventTable.getRawItemRangeStats()
    : {
        totalCount: 0,
        oldestAt: null,
        newestAt: null,
      }
  const operations = eventTable
    ? await eventTable.getOperationalStats({
      since: Date.now() - operationalWindowHours * 60 * 60 * 1000,
    })
    : defaultOperations
  const extractorSuccess = Number(metrics.totals.event_engine_extractor_success_total ?? 0)
  const extractorFailure = Number(metrics.totals.event_engine_extractor_failure_total ?? 0)
  const mergeCollisions = Number(metrics.totals.event_engine_merge_collision_total ?? 0)
  const extractionAttempts = extractorSuccess + extractorFailure
  const extractorFailureRate = extractionAttempts ? Number((extractorFailure / extractionAttempts).toFixed(4)) : 0
  const mergeCollisionRate = extractorSuccess ? Number((mergeCollisions / extractorSuccess).toFixed(4)) : 0

  return {
    status: "success",
    updatedTime: Date.now(),
    worker: getEventBusWorkerStatus(),
    versions: EVENT_ENGINE_VERSIONS,
    retention: rawRange,
    operations: {
      windowHours: operationalWindowHours,
      ...operations,
    },
    llm: {
      enabled: false,
      latencyMs: null,
      fallbackRate: null,
    },
    health: {
      extractorFailureRate,
      mergeCollisionRate,
      healthy: extractorFailureRate <= 0.15 && mergeCollisionRate <= 0.2,
    },
    metrics,
  }
})
