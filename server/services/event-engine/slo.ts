import type { EventSourceKind } from "@shared/event-profile"
import sources from "@shared/sources"
import type { SourceID } from "@shared/types"

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

export type EventLatencyTier = "trade_critical" | "high_value_non_intraday" | "long_form_heavy_parsing"
export type EventPublicationClockPrecision = "precise" | "coarse_day"
export type EventLatencyAutomationExclusionReason = "coarse_publication_clock" | "backlog_catchup"
export type EventLatencyInstrumentation = "automated" | "not_instrumented"

export interface EventLatencyStageSnapshot {
  instrumentation: EventLatencyInstrumentation
  latencySampleCount: number
  avgLatencyMs: number | null
  p95LatencyMs: number | null
}

export interface EventLatencyTierSnapshot {
  tier: EventLatencyTier
  label: string
  sourceKinds: EventSourceKind[]
  targetInitialCanonicalP95Ms: number
  automated: boolean
  totalEventCount: number
  coarsePublicationClockEventCount: number
  backlogCatchupEventCount: number
  initialCanonicalLatency: EventLatencyStageSnapshot
  fullSemanticEnrichmentLatency: EventLatencyStageSnapshot
}

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
    coarsePublicationClockEventCount: number
    backlogCatchupEventCount: number
    latencySampleCount: number
    avgIngestLatencyMs: number | null
    p95IngestLatencyMs: number | null
    initialCanonicalLatency: EventLatencyStageSnapshot
    fullSemanticEnrichmentLatency: EventLatencyStageSnapshot
  }
  latencyTiers?: EventLatencyTierSnapshot[]
  highValueSourceEventCount: number
  highValueStructuredEventCount: number
  highValueStructuredCoveragePct: number | null
  highValueDegradedEventCount?: number
  highValueGenericFallbackEventCount: number
  highValueGenericFallbackSharePct: number | null
  highValueCoarsePublicationClockEventCount?: number
  highValueBacklogCatchupEventCount?: number
  prioritySourceAvgIngestLatencyMs?: number | null
  prioritySourceIngestLatencyP95Ms: number | null
  tradeCriticalInitialCanonicalLatencyP95Ms: number | null
  highValueNonIntradayInitialCanonicalLatencyP95Ms: number | null
  longFormHeavyParsingInitialCanonicalLatencyP95Ms: number | null
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
  notes?: string
}

interface EventBaseSloDefinition {
  key: string
  label: string
  unit: EventBaseSloGate["unit"]
  target: number
  comparator: EventBaseSloGate["comparator"]
  automated: boolean
  blocking: boolean
  notes?: string
  measure: (snapshot: EventBaseQualitySnapshot) => number | null
}

interface EventLatencyTierDefinition {
  tier: EventLatencyTier
  label: string
  sourceKinds: readonly EventSourceKind[]
  targetInitialCanonicalP95Ms: number
  automated: boolean
}

const EVENT_LATENCY_TIER_DEFINITIONS: readonly EventLatencyTierDefinition[] = [
  {
    tier: "trade_critical",
    label: "Tier A 交易关键源",
    sourceKinds: [
      "exchange_disclosure",
      "official_rate_fixing",
      "official_central_bank_operation",
    ],
    targetInitialCanonicalP95Ms: 5 * 60 * 1000,
    automated: true,
  },
  {
    tier: "high_value_non_intraday",
    label: "Tier B 高价值非盘中源",
    sourceKinds: [
      "official_macro_release",
      "official_policy_notice",
      "industry_stat_release",
    ],
    targetInitialCanonicalP95Ms: 15 * 60 * 1000,
    automated: false,
  },
  {
    tier: "long_form_heavy_parsing",
    label: "Tier C 长文档与重解析源",
    sourceKinds: [
      "industry_report_release",
      "industry_policy_notice",
    ],
    targetInitialCanonicalP95Ms: 30 * 60 * 1000,
    automated: false,
  },
] as const

const TIER_SOURCE_KIND_LOOKUP = Object.fromEntries(
  EVENT_LATENCY_TIER_DEFINITIONS.flatMap(definition => definition.sourceKinds.map(sourceKind => [sourceKind, definition.tier])),
) as Record<EventSourceKind, EventLatencyTier>

const PRECISE_PUBLICATION_CLOCK_SOURCE_KINDS = new Set<EventSourceKind>([
  "exchange_disclosure",
  "official_rate_fixing",
  "official_central_bank_operation",
])

const PRECISE_PUBLICATION_CLOCK_SOURCE_IDS = new Set<SourceID>([
  "pbc-omo",
  "pbc-mlf",
  "chinamoney-shibor",
  "chinamoney-fdr007",
  "chinamoney-fr007",
  "chinamoney-lpr",
  "cninfo-szse",
  "cninfo-sse",
  "cninfo-hk-main",
  "cninfo-hk-gem",
  "cninfo-hk-disclosure",
  "hkexnews-latest",
  "hkexnews-results",
  "hkexnews-halt",
  "sse-latest",
])

const BACKLOG_CATCHUP_GAP_MULTIPLIER = 3
const BACKLOG_CATCHUP_GAP_FLOOR_MS = 30 * 60 * 1000

