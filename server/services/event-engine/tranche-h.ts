import type { EventSourceKind } from "@shared/event-profile"
import type { SourceID } from "@shared/types"
import type { EventBaseQualitySnapshot } from "#/services/event-engine/slo"
import type { RawItemRow } from "#/types"
import {
  createChinamoneyFdr007Fixture,
  createChinapvPolicyFixture,
  createClsInterpretationFixture,
  createCninfoAnnouncementFixture,
  createEastmoneyMarketMoveFixture,
} from "#/services/event-engine/fixtures"

export const TRANCHE_H_ERROR_LABELS = [
  "wrong_merge",
  "missed_merge",
  "false_primary_subject",
  "false_tradable_subject",
  "family_misclassification",
  "missing_key_facts",
  "timeline_noise",
] as const

export const REQUIRED_TRANCHE_H_GOLDEN_FAMILIES = [
  "announcement",
  "policy",
  "macro",
  "market_move",
  "media_fast",
] as const

export type TrancheHErrorLabel = typeof TRANCHE_H_ERROR_LABELS[number]
export type TrancheHGoldenFamily = typeof REQUIRED_TRANCHE_H_GOLDEN_FAMILIES[number]
export type TrancheHBlindRiskFlag =
  | "generic_fallback"
  | "unmapped_role"
  | "merge_conflict"
  | "new_family"
  | "low_confidence_llm"

export interface TrancheHReplayFixtureDefinition {
  fixtureId: string
  family: TrancheHGoldenFamily
  sourceId: SourceID
  reviewFocus: TrancheHErrorLabel[]
  build: () => RawItemRow
}

type GateUnit = "%" | "count"
type GateComparator = ">=" | "<="
type GateStatus = "pass" | "fail" | "pending"
type GateSource = "runtime_snapshot" | "manual_sample" | "ci_replay"

export interface TrancheHScorecardGate {
  key: string
  label: string
  unit: GateUnit
  target: number
  comparator: GateComparator
  source: GateSource
  automated: boolean
  measured: number | null
  status: GateStatus
  notes?: string
}

export interface TrancheHSampledMetrics {
  wrongMergeRatePct?: number | null
  missedMergeRatePct?: number | null
  primarySubjectPrecisionPct?: number | null
  falseTradableSubjectRatePct?: number | null
  eventFamilyPrecisionPct?: number | null
  keyFactCompletenessPct?: number | null
  evidenceLinkedFactRatePct?: number | null
  timelineNoiseRatioPct?: number | null
}

interface TrancheHGateDefinition {
  key: keyof TrancheHSampledMetrics | "highValueGenericFallbackSharePct" | "structuredFactCoveragePct"
  label: string
  unit: GateUnit
  target: number
  comparator: GateComparator
  source: GateSource
  automated: boolean
  notes?: string
  measure: (input: {
    snapshot: EventBaseQualitySnapshot
    sampledMetrics?: TrancheHSampledMetrics
  }) => number | null
}

