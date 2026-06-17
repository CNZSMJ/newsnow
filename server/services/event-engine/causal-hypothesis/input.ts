import { createHash } from "node:crypto"
import type { EventDetail, EventEvidence, EventFact, EventTimelineEntry } from "@shared/types"
import { getCausalHypothesisPromptDefinition } from "#/services/event-engine/prompt-registry"
import type {
  CausalHypothesisGenerationInput,
  CausalHypothesisGenerationInputOptions,
  CausalHypothesisInputSnapshot,
} from "#/services/event-engine/causal-hypothesis/types"

export const CAUSAL_HYPOTHESIS_INPUT_BUILDER_VERSION = "causal-hypothesis-input-v1"
const causalHypothesisPromptDefinition = getCausalHypothesisPromptDefinition()

const MAX_TEXT_CHARS = 700
const MAX_PAYLOAD_CHARS = 500
const MAX_EVIDENCE = 5
const MAX_FACTS = 12

function truncate(value?: string | null, maxChars = MAX_TEXT_CHARS) {
  const normalized = value?.trim()
  if (!normalized) return null
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== "object") return value

  return Object.keys(value as Record<string, unknown>)
    .filter(key => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
    .reduce<Record<string, unknown>>((record, key) => {
      record[key] = stableValue((value as Record<string, unknown>)[key])
      return record
    }, {})
}

function authorityRank(value?: string | null) {
  const normalized = value?.toLowerCase() ?? ""
  if (normalized.includes("official") || normalized.includes("authoritative")) return 5
  if (normalized.includes("exchange") || normalized.includes("regulator")) return 4
  if (normalized.includes("company") || normalized.includes("issuer")) return 3
  if (normalized.includes("market") || normalized.includes("media")) return 2
  return 1
}

function compareNumberDesc(left?: number | null, right?: number | null) {
  return (right ?? 0) - (left ?? 0)
}

function selectEvidence(evidences: EventEvidence[]) {
  return [...evidences]
    .sort((left, right) => {
      const authority = authorityRank(right.authorityLevel) - authorityRank(left.authorityLevel)
      if (authority !== 0) return authority

      const priority = compareNumberDesc(left.sourcePriority, right.sourcePriority)
      if (priority !== 0) return priority

      const recency = compareNumberDesc(left.publishedAt ?? left.fetchedAt, right.publishedAt ?? right.fetchedAt)
      if (recency !== 0) return recency

      return left.rawId.localeCompare(right.rawId)
    })
    .slice(0, MAX_EVIDENCE)
}

function factRank(fact: EventFact) {
  let rank = 0
  if (fact.evidenceId) rank += 8
  if (fact.direction) rank += 4
  if (fact.value || fact.delta || fact.previousValue) rank += 2
  if (fact.entityId) rank += 1
  return rank
}

function selectFacts(facts: EventFact[]) {
  return [...facts]
    .sort((left, right) => {
      const rank = factRank(right) - factRank(left)
      if (rank !== 0) return rank

      const confidence = right.confidence - left.confidence
      if (confidence !== 0) return confidence

      return left.factId.localeCompare(right.factId)
    })
    .slice(0, MAX_FACTS)
}

function selectTimeline(timeline: EventTimelineEntry[]) {
  return [...timeline]
    .sort((left, right) => right.changedAt - left.changedAt || left.timelineId.localeCompare(right.timelineId))
    .slice(0, 8)
}

function summarizePayload(payload?: Record<string, unknown>) {
  if (!payload) return null
  return truncate(JSON.stringify(stableValue(payload)), MAX_PAYLOAD_CHARS)
}

function buildChecksum(snapshot: CausalHypothesisInputSnapshot) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue({
      inputBuilderVersion: snapshot.inputBuilderVersion,
      promptVersion: snapshot.promptVersion,
      modelName: snapshot.modelName,
      event: snapshot.event,
      evidence: snapshot.evidence,
      facts: snapshot.facts,
      entities: snapshot.entities,
      timeline: snapshot.timeline,
    })))
    .digest("hex")
}

