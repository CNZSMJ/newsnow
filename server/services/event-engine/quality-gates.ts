import { type EventBaseQualitySnapshot, evaluateEventBaseSLOs } from "#/services/event-engine/slo"

type EventQualityGateUnit = "%" | "ms"
type EventQualityGateComparator = ">=" | "<="
type EventQualityGateStatus = "pass" | "fail" | "pending" | "not_automated"
type EventQualityGateSource = "runtime_snapshot" | "manual_sample" | "ci_replay"

export interface EventQualityGate {
  key: string
  label: string
  unit: EventQualityGateUnit
  target: number
  comparator: EventQualityGateComparator
  source: EventQualityGateSource
  automated: boolean
  blocking: boolean
  measured: number | null
  status: EventQualityGateStatus
  releaseBlocker: boolean
  notes?: string
}

interface DeclaredEventQualityGate {
  key: string
  label: string
  unit: EventQualityGateUnit
  target: number
  comparator: EventQualityGateComparator
  source: EventQualityGateSource
  blocking: boolean
  notes: string
}

const DECLARED_MANUAL_GATES: DeclaredEventQualityGate[] = [
  {
    key: "sampledEntityMislinkRatePct",
    label: "Sampled entity mislink rate",
    unit: "%",
    target: 2,
    comparator: "<=",
    source: "manual_sample",
    blocking: true,
    notes: "Requires sampled audit coverage for security, issuer, and institution links.",
  },
  {
    key: "sampledFalseMergeRatePct",
    label: "Sampled false merge rate",
    unit: "%",
    target: 1,
    comparator: "<=",
    source: "manual_sample",
    blocking: true,
    notes: "Requires sampled merge audit before semantics-changing rollout.",
  },
  {
    key: "sampledMissedMergeRatePct",
    label: "Sampled missed merge rate",
    unit: "%",
    target: 3,
    comparator: "<=",
    source: "manual_sample",
    blocking: true,
    notes: "Requires sampled merge audit before semantics-changing rollout.",
  },
  {
    key: "replayPassRatePct",
    label: "Replay pass rate",
    unit: "%",
    target: 100,
    comparator: ">=",
    source: "ci_replay",
    blocking: true,
    notes: "Validated in replay test runs outside the runtime snapshot.",
  },
  {
    key: "deterministicReplayConsistencyPct",
    label: "Deterministic replay consistency",
    unit: "%",
    target: 100,
    comparator: ">=",
    source: "ci_replay",
    blocking: true,
    notes: "Validated in deterministic replay checks outside the runtime snapshot.",
  },
]

export function evaluateEventQualityGates(
  snapshot: EventBaseQualitySnapshot,
  options?: { evaluatedAt?: number },
) {
  const slo = evaluateEventBaseSLOs(snapshot)
  const runtimeAutomatedGates: EventQualityGate[] = slo.gates
    .filter(gate => gate.automated)
    .map(gate => ({
      ...gate,
      source: "runtime_snapshot",
      releaseBlocker: gate.blocking && gate.status === "fail",
    }))
  const runtimeVisibleNonAutomatedGates: EventQualityGate[] = slo.gates
    .filter(gate => !gate.automated)
    .map(gate => ({
      ...gate,
      source: "runtime_snapshot",
      releaseBlocker: false,
    }))
  const declaredManualGates: EventQualityGate[] = DECLARED_MANUAL_GATES.map(gate => ({
    ...gate,
    automated: false,
    measured: null,
    status: "not_automated",
    releaseBlocker: false,
  }))
  const blockingFailures = runtimeAutomatedGates.filter(gate => gate.releaseBlocker)
  const automatedPending = runtimeAutomatedGates.filter(gate => gate.status === "pending").length

  return {
    contractVersion: "event-quality-gates-v2" as const,
    evaluatedAt: options?.evaluatedAt ?? Date.now(),
    enforcement: {
      command: "pnpm events:check-quality",
      exitNonZeroOnRegression: true,
      automatedBlockingOnly: true,
    },
    releaseStatus: blockingFailures.length
      ? "blocked" as const
      : automatedPending
        ? "insufficient_data" as const
        : "ready" as const,
    releaseBlocked: blockingFailures.length > 0,
    blockingGateKeys: blockingFailures.map(gate => gate.key),
    summary: {
      declaredTotal: runtimeAutomatedGates.length + runtimeVisibleNonAutomatedGates.length + declaredManualGates.length,
      automatedTotal: runtimeAutomatedGates.length,
      automatedPass: runtimeAutomatedGates.filter(gate => gate.status === "pass").length,
      automatedFail: runtimeAutomatedGates.filter(gate => gate.status === "fail").length,
      automatedPending,
      automatedBlockingFailures: blockingFailures.length,
      notAutomated: runtimeVisibleNonAutomatedGates.length + declaredManualGates.length,
      manualReviewRequired: runtimeVisibleNonAutomatedGates.filter(gate => gate.blocking).length + declaredManualGates.filter(gate => gate.blocking).length,
    },
    slo,
    gates: [
      ...runtimeAutomatedGates,
      ...runtimeVisibleNonAutomatedGates,
      ...declaredManualGates,
    ],
  }
}
