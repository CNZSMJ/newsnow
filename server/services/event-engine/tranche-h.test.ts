import { describe, expect, it } from "vitest"
import type { EventBaseQualitySnapshot } from "#/services/event-engine/slo"
import { evaluateEventQualityGates } from "#/services/event-engine/quality-gates"
import {
  deriveTrancheHBlindLlmConfidence,
  REQUIRED_TRANCHE_H_GOLDEN_FAMILIES,
  TRANCHE_H_ERROR_LABELS,
  TRANCHE_H_REPLAY_FIXTURE_CATALOG,
  deriveTrancheHBlindRiskFlags,
  evaluateTrancheHScorecard,
  planDailyTrancheHBlindReview,
} from "#/services/event-engine/tranche-h"

function createSnapshot(overrides?: Partial<EventBaseQualitySnapshot>): EventBaseQualitySnapshot {
  return {
    generatedAt: Date.UTC(2026, 3, 19, 0, 0, 0),
    windowStartAt: Date.UTC(2026, 3, 18, 0, 0, 0),
    highValue: {
      sourceKinds: [],
      totalEventCount: 100,
      structuredEventCount: 91,
      degradedEventCount: 0,
      genericFallbackEventCount: 2,
      structuredCoveragePct: 91,
      genericFallbackSharePct: 2,
      coarsePublicationClockEventCount: 10,
      backlogCatchupEventCount: 4,
      latencySampleCount: 90,
      avgIngestLatencyMs: 100000,
      p95IngestLatencyMs: 120000,
      initialCanonicalLatency: {
        instrumentation: "automated",
        latencySampleCount: 90,
        avgLatencyMs: 100000,
        p95LatencyMs: 120000,
      },
      fullSemanticEnrichmentLatency: {
        instrumentation: "not_instrumented",
        latencySampleCount: 0,
        avgLatencyMs: null,
        p95LatencyMs: null,
      },
    },
    latencyTiers: [],
    highValueSourceEventCount: 100,
    highValueStructuredEventCount: 91,
    highValueStructuredCoveragePct: 91,
    highValueDegradedEventCount: 0,
    highValueGenericFallbackEventCount: 2,
    highValueGenericFallbackSharePct: 2,
    highValueCoarsePublicationClockEventCount: 10,
    highValueBacklogCatchupEventCount: 4,
    prioritySourceAvgIngestLatencyMs: 100000,
    prioritySourceIngestLatencyP95Ms: 120000,
    tradeCriticalInitialCanonicalLatencyP95Ms: 120000,
    highValueNonIntradayInitialCanonicalLatencyP95Ms: 600000,
    longFormHeavyParsingInitialCanonicalLatencyP95Ms: 900000,
    ...overrides,
  }
}

describe("Tranche H scorecard", () => {
  it("ships a replay fixture catalog that covers every required golden family", () => {
    expect(new Set(TRANCHE_H_REPLAY_FIXTURE_CATALOG.map(item => item.family))).toEqual(new Set(REQUIRED_TRANCHE_H_GOLDEN_FAMILIES))
    expect(TRANCHE_H_REPLAY_FIXTURE_CATALOG.every(item => item.reviewFocus.length > 0)).toBe(true)
  })

  it("declares the full 95-point metric contract with required taxonomy and thresholds", () => {
    const scorecard = evaluateTrancheHScorecard({
      snapshot: createSnapshot(),
      sampledMetrics: {
        wrongMergeRatePct: 1,
        missedMergeRatePct: 2,
        primarySubjectPrecisionPct: 98,
        falseTradableSubjectRatePct: 1,
        eventFamilyPrecisionPct: 97,
        keyFactCompletenessPct: 85,
        evidenceLinkedFactRatePct: 95,
        timelineNoiseRatioPct: 5,
      },
    })

    expect(scorecard.contractVersion).toBe("tranche-h-scorecard-v1")
    expect(scorecard.requiredErrorLabels).toEqual([
      "wrong_merge",
      "missed_merge",
      "false_primary_subject",
      "false_tradable_subject",
      "family_misclassification",
      "missing_key_facts",
      "timeline_noise",
    ] satisfies typeof TRANCHE_H_ERROR_LABELS)
    expect(scorecard.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "wrongMergeRatePct",
        target: 1,
        comparator: "<=",
      }),
      expect.objectContaining({
        key: "primarySubjectPrecisionPct",
        target: 98,
        comparator: ">=",
      }),
      expect.objectContaining({
        key: "highValueGenericFallbackSharePct",
        target: 2,
        comparator: "<=",
        measured: 2,
      }),
      expect.objectContaining({
        key: "structuredFactCoveragePct",
        target: 90,
        comparator: ">=",
        measured: 91,
      }),
    ]))
    expect(scorecard.requiredGoldenFamilies).toEqual(REQUIRED_TRANCHE_H_GOLDEN_FAMILIES)
  })

  it("is embedded into event quality review output so check-quality and ops APIs can expose it", () => {
    const result = evaluateEventQualityGates(createSnapshot())

    expect(result.scorecards.trancheH.contractVersion).toBe("tranche-h-scorecard-v1")
    expect(result.scorecards.trancheH.requiredErrorLabels).toEqual(TRANCHE_H_ERROR_LABELS)
    expect(result.scorecards.trancheH.gates).toHaveLength(10)
  })
})