const TRANCHE_H_GATE_DEFINITIONS: readonly TrancheHGateDefinition[] = [
  {
    key: "wrongMergeRatePct",
    label: "Wrong merge rate",
    unit: "%",
    target: 1,
    comparator: "<=",
    source: "manual_sample",
    automated: false,
    notes: "Sampled review of canonical identity and survivor selection.",
    measure: ({ sampledMetrics }) => sampledMetrics?.wrongMergeRatePct ?? null,
  },
  {
    key: "missedMergeRatePct",
    label: "Missed merge rate",
    unit: "%",
    target: 2,
    comparator: "<=",
    source: "manual_sample",
    automated: false,
    notes: "Sampled review of duplicate event fragmentation.",
    measure: ({ sampledMetrics }) => sampledMetrics?.missedMergeRatePct ?? null,
  },
  {
    key: "primarySubjectPrecisionPct",
    label: "Primary subject precision",
    unit: "%",
    target: 98,
    comparator: ">=",
    source: "manual_sample",
    automated: false,
    notes: "Measures whether the investor-facing primary subject is correct.",
    measure: ({ sampledMetrics }) => sampledMetrics?.primarySubjectPrecisionPct ?? null,
  },
  {
    key: "falseTradableSubjectRatePct",
    label: "False tradable subject rate",
    unit: "%",
    target: 1,
    comparator: "<=",
    source: "manual_sample",
    automated: false,
    notes: "Guards against non-tradable narrative phrases leaking into follow-up targets.",
    measure: ({ sampledMetrics }) => sampledMetrics?.falseTradableSubjectRatePct ?? null,
  },
  {
    key: "eventFamilyPrecisionPct",
    label: "Event family precision",
    unit: "%",
    target: 97,
    comparator: ">=",
    source: "ci_replay",
    automated: false,
    notes: "Replay and reviewed fixture precision for high-value families.",
    measure: ({ sampledMetrics }) => sampledMetrics?.eventFamilyPrecisionPct ?? null,
  },
  {
    key: "highValueGenericFallbackSharePct",
    label: "High-value generic fallback share",
    unit: "%",
    target: 2,
    comparator: "<=",
    source: "runtime_snapshot",
    automated: true,
    notes: "Stricter Tranche H threshold for high-value fallback pollution.",
    measure: ({ snapshot }) => snapshot.highValueGenericFallbackSharePct,
  },
  {
    key: "structuredFactCoveragePct",
    label: "Structured fact coverage",
    unit: "%",
    target: 90,
    comparator: ">=",
    source: "runtime_snapshot",
    automated: true,
    notes: "High-value events should default to structured facts.",
    measure: ({ snapshot }) => snapshot.highValueStructuredCoveragePct,
  },
  {
    key: "keyFactCompletenessPct",
    label: "Key fact completeness",
    unit: "%",
    target: 85,
    comparator: ">=",
    source: "ci_replay",
    automated: false,
    notes: "Checks whether minimal fact templates are meaningfully populated.",
    measure: ({ sampledMetrics }) => sampledMetrics?.keyFactCompletenessPct ?? null,
  },
  {
    key: "evidenceLinkedFactRatePct",
    label: "Evidence-linked fact rate",
    unit: "%",
    target: 95,
    comparator: ">=",
    source: "ci_replay",
    automated: false,
    notes: "Structured facts must preserve their evidence trail.",
    measure: ({ sampledMetrics }) => sampledMetrics?.evidenceLinkedFactRatePct ?? null,
  },
  {
    key: "timelineNoiseRatioPct",
    label: "Timeline noise ratio",
    unit: "%",
    target: 5,
    comparator: "<=",
    source: "manual_sample",
    automated: false,
    notes: "Tracks duplicate lifecycle churn and low-value maintenance updates.",
    measure: ({ sampledMetrics }) => sampledMetrics?.timelineNoiseRatioPct ?? null,
  },
] as const

const DEFAULT_HIGH_RISK_PRIORITY: readonly TrancheHBlindRiskFlag[] = [
  "generic_fallback",
  "unmapped_role",
  "merge_conflict",
  "new_family",
  "low_confidence_llm",
]

const KNOWN_TRANCHE_H_SOURCE_KINDS = new Set<EventSourceKind>([
  "exchange_disclosure",
  "official_policy_notice",
  "official_macro_release",
  "official_rate_fixing",
  "official_central_bank_operation",
  "industry_stat_release",
  "industry_report_release",
  "industry_policy_notice",
  "industry_news_feed",
  "media_fast_feed",
])

