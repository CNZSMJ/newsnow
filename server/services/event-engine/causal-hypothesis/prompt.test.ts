import { describe, expect, it } from "vitest"
import type { EventDetail } from "@shared/types"
import { EVENT_ENGINE_PROMPTS, getCausalHypothesisPromptDefinition } from "#/services/event-engine/prompt-registry"
import {
  CAUSAL_HYPOTHESIS_PROMPT_ID,
  CAUSAL_HYPOTHESIS_PROMPT_VERSION,
  CAUSAL_HYPOTHESIS_RESPONSE_JSON_SCHEMA,
  CAUSAL_HYPOTHESIS_SCHEMA_NAME,
  CAUSAL_HYPOTHESIS_SYSTEM_PROMPT,
  buildCausalHypothesisPromptInput,
} from "#/services/event-engine/causal-hypothesis/prompt"
import {
  CAUSAL_HYPOTHESIS_INPUT_BUILDER_VERSION,
  buildCausalHypothesisGenerationInput,
} from "#/services/event-engine/causal-hypothesis/input"
import { validateCausalHypothesisModelOutput } from "#/services/event-engine/causal-hypothesis/quality"
import availableOutput from "#/services/event-engine/causal-hypothesis/__fixtures__/available-output.json"
import invalidOutput from "#/services/event-engine/causal-hypothesis/__fixtures__/invalid-output.json"
import unknownOutput from "#/services/event-engine/causal-hypothesis/__fixtures__/unknown-output.json"

const sampleDetail: EventDetail = {
  eventId: "evt_policy_sector_1",
  title: "主管部门发布供给调整措施，相关板块情绪升温",
  summary: "政策端释放供给约束放松信号，市场报道显示相关板块成交活跃。",
  eventType: "policy",
  eventSubType: "industrial_policy",
  sourceKind: "industry_policy_notice",
  publishedAt: 1770000000000,
  ingestedAt: 1770000001000,
  canonicalUrl: "https://example.com/policy",
  primaryEntityName: "光伏产业",
  importance: "high",
  sentiment: "positive",
  directionalView: "positive",
  materialityScore: 0.82,
  tradabilityScore: 0.74,
  authorityScore: 0.91,
  affectedMarkets: ["A"],
  impactSummary: ["供给政策调整影响行业盈利预期"],
  latestLifecycleState: "confirmed",
  latestLifecycleAt: 1770000003000,
  topicTags: ["photovoltaic"],
  evidenceCount: 2,
  sourceIds: ["cls-telegraph"],
  evidences: [
    {
      eventId: "evt_policy_sector_1",
      rawId: "ev_policy",
      sourceId: "cls-telegraph",
      sourceName: "主管部门",
      title: "主管部门发布调整措施",
      summary: "主管部门发布调整措施，提出优化供给节奏。",
      url: "https://example.com/policy",
      publishedAt: 1770000000000,
      fetchedAt: 1770000001000,
      sourcePriority: 100,
      authorityLevel: "official",
      extractionStatus: "ready",
    },
    {
      eventId: "evt_policy_sector_1",
      rawId: "ev_market",
      sourceId: "eastmoney-7x24",
      sourceName: "东方财富",
      title: "相关板块情绪升温",
      summary: "市场报道显示相关板块成交活跃。",
      url: "https://example.com/market",
      publishedAt: 1770000002000,
      fetchedAt: 1770000003000,
      sourcePriority: 60,
      authorityLevel: "market_media",
      extractionStatus: "ready",
    },
  ],
  entities: [{
    eventId: "evt_policy_sector_1",
    entityType: "industry",
    entityName: "光伏产业",
    confidence: 0.9,
    resolver: "fixture",
  }],
  facts: [{
    factId: "fact_policy_support",
    eventId: "evt_policy_sector_1",
    evidenceId: "ev_policy",
    factType: "policy_notice",
    metricName: "policy_direction",
    value: "supply_adjustment",
    direction: "up",
    entityId: "industry:光伏产业",
    confidence: 0.88,
    payload: {
      policyType: "supply",
    },
  }],
  timeline: [{
    timelineId: "tl_confirmed",
    eventId: "evt_policy_sector_1",
    stateTo: "confirmed",
    changedAt: 1770000003000,
    triggerEvidenceId: "ev_policy",
    reason: "official_confirmation",
  }],
}