describe("Tranche H blind review planning", () => {
  it("derives persisted LLM confidence from timeline metadata for blind review sampling", () => {
    expect(deriveTrancheHBlindLlmConfidence({
      timelineMetadata: [
        {
          subjectResolutionProvider: "deterministic",
          subjectResolutionConfidence: 0.72,
        },
        {
          subjectResolutionProvider: "llm",
          subjectResolutionConfidence: 0.62,
        },
        {
          subjectResolutionProvider: "llm",
          subjectResolutionConfidence: 0.91,
        },
      ],
    })).toBe(62)
  })

  it("derives high-risk review flags from fallback, provisional, conflict, and low-confidence signals", () => {
    expect(deriveTrancheHBlindRiskFlags({
      eventType: "news",
      eventSubType: "other",
      sourceKind: "industry_news_feed",
      entityResolvers: ["llm-provisional-institution"],
      timelineReasons: ["merge_conflict_candidate"],
      llmConfidence: 62,
    })).toEqual([
      "generic_fallback",
      "unmapped_role",
      "merge_conflict",
      "low_confidence_llm",
    ])
  })

  it("builds a daily plan that mixes random samples with required high-risk buckets", () => {
    const plan = planDailyTrancheHBlindReview({
      generatedAt: Date.UTC(2026, 3, 19, 2, 0, 0),
      randomSampleSize: 2,
      highRiskSampleSize: 4,
      candidates: [
        {
          eventId: "evt_random_1",
          title: "普通公告样本",
          sourceId: "cninfo-szse",
          sourceKind: "exchange_disclosure",
          riskFlags: [],
        },
        {
          eventId: "evt_random_2",
          title: "普通政策样本",
          sourceId: "gov",
          sourceKind: "official_policy_notice",
          riskFlags: [],
        },
        {
          eventId: "evt_generic",
          title: "泛化 fallback 样本",
          sourceId: "cls-telegraph",
          sourceKind: "media_fast_feed",
          riskFlags: ["generic_fallback"],
        },
        {
          eventId: "evt_unmapped",
          title: "未映射主体样本",
          sourceId: "wallstreetcn-quick",
          sourceKind: "media_fast_feed",
          riskFlags: ["unmapped_role"],
        },
        {
          eventId: "evt_conflict",
          title: "合并冲突样本",
          sourceId: "cninfo-szse",
          sourceKind: "exchange_disclosure",
          riskFlags: ["merge_conflict"],
        },
        {
          eventId: "evt_new_family",
          title: "新 family 样本",
          sourceId: "caam-nev-news",
          sourceKind: "industry_news_feed",
          riskFlags: ["new_family"],
        },
        {
          eventId: "evt_low_confidence",
          title: "低置信 LLM 样本",
          sourceId: "jin10",
          sourceKind: "media_fast_feed",
          riskFlags: ["low_confidence_llm"],
        },
      ],
    })

    expect(plan.contractVersion).toBe("tranche-h-blind-review-v1")
    expect(plan.summary.totalSelected).toBe(6)
    expect(plan.summary.highRiskBucketsCovered).toEqual([
      "generic_fallback",
      "unmapped_role",
      "merge_conflict",
      "new_family",
    ])
    expect(plan.highRiskQueue).toHaveLength(4)
    expect(plan.randomQueue).toHaveLength(2)
  })
})