export const TRANCHE_H_REPLAY_FIXTURE_CATALOG: readonly TrancheHReplayFixtureDefinition[] = [
  {
    fixtureId: "announcement_equity_financing",
    family: "announcement",
    sourceId: "cninfo-szse",
    reviewFocus: ["false_primary_subject", "family_misclassification", "missing_key_facts"],
    build: () => createCninfoAnnouncementFixture({
      itemId: "tranche-h-announcement-financing",
      secCode: "300750",
      secName: "宁德时代",
      title: "关于向特定对象发行股票预案的公告",
      announcementTypeName: "再融资",
    }),
  },
  {
    fixtureId: "policy_industrial_notice",
    family: "policy",
    sourceId: "chinapv-policy",
    reviewFocus: ["family_misclassification", "false_primary_subject", "missing_key_facts"],
    build: () => createChinapvPolicyFixture(),
  },
  {
    fixtureId: "macro_rate_fixing",
    family: "macro",
    sourceId: "chinamoney-fdr007",
    reviewFocus: ["missing_key_facts", "timeline_noise"],
    build: () => createChinamoneyFdr007Fixture(),
  },
  {
    fixtureId: "market_move_broad_index",
    family: "market_move",
    sourceId: "eastmoney-7x24",
    reviewFocus: ["false_primary_subject", "false_tradable_subject"],
    build: () => createEastmoneyMarketMoveFixture(),
  },
  {
    fixtureId: "media_fast_interpretation",
    family: "media_fast",
    sourceId: "cls-telegraph",
    reviewFocus: ["false_primary_subject", "family_misclassification", "missing_key_facts"],
    build: () => createClsInterpretationFixture(),
  },
] as const

export interface TrancheHBlindReviewCandidate {
  eventId: string
  title: string
  sourceId: SourceID
  sourceKind?: EventSourceKind
  riskFlags: TrancheHBlindRiskFlag[]
}

export interface TrancheHBlindReviewSelection extends TrancheHBlindReviewCandidate {
  selectionReason: "random" | "high_risk"
  coveredRiskFlag?: TrancheHBlindRiskFlag
}

function evaluateGateStatus(measured: number | null, target: number, comparator: GateComparator): GateStatus {
  if (measured === null || !Number.isFinite(measured)) return "pending"
  return comparator === ">="
    ? measured >= target ? "pass" : "fail"
    : measured <= target ? "pass" : "fail"
}

function hashCandidate(seed: string) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function deriveTrancheHBlindRiskFlags(input: {
  eventType?: string | null
  eventSubType?: string | null
  sourceKind?: EventSourceKind | null
  entityResolvers?: string[]
  timelineReasons?: string[]
  llmConfidence?: number | null
}) {
  const flags: TrancheHBlindRiskFlag[] = []
  const entityResolvers = input.entityResolvers ?? []
  const timelineReasons = input.timelineReasons ?? []

  if (input.eventType === "news" && input.eventSubType === "other") {
    flags.push("generic_fallback")
  }

  if (entityResolvers.some(resolver => /(?:provisional|unmapped-role|llm-unmapped)/.test(resolver))) {
    flags.push("unmapped_role")
  }

  if (timelineReasons.some(reason => /merge_conflict|correction_required/.test(reason))) {
    flags.push("merge_conflict")
  }

  if (input.sourceKind && !KNOWN_TRANCHE_H_SOURCE_KINDS.has(input.sourceKind)) {
    flags.push("new_family")
  }

  if (typeof input.llmConfidence === "number" && Number.isFinite(input.llmConfidence) && input.llmConfidence < 70) {
    flags.push("low_confidence_llm")
  }

  return flags
}

export function deriveTrancheHBlindLlmConfidence(input: {
  timelineMetadata?: Array<Record<string, unknown> | undefined>
}) {
  const confidences = (input.timelineMetadata ?? [])
    .flatMap((metadata) => {
      if (!metadata || metadata.subjectResolutionProvider !== "llm") return []
      const value = metadata.subjectResolutionConfidence
      if (typeof value !== "number" || !Number.isFinite(value)) return []
      return value <= 1 ? [Math.round(value * 100)] : [Math.round(value)]
    })
    .filter(value => value >= 0)

  if (!confidences.length) return null
  return Math.min(...confidences)
}