describe("causal hypothesis prompt contract", () => {
  it("registers a versioned causal-hypothesis prompt definition", () => {
    expect(EVENT_ENGINE_PROMPTS.causalHypothesisGenerator).toBe(getCausalHypothesisPromptDefinition())
    expect(CAUSAL_HYPOTHESIS_PROMPT_ID).toBe("causal-hypothesis-generator")
    expect(CAUSAL_HYPOTHESIS_PROMPT_VERSION).toBe("causal-hypothesis-generator-v1")
    expect(getCausalHypothesisPromptDefinition().id).toBe(CAUSAL_HYPOTHESIS_PROMPT_ID)
    expect(getCausalHypothesisPromptDefinition().version).toBe(CAUSAL_HYPOTHESIS_PROMPT_VERSION)
  })

  it("keeps the prompt scoped to causal hypotheses instead of investment conclusions", () => {
    expect(CAUSAL_HYPOTHESIS_SCHEMA_NAME).toBe("newsnow_causal_hypothesis_output")
    expect(CAUSAL_HYPOTHESIS_SYSTEM_PROMPT).toContain("canonical event")
    expect(CAUSAL_HYPOTHESIS_SYSTEM_PROMPT).toContain("basis = \"stated\"")
    expect(CAUSAL_HYPOTHESIS_SYSTEM_PROMPT).toContain("basis = \"inferred\"")
    expect(CAUSAL_HYPOTHESIS_SYSTEM_PROMPT).toContain("status = \"unknown\"")
    expect(CAUSAL_HYPOTHESIS_SYSTEM_PROMPT).toContain("Do not output directional view")
    expect(CAUSAL_HYPOTHESIS_SYSTEM_PROMPT).toContain("Do not browse")
    expect(CAUSAL_HYPOTHESIS_RESPONSE_JSON_SCHEMA.properties.status.enum).toEqual(["available", "unknown"])
    expect(CAUSAL_HYPOTHESIS_RESPONSE_JSON_SCHEMA.required).toEqual([
      "status",
      "confidence",
      "hypotheses",
      "unknownReason",
    ])
  })

  it("builds bounded model input from canonical event detail only", () => {
    const rendered = JSON.parse(buildCausalHypothesisPromptInput(sampleDetail, {
      modelProvider: "openai",
      modelName: "gpt-5.4-mini",
    }))

    expect(rendered.inputBuilderVersion).toBe(CAUSAL_HYPOTHESIS_INPUT_BUILDER_VERSION)
    expect(rendered.promptVersion).toBe(CAUSAL_HYPOTHESIS_PROMPT_VERSION)
    expect(rendered.event).toMatchObject({
      eventId: "evt_policy_sector_1",
      title: sampleDetail.title,
      eventType: "policy",
      eventSubType: "industrial_policy",
      sourceKind: "industry_policy_notice",
      affectedMarkets: ["A"],
      topicTags: ["photovoltaic"],
    })
    expect(rendered.evidence.map((item: { evidenceId: string }) => item.evidenceId)).toEqual([
      "ev_policy",
      "ev_market",
    ])
    expect(rendered.facts.map((item: { factId: string }) => item.factId)).toEqual(["fact_policy_support"])
    expect(rendered.entities).toEqual([{
      entityType: "industry",
      entityName: "光伏产业",
      code: null,
      fullCode: null,
    }])
    expect(JSON.stringify(rendered)).not.toContain("directionalView")
    expect(JSON.stringify(rendered)).not.toContain("materialityScore")
    expect(JSON.stringify(rendered)).not.toContain("tradabilityScore")
  })

  it("builds a deterministic generation input and checksum", () => {
    const generationInput = buildCausalHypothesisGenerationInput(sampleDetail, {
      modelProvider: "openai",
      modelName: "gpt-5.4-mini",
    })
    const repeated = buildCausalHypothesisGenerationInput(sampleDetail, {
      modelProvider: "openai",
      modelName: "gpt-5.4-mini",
    })

    expect(generationInput.inputBuilderVersion).toBe(CAUSAL_HYPOTHESIS_INPUT_BUILDER_VERSION)
    expect(generationInput.promptVersion).toBe(CAUSAL_HYPOTHESIS_PROMPT_VERSION)
    expect(generationInput.modelName).toBe("gpt-5.4-mini")
    expect(generationInput.inputChecksum).toMatch(/^[a-f0-9]{64}$/)
    expect(repeated.inputChecksum).toBe(generationInput.inputChecksum)
    expect(generationInput.inputSnapshot.inputBuilderVersion).toBe(CAUSAL_HYPOTHESIS_INPUT_BUILDER_VERSION)
    expect(generationInput.inputSnapshot.promptVersion).toBe(CAUSAL_HYPOTHESIS_PROMPT_VERSION)
    expect(generationInput.promptInput).toBe(JSON.stringify(generationInput.inputSnapshot, null, 2))
  })
})

