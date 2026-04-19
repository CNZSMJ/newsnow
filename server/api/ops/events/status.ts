import { getEventBusWorkerStatus } from "#/services/event-bus"
import { getEventTable } from "#/database/events"
import { evaluateEventQualityGates } from "#/services/event-engine/quality-gates"
import { getLiveSubjectRoleExtractorStatus } from "#/services/event-engine/subject-role-live-extractor"
import type { EventBaseQualitySnapshot } from "#/services/event-engine/slo"
import { EVENT_ENGINE_VERSIONS } from "#/services/event-engine/versions"

const DEFAULT_OPERATIONAL_WINDOW_HOURS = 24
const MAX_OPERATIONAL_WINDOW_HOURS = 7 * 24
const DEFAULT_LATENCY_BUCKET_LIMIT = 10
const MAX_LATENCY_BUCKET_LIMIT = 25
const DEFAULT_STALE_THRESHOLD_MINUTES = 5
const MAX_STALE_THRESHOLD_MINUTES = 12 * 60

function clampPositiveNumber(value: unknown, defaultValue: number, maxValue: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue
  }

  return Math.min(parsed, maxValue)
}

function clampPositiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue
  }

  return Math.min(Math.max(1, Math.floor(parsed)), maxValue)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const eventTable = await getEventTable()
  const updatedTime = Date.now()
  const operationalWindowHours = clampPositiveNumber(
    query.windowHours ?? query.hours,
    DEFAULT_OPERATIONAL_WINDOW_HOURS,
    MAX_OPERATIONAL_WINDOW_HOURS,
  )
  const latencyBucketLimit = clampPositiveInteger(
    query.diagnosticLimit ?? query.limit,
    DEFAULT_LATENCY_BUCKET_LIMIT,
    MAX_LATENCY_BUCKET_LIMIT,
  )
  const staleThresholdMinutes = clampPositiveInteger(
    query.staleThresholdMinutes ?? query.staleMinutes,
    DEFAULT_STALE_THRESHOLD_MINUTES,
    MAX_STALE_THRESHOLD_MINUTES,
  )
  const staleThresholdMs = staleThresholdMinutes * 60 * 1000
  const operationalWindowStartAt = updatedTime - Math.round(operationalWindowHours * 60 * 60 * 1000)
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
      since: operationalWindowStartAt,
    })
    : defaultOperations
  const rawLatencyDiagnostics = eventTable
    ? await eventTable.getOperationalLatencyDiagnostics({
      since: operationalWindowStartAt,
      limit: latencyBucketLimit,
      staleThresholdMs,
    })
    : {
        generatedAt: updatedTime,
        windowStartAt: operationalWindowStartAt,
        staleThresholdMs,
        tierBreakdown: [],
        sourceKindBreakdown: [],
        sourceBreakdown: [],
      }
  const latencyDiagnostics = {
    windowHours: operationalWindowHours,
    bucketLimit: latencyBucketLimit,
    staleThresholdMinutes,
    ...rawLatencyDiagnostics,
  }
  const qualitySnapshot: EventBaseQualitySnapshot = eventTable
    ? await eventTable.getQualitySnapshot()
    : {
        generatedAt: 0,
        windowStartAt: 0,
        highValue: {
          sourceKinds: [],
          totalEventCount: 0,
          structuredEventCount: 0,
          degradedEventCount: 0,
          genericFallbackEventCount: 0,
          structuredCoveragePct: null,
          genericFallbackSharePct: null,
          coarsePublicationClockEventCount: 0,
          backlogCatchupEventCount: 0,
          latencySampleCount: 0,
          avgIngestLatencyMs: null,
          p95IngestLatencyMs: null,
          initialCanonicalLatency: {
            instrumentation: "automated",
            latencySampleCount: 0,
            avgLatencyMs: null,
            p95LatencyMs: null,
          },
          fullSemanticEnrichmentLatency: {
            instrumentation: "not_instrumented",
            latencySampleCount: 0,
            avgLatencyMs: null,
            p95LatencyMs: null,
          },
        },
        latencyTiers: [],
        highValueSourceEventCount: 0,
        highValueStructuredEventCount: 0,
        highValueStructuredCoveragePct: null,
        highValueDegradedEventCount: 0,
        highValueGenericFallbackEventCount: 0,
        highValueGenericFallbackSharePct: null,
        highValueCoarsePublicationClockEventCount: 0,
        highValueBacklogCatchupEventCount: 0,
        prioritySourceAvgIngestLatencyMs: null,
        prioritySourceIngestLatencyP95Ms: null,
        tradeCriticalInitialCanonicalLatencyP95Ms: null,
        highValueNonIntradayInitialCanonicalLatencyP95Ms: null,
        longFormHeavyParsingInitialCanonicalLatencyP95Ms: null,
      }
  const extractorSuccess = Number(metrics.totals.event_engine_extractor_success_total ?? 0)
  const extractorFailure = Number(metrics.totals.event_engine_extractor_failure_total ?? 0)
  const mergeCollisions = Number(metrics.totals.event_engine_merge_collision_total ?? 0)
  const extractionAttempts = extractorSuccess + extractorFailure
  const extractorFailureRate = extractionAttempts ? Number((extractorFailure / extractionAttempts).toFixed(4)) : 0
  const mergeCollisionRate = extractorSuccess ? Number((mergeCollisions / extractorSuccess).toFixed(4)) : 0
  const qualityGate = evaluateEventQualityGates(qualitySnapshot, { evaluatedAt: updatedTime })
  const liveExtractorStatus = getLiveSubjectRoleExtractorStatus()

  return {
    status: "success",
    updatedTime,
    worker: getEventBusWorkerStatus(),
    versions: EVENT_ENGINE_VERSIONS,
    retention: rawRange,
    operations: {
      windowHours: operationalWindowHours,
      windowStartAt: operationalWindowStartAt,
      ...operations,
      diagnostics: latencyDiagnostics,
    },
    llm: {
      enabled: liveExtractorStatus.enabled,
      provider: liveExtractorStatus.provider,
      model: liveExtractorStatus.model,
      promptId: liveExtractorStatus.promptId,
      promptVersion: liveExtractorStatus.promptVersion,
      missingConfig: liveExtractorStatus.missingConfig,
      latencyMs: null,
      fallbackRate: null,
    },
    quality: {
      snapshot: qualitySnapshot,
      slo: qualityGate.slo,
      gate: qualityGate,
    },
    health: {
      extractorFailureRate,
      mergeCollisionRate,
      healthy: extractorFailureRate <= 0.15 && mergeCollisionRate <= 0.2 && !qualityGate.releaseBlocked,
    },
    metrics,
  }
})