const EVENT_BASE_SLO_DEFINITIONS: EventBaseSloDefinition[] = [
  {
    key: "highValueStructuredCoveragePct",
    label: "高价值来源结构化覆盖率",
    unit: "%",
    target: 85,
    comparator: ">=",
    automated: true,
    blocking: true,
    measure: snapshot => snapshot.highValueStructuredCoveragePct,
  },
  {
    key: "highValueGenericFallbackSharePct",
    label: "高价值来源泛化 fallback 占比",
    unit: "%",
    target: 5,
    comparator: "<=",
    automated: true,
    blocking: true,
    measure: snapshot => snapshot.highValueGenericFallbackSharePct,
  },
  {
    key: "tradeCriticalInitialCanonicalLatencyP95Ms",
    label: "Tier A 初始 canonical 延迟 P95",
    unit: "ms",
    target: 5 * 60 * 1000,
    comparator: "<=",
    automated: true,
    blocking: true,
    notes: "Automated only for source families with precise publication clocks.",
    measure: snapshot => snapshot.tradeCriticalInitialCanonicalLatencyP95Ms,
  },
  {
    key: "highValueNonIntradayInitialCanonicalLatencyP95Ms",
    label: "Tier B 初始 canonical 延迟 P95",
    unit: "ms",
    target: 15 * 60 * 1000,
    comparator: "<=",
    automated: false,
    blocking: true,
    notes: "Visible in runtime output, but not release-blocking until more Tier B families have precise publication clocks.",
    measure: snapshot => snapshot.highValueNonIntradayInitialCanonicalLatencyP95Ms,
  },
  {
    key: "longFormHeavyParsingInitialCanonicalLatencyP95Ms",
    label: "Tier C 初始 canonical 延迟 P95",
    unit: "ms",
    target: 30 * 60 * 1000,
    comparator: "<=",
    automated: false,
    blocking: true,
    notes: "Visible in runtime output, but not release-blocking until long-form sources have stable precise publication clocks.",
    measure: snapshot => snapshot.longFormHeavyParsingInitialCanonicalLatencyP95Ms,
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

export function getLatencyTierDefinition(tier: EventLatencyTier) {
  return EVENT_LATENCY_TIER_DEFINITIONS.find(definition => definition.tier === tier)
}

export function getLatencyTierForSourceKind(sourceKind?: EventSourceKind | string | null) {
  if (!sourceKind) return undefined
  if (!(sourceKind in TIER_SOURCE_KIND_LOOKUP)) return undefined
  return TIER_SOURCE_KIND_LOOKUP[sourceKind as EventSourceKind]
}

export function listLatencyTierDefinitions() {
  return [...EVENT_LATENCY_TIER_DEFINITIONS]
}

export function getPublicationClockPrecision(sourceId?: SourceID | null, sourceKind?: EventSourceKind | string | null) {
  if (sourceId && PRECISE_PUBLICATION_CLOCK_SOURCE_IDS.has(sourceId)) {
    return "precise" as const
  }
  if (sourceKind && PRECISE_PUBLICATION_CLOCK_SOURCE_KINDS.has(sourceKind as EventSourceKind)) {
    return "precise" as const
  }
  return "coarse_day" as const
}

export function shouldUseLegacyRawItemFetchGap(sourceId?: SourceID | null, sourceKind?: EventSourceKind | string | null) {
  return getPublicationClockPrecision(sourceId, sourceKind) === "precise"
    && sourceKind === "exchange_disclosure"
}

export function getBacklogCatchupGapThresholdMs(sourceId?: SourceID | null) {
  const sourceIntervalMs = sourceId ? sources[sourceId]?.interval ?? 0 : 0
  return Math.max(BACKLOG_CATCHUP_GAP_FLOOR_MS, sourceIntervalMs * BACKLOG_CATCHUP_GAP_MULTIPLIER)
}

export function getInitialLatencyAutomationExclusionReason(input: {
  sourceId?: SourceID | null
  sourceKind?: EventSourceKind | string | null
  fetchGapMs?: number | null
}) {
  if (getPublicationClockPrecision(input.sourceId, input.sourceKind) !== "precise") {
    return "coarse_publication_clock" as const
  }

  if (typeof input.fetchGapMs === "number" && Number.isFinite(input.fetchGapMs)) {
    const fetchGapThresholdMs = getBacklogCatchupGapThresholdMs(input.sourceId)
    if (input.fetchGapMs > fetchGapThresholdMs) {
      return "backlog_catchup" as const
    }
  }

  return undefined
}

export function isAutomatedInitialLatencySample(input: {
  sourceId?: SourceID | null
  sourceKind?: EventSourceKind | string | null
  fetchGapMs?: number | null
}) {
  return !getInitialLatencyAutomationExclusionReason(input)
}

export function evaluateEventBaseSLOs(snapshot: EventBaseQualitySnapshot) {
  const gates: EventBaseSloGate[] = EVENT_BASE_SLO_DEFINITIONS.map((definition) => {
    const measured = roundMetric(definition.measure(snapshot))
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
      notes: definition.notes,
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
    targetsVersion: "event-base-slo-v2" as const,
    summary,
    gates,
  }
}
