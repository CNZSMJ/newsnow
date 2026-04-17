import type { EventSourceKind } from "@shared/event-profile"

export const HIGH_VALUE_SOURCE_KINDS = [
  "official_macro_release",
  "official_policy_notice",
  "official_rate_fixing",
  "official_central_bank_operation",
  "exchange_disclosure",
  "industry_stat_release",
  "industry_report_release",
  "industry_policy_notice",
] as const satisfies readonly EventSourceKind[]

export interface EventBaseQualitySnapshot {
  generatedAt?: number
  windowStartAt?: number
  highValue?: {
    sourceKinds: EventSourceKind[]
    totalEventCount: number
    structuredEventCount: number
    degradedEventCount: number
    genericFallbackEventCount: number
    structuredCoveragePct: number | null
    genericFallbackSharePct: number | null
    latencySampleCount: number
    avgIngestLatencyMs: number | null
    p95IngestLatencyMs: number | null
  }
  highValueSourceEventCount: number
  highValueStructuredEventCount: number
  highValueStructuredCoveragePct: number | null
  highValueDegradedEventCount?: number
  highValueGenericFallbackEventCount: number
  highValueGenericFallbackSharePct: number | null
  prioritySourceAvgIngestLatencyMs?: number | null
  prioritySourceIngestLatencyP95Ms: number | null
}

export interface EventBaseSloGate {
  key: string
  label: string
  unit: "%" | "ms"
  target: number
  comparator: ">=" | "<="
  automated: boolean
  blocking: boolean
  measured: number | null
  status: "pass" | "fail" | "pending"
}

interface EventBaseSloDefinition {
  key: keyof EventBaseQualitySnapshot
  label: string
  unit: EventBaseSloGate["unit"]
  target: number
  comparator: EventBaseSloGate["comparator"]
  automated: boolean
  blocking: boolean
}

const EVENT_BASE_SLO_DEFINITIONS: EventBaseSloDefinition[] = [
  {
    key: "highValueStructuredCoveragePct",
    label: "高价值来源结构化覆盖率",
    unit: "%",
    target: 85,
    comparator: ">=",
    automated: true,
    blocking: true,
  },
  {
    key: "highValueGenericFallbackSharePct",
    label: "高价值来源泛化 fallback 占比",
    unit: "%",
    target: 5,
    comparator: "<=",
    automated: true,
    blocking: true,
  },
  {
    key: "prioritySourceIngestLatencyP95Ms",
    label: "优先来源 ingest-to-canonical 延迟 P95",
    unit: "ms",
    target: 5 * 60 * 1000,
    comparator: "<=",
    automated: true,
    blocking: true,
  },
]

function roundMetric(value: number | null) {
  if (value === null || Number.isNaN(value)) return null
  return Math.round(value * 100) / 100
}

function evaluateMeasuredValue(measured: number | null, target: number, comparator: EventBaseSloGate["comparator"]) {
  if (measured === null) return "pending" as const
  return comparator === ">="
    ? measured >= target ? "pass" : "fail"
    : measured <= target ? "pass" : "fail"
}

export function evaluateEventBaseSLOs(snapshot: EventBaseQualitySnapshot) {
  const gates: EventBaseSloGate[] = EVENT_BASE_SLO_DEFINITIONS.map((definition) => {
    const measured = roundMetric(snapshot[definition.key] as number | null)
    return {
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
      target: definition.target,
      comparator: definition.comparator,
      automated: definition.automated,
      blocking: definition.blocking,
      measured,
      status: evaluateMeasuredValue(measured, definition.target, definition.comparator),
    }
  })

  const summary = {
    total: gates.length,
    pass: gates.filter(gate => gate.status === "pass").length,
    fail: gates.filter(gate => gate.status === "fail").length,
    pending: gates.filter(gate => gate.status === "pending").length,
    blockingFailures: gates.filter(gate => gate.automated && gate.blocking && gate.status === "fail").length,
  }

  return {
    targetsVersion: "event-base-slo-v1" as const,
    summary,
    gates,
  }
}
