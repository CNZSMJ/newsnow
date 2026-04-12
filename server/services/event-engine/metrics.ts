export const EVENT_ENGINE_METRICS = {
  extractorSuccess: "event_engine_extractor_success_total",
  extractorFailure: "event_engine_extractor_failure_total",
  mergeCollisions: "event_engine_merge_collision_total",
  eventCreates: "event_engine_event_create_total",
  eventUpdates: "event_engine_event_update_total",
  replayedRawItems: "event_engine_replayed_raw_item_total",
  replayRemovedEvents: "event_engine_replay_removed_event_total",
  backfillRuns: "event_engine_backfill_run_total",
  backfilledRawItems: "event_engine_backfilled_raw_item_total",
  shadowComparisons: "event_engine_shadow_comparison_total",
  shadowDiffs: "event_engine_shadow_diff_total",
} as const

export type EventEngineMetricName = typeof EVENT_ENGINE_METRICS[keyof typeof EVENT_ENGINE_METRICS]

type MetricLabels = Record<string, string | number | boolean | undefined>

export interface EventEngineMetricPoint {
  metric: EventEngineMetricName
  labels: Record<string, string>
  value: number
}

const counters = new Map<string, number>()
const updatedAt = 0

interface EventEngineMetricsStore {
  counters: Map<string, number>
  updatedAt: number
}

const metricsStore = (() => {
  const key = "__NEWSNOW_EVENT_ENGINE_METRICS__"
  const target = globalThis as typeof globalThis & {
    [key: string]: EventEngineMetricsStore | undefined
  }

  if (!target[key]) {
    target[key] = {
      counters,
      updatedAt,
    }
  }

  return target[key]!
})()

export function toMetricLabels(labels?: MetricLabels) {
  return Object.fromEntries(
    Object.entries(labels ?? {})
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, String(value)]),
  )
}

function getMetricKey(metric: EventEngineMetricName, labels?: MetricLabels) {
  const normalizedLabels = toMetricLabels(labels)
  return `${metric}|${JSON.stringify(normalizedLabels)}`
}

export function incrementEventEngineMetric(metric: EventEngineMetricName, labels?: MetricLabels, value = 1) {
  const key = getMetricKey(metric, labels)
  metricsStore.counters.set(key, (metricsStore.counters.get(key) ?? 0) + value)
  metricsStore.updatedAt = Date.now()
}

export function resetEventEngineMetrics() {
  metricsStore.counters.clear()
  metricsStore.updatedAt = Date.now()
}

export function getEventEngineMetricsSnapshot() {
  const points: EventEngineMetricPoint[] = [...metricsStore.counters.entries()].map(([key, value]) => {
    const [metric, labelsJSON] = key.split("|")
    return {
      metric: metric as EventEngineMetricName,
      labels: JSON.parse(labelsJSON) as Record<string, string>,
      value,
    }
  })

  const totals = Object.fromEntries(
    Object.values(EVENT_ENGINE_METRICS).map(metric => [
      metric,
      points
        .filter(point => point.metric === metric)
        .reduce((sum, point) => sum + point.value, 0),
    ]),
  ) as Record<EventEngineMetricName, number>

  return {
    updatedAt: metricsStore.updatedAt,
    totals,
    points,
  }
}