describe("causal hypothesis output validation", () => {
  it("accepts available output with stated and inferred hypotheses", () => {
    const result = validateCausalHypothesisModelOutput(availableOutput, {
      selectedEvidenceIds: ["ev_policy", "ev_market"],
      selectedFactIds: ["fact_policy_support"],
    })

    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error(result.validationSummary)

    expect(result.runStatus).toBe("succeeded")
    expect(result.output.status).toBe("available")
    expect(result.acceptedHypotheses).toHaveLength(2)
    expect(result.acceptedHypotheses.map(item => item.basis)).toEqual(["stated", "inferred"])
    expect(result.acceptedHypotheses.map(item => item.causeType)).toEqual([
      "policy_or_regulation",
      "market_flow_or_sentiment",
    ])
    expect(result.invalidHypothesisCount).toBe(0)
  })

  it("accepts unknown output without hypotheses", () => {
    const result = validateCausalHypothesisModelOutput(unknownOutput, {
      selectedEvidenceIds: ["ev_policy"],
      selectedFactIds: ["fact_policy_support"],
    })

    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error(result.validationSummary)

    expect(result.runStatus).toBe("unknown")
    expect(result.output.status).toBe("unknown")
    expect(result.acceptedHypotheses).toEqual([])
    expect(result.output.unknownReason).toContain("原因线索")
  })

  it("rejects schema-invalid output before active hypotheses can be written", () => {
    const result = validateCausalHypothesisModelOutput(invalidOutput, {
      selectedEvidenceIds: ["ev_policy"],
      selectedFactIds: ["fact_policy_support"],
    })

    expect(result.valid).toBe(false)
    if (result.valid) throw new Error("expected invalid output")

    expect(result.runStatus).toBe("failed")
    expect(result.errorCode).toBe("causal_hypothesis_schema_invalid")
    expect(result.acceptedHypotheses).toEqual([])
  })

  it("rejects schema-valid output when every hypothesis references missing evidence or facts", () => {
    const result = validateCausalHypothesisModelOutput({
      status: "available",
      confidence: 0.7,
      hypotheses: [{
        statement: "原因依赖不存在的证据。",
        causeType: "external_event",
        basis: "inferred",
        confidence: 0.6,
        rationale: "引用不存在。",
        evidenceIds: ["missing_evidence"],
        factIds: ["missing_fact"],
        evidenceSpans: [{
          evidenceId: "missing_evidence",
          field: "summary",
          snippet: "missing",
        }],
      }],
      unknownReason: null,
    }, {
      selectedEvidenceIds: ["ev_policy"],
      selectedFactIds: ["fact_policy_support"],
    })

    expect(result.valid).toBe(false)
    if (result.valid) throw new Error("expected invalid references")

    expect(result.runStatus).toBe("failed")
    expect(result.errorCode).toBe("causal_hypothesis_invalid_references")
    expect(result.acceptedHypotheses).toEqual([])
    expect(result.invalidHypothesisCount).toBe(1)
  })
})