export function evaluateTrancheHScorecard(input: {
  snapshot: EventBaseQualitySnapshot
  sampledMetrics?: TrancheHSampledMetrics
  evaluatedAt?: number
}) {
  const gates = TRANCHE_H_GATE_DEFINITIONS.map(definition => {
    const measured = definition.measure({
      snapshot: input.snapshot,
      sampledMetrics: input.sampledMetrics,
    })
    return {
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
      target: definition.target,
      comparator: definition.comparator,
      source: definition.source,
      automated: definition.automated,
      measured,
      status: evaluateGateStatus(measured, definition.target, definition.comparator),
      notes: definition.notes,
    } satisfies TrancheHScorecardGate
  })

  return {
    contractVersion: "tranche-h-scorecard-v1" as const,
    evaluatedAt: input.evaluatedAt ?? Date.now(),
    requiredErrorLabels: TRANCHE_H_ERROR_LABELS,
    requiredGoldenFamilies: REQUIRED_TRANCHE_H_GOLDEN_FAMILIES,
    gates,
    summary: {
      total: gates.length,
      pass: gates.filter(gate => gate.status === "pass").length,
      fail: gates.filter(gate => gate.status === "fail").length,
      pending: gates.filter(gate => gate.status === "pending").length,
      automatedTotal: gates.filter(gate => gate.automated).length,
      automatedFail: gates.filter(gate => gate.automated && gate.status === "fail").length,
      manualReviewRequired: gates.filter(gate => !gate.automated).length,
    },
  }
}

export function planDailyTrancheHBlindReview(input: {
  generatedAt?: number
  randomSampleSize?: number
  highRiskSampleSize?: number
  candidates: TrancheHBlindReviewCandidate[]
}) {
  const generatedAt = input.generatedAt ?? Date.now()
  const randomSampleSize = Math.max(0, input.randomSampleSize ?? 5)
  const highRiskSampleSize = Math.max(0, input.highRiskSampleSize ?? 5)
  const selectedIds = new Set<string>()
  const highRiskQueue: TrancheHBlindReviewSelection[] = []

  for (const riskFlag of DEFAULT_HIGH_RISK_PRIORITY) {
    if (highRiskQueue.length >= highRiskSampleSize) break
    const candidate = input.candidates.find(item => item.riskFlags.includes(riskFlag) && !selectedIds.has(item.eventId))
    if (!candidate) continue
    selectedIds.add(candidate.eventId)
    highRiskQueue.push({
      ...candidate,
      selectionReason: "high_risk",
      coveredRiskFlag: riskFlag,
    })
  }

  const randomQueue = input.candidates
    .filter(item => !selectedIds.has(item.eventId))
    .sort((left, right) => {
      const leftHash = hashCandidate(`${generatedAt}|${left.eventId}|${left.sourceId}`)
      const rightHash = hashCandidate(`${generatedAt}|${right.eventId}|${right.sourceId}`)
      return leftHash - rightHash
    })
    .slice(0, randomSampleSize)
    .map((candidate): TrancheHBlindReviewSelection => ({
      ...candidate,
      selectionReason: "random",
    }))

  return {
    contractVersion: "tranche-h-blind-review-v1" as const,
    generatedAt,
    randomQueue,
    highRiskQueue,
    summary: {
      totalCandidates: input.candidates.length,
      totalSelected: randomQueue.length + highRiskQueue.length,
      highRiskBucketsCovered: highRiskQueue
        .map(item => item.coveredRiskFlag)
        .filter((value): value is TrancheHBlindRiskFlag => Boolean(value)),
      uncoveredHighRiskBuckets: DEFAULT_HIGH_RISK_PRIORITY.filter(flag => !highRiskQueue.some(item => item.coveredRiskFlag === flag)),
    },
  }
}
