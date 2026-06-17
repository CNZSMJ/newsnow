import type {
  EventDetail,
  InvestmentCausalHypothesisBasis,
  InvestmentCausalHypothesisCauseType,
  InvestmentEvidenceSpan,
} from "@shared/types"
import type { LlmProviderId } from "#/services/llm/runtime"

export type CausalHypothesisModelStatus = "available" | "unknown"
export type CausalHypothesisRunCompletionStatus = "succeeded" | "unknown" | "failed"

export interface CausalHypothesisModelHypothesis {
  statement: string
  causeType: InvestmentCausalHypothesisCauseType
  basis: InvestmentCausalHypothesisBasis
  confidence: number
  rationale: string
  evidenceIds: string[]
  factIds: string[]
  evidenceSpans: InvestmentEvidenceSpan[]
}

export interface CausalHypothesisModelOutput {
  status: CausalHypothesisModelStatus
  confidence: number
  hypotheses: CausalHypothesisModelHypothesis[]
  unknownReason: string | null
}

export interface CausalHypothesisGenerationInputOptions {
  modelProvider?: LlmProviderId | null
  modelName: string
}

export interface CausalHypothesisInputSnapshot {
  task: "Generate causal hypotheses for one canonical event."
  inputBuilderVersion: string
  promptId: string
  promptVersion: string
  modelProvider: LlmProviderId | null
  modelName: string
  event: {
    eventId: string
    title: string
    summary: string | null
    eventType: EventDetail["eventType"]
    eventSubType: EventDetail["eventSubType"]
    sourceKind: EventDetail["sourceKind"] | null
    publishedAt: number | null
    ingestedAt: number
    canonicalUrl: string | null
    primaryEntityName: string | null
    affectedMarkets: EventDetail["affectedMarkets"]
    topicTags: EventDetail["topicTags"]
    latestLifecycleState: EventDetail["latestLifecycleState"] | null
    latestLifecycleAt: number | null
    sourceIds: EventDetail["sourceIds"]
  }
  evidence: Array<{
    evidenceId: string
    sourceId: string
    sourceName: string | null
    sourceTitle: string | null
    title: string
    summary: string | null
    url: string | null
    publishedAt: number | null
    fetchedAt: number | null
    sourcePriority: number | null
    authorityLevel: string | null
    extractionStatus: string | null
  }>
  facts: Array<{
    factId: string
    evidenceId: string | null
    factType: string
    metricName: string
    value: string | null
    unit: string | null
    previousValue: string | null
    delta: string | null
    direction: string | null
    effectiveAt: number | null
    entityId: string | null
    confidence: number
    payloadSummary: string | null
  }>
  entities: Array<{
    entityType: string
    entityName: string
    code: string | null
    fullCode: string | null
  }>
  timeline: Array<{
    timelineId: string
    stateFrom: string | null
    stateTo: string
    changedAt: number
    triggerEvidenceId: string | null
    actor: string | null
    reason: string | null
  }>
}

export interface CausalHypothesisGenerationInput {
  inputBuilderVersion: string
  promptId: string
  promptVersion: string
  modelProvider: LlmProviderId | null
  modelName: string
  inputChecksum: string
  promptInput: string
  inputSnapshot: CausalHypothesisInputSnapshot
}

export interface CausalHypothesisValidationContext {
  selectedEvidenceIds: string[]
  selectedFactIds: string[]
}

export type CausalHypothesisValidationResult =
  | {
    valid: true
    runStatus: Exclude<CausalHypothesisRunCompletionStatus, "failed">
    output: CausalHypothesisModelOutput
    acceptedHypotheses: CausalHypothesisModelHypothesis[]
    invalidHypothesisCount: number
    errorCode: null
    validationSummary: null
  }
  | {
    valid: false
    runStatus: "failed"
    output: null
    acceptedHypotheses: []
    invalidHypothesisCount: number
    errorCode: "causal_hypothesis_schema_invalid" | "causal_hypothesis_invalid_references"
    validationSummary: string
  }