export function buildCausalHypothesisInputSnapshot(
  detail: EventDetail,
  options: CausalHypothesisGenerationInputOptions,
): CausalHypothesisInputSnapshot {
  const selectedEvidence = selectEvidence(detail.evidences)
  const selectedFacts = selectFacts(detail.facts)
  const selectedTimeline = selectTimeline(detail.timeline)

  return {
    task: "Generate causal hypotheses for one canonical event.",
    inputBuilderVersion: CAUSAL_HYPOTHESIS_INPUT_BUILDER_VERSION,
    promptId: causalHypothesisPromptDefinition.id,
    promptVersion: causalHypothesisPromptDefinition.version,
    modelProvider: options.modelProvider ?? null,
    modelName: options.modelName,
    event: {
      eventId: detail.eventId,
      title: detail.title,
      summary: truncate(detail.summary),
      eventType: detail.eventType,
      eventSubType: detail.eventSubType,
      sourceKind: detail.sourceKind ?? null,
      publishedAt: detail.publishedAt ?? null,
      ingestedAt: detail.ingestedAt,
      canonicalUrl: detail.canonicalUrl ?? null,
      primaryEntityName: detail.primaryEntityName ?? null,
      affectedMarkets: detail.affectedMarkets,
      topicTags: detail.topicTags,
      latestLifecycleState: detail.latestLifecycleState ?? null,
      latestLifecycleAt: detail.latestLifecycleAt ?? null,
      sourceIds: detail.sourceIds,
    },
    evidence: selectedEvidence.map(evidence => ({
      evidenceId: evidence.rawId,
      sourceId: evidence.sourceId,
      sourceName: evidence.sourceName ?? null,
      sourceTitle: evidence.sourceTitle ?? null,
      title: truncate(evidence.title) ?? "",
      summary: truncate(evidence.summary),
      url: evidence.url ?? null,
      publishedAt: evidence.publishedAt ?? null,
      fetchedAt: evidence.fetchedAt ?? null,
      sourcePriority: evidence.sourcePriority ?? null,
      authorityLevel: evidence.authorityLevel ?? null,
      extractionStatus: evidence.extractionStatus ?? null,
    })),
    facts: selectedFacts.map(fact => ({
      factId: fact.factId,
      evidenceId: fact.evidenceId ?? null,
      factType: fact.factType,
      metricName: fact.metricName,
      value: fact.value ?? null,
      unit: fact.unit ?? null,
      previousValue: fact.previousValue ?? null,
      delta: fact.delta ?? null,
      direction: fact.direction ?? null,
      effectiveAt: fact.effectiveAt ?? null,
      entityId: fact.entityId ?? null,
      confidence: fact.confidence,
      payloadSummary: summarizePayload(fact.payload),
    })),
    entities: detail.entities.map(entity => ({
      entityType: entity.entityType,
      entityName: entity.entityName,
      code: entity.code ?? null,
      fullCode: entity.fullCode ?? null,
    })),
    timeline: selectedTimeline.map(entry => ({
      timelineId: entry.timelineId,
      stateFrom: entry.stateFrom ?? null,
      stateTo: entry.stateTo,
      changedAt: entry.changedAt,
      triggerEvidenceId: entry.triggerEvidenceId ?? null,
      actor: entry.actor ?? null,
      reason: entry.reason ?? null,
    })),
  }
}

export function buildCausalHypothesisGenerationInput(
  detail: EventDetail,
  options: CausalHypothesisGenerationInputOptions,
): CausalHypothesisGenerationInput {
  const inputSnapshot = buildCausalHypothesisInputSnapshot(detail, options)
  return {
    inputBuilderVersion: inputSnapshot.inputBuilderVersion,
    promptId: inputSnapshot.promptId,
    promptVersion: inputSnapshot.promptVersion,
    modelProvider: inputSnapshot.modelProvider,
    modelName: inputSnapshot.modelName,
    inputChecksum: buildChecksum(inputSnapshot),
    promptInput: JSON.stringify(inputSnapshot, null, 2),
    inputSnapshot,
  }
}
