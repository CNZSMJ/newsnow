import { afterEach, describe, expect, it, vi } from "vitest"
import type { EventDetail } from "@shared/types"
import availableOutput from "#/services/event-engine/causal-hypothesis/__fixtures__/available-output.json"
import {
  CAUSAL_HYPOTHESIS_PROMPT_ID,
  CAUSAL_HYPOTHESIS_PROMPT_VERSION,
  CAUSAL_HYPOTHESIS_SCHEMA_NAME,
} from "#/services/event-engine/causal-hypothesis/prompt"
import {
  getLiveCausalHypothesisGenerator,
  getLiveCausalHypothesisGeneratorStatus,
  getLiveCausalHypothesisGeneratorTimeoutMs,
} from "#/services/event-engine/causal-hypothesis/generator"

const originalFetch = globalThis.fetch

const sampleDetail: EventDetail = {
  eventId: "evt_policy_sector_1",
  title: "主管部门发布供给调整措施，相关板块情绪升温",
  summary: "政策端释放供给约束放松信号，市场报道显示相关板块成交活跃。",
  eventType: "policy",
  eventSubType: "industrial_policy",
  sourceKind: "industry_policy_notice",
  publishedAt: 1770000000000,
  ingestedAt: 1770000001000,
  importance: "high",
  affectedMarkets: ["A"],
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
  entities: [],
  facts: [{
    factId: "fact_policy_support",
    eventId: "evt_policy_sector_1",
    evidenceId: "ev_policy",
    factType: "policy_notice",
    metricName: "policy_direction",
    value: "supply_adjustment",
    direction: "up",
    confidence: 0.88,
  }],
  timeline: [],
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  if (originalFetch) {
    globalThis.fetch = originalFetch
  } else {
    delete (globalThis as Partial<typeof globalThis>).fetch
  }
})

describe("causal hypothesis live generator", () => {
  it("builds an OpenAI structured-output request with the causal hypothesis prompt", async () => {
    vi.stubEnv("EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_PROVIDER", "openai")
    vi.stubEnv("EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_MODEL", "gpt-5.4-mini")
    vi.stubEnv("EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_API_KEY", "test-openai-key")
    vi.stubEnv("EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_BASE_URL", "http://127.0.0.1:4318/v1")

    const fetchSpy = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify(availableOutput),
        }],
      }],
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }))
    globalThis.fetch = fetchSpy as typeof fetch

    const generator = getLiveCausalHypothesisGenerator()
    expect(generator).toBeTruthy()

    const result = await generator!.generate(sampleDetail)
    expect(result.validation.valid).toBe(true)
    expect(result.validation.acceptedHypotheses).toHaveLength(2)
    expect(result.generationInput.promptId).toBe(CAUSAL_HYPOTHESIS_PROMPT_ID)
    expect(result.generationInput.promptVersion).toBe(CAUSAL_HYPOTHESIS_PROMPT_VERSION)
    expect(result.generationInput.modelName).toBe("gpt-5.4-mini")

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("http://127.0.0.1:4318/v1/responses")

    const headers = new Headers((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers)
    expect(headers.get("authorization")).toBe("Bearer test-openai-key")

    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}"))
    expect(body.model).toBe("gpt-5.4-mini")
    expect(body.instructions).toContain("Use only the provided canonical event")
    expect(body.instructions).toContain("Do not output directional view")
    expect(body.text.format.name).toBe(CAUSAL_HYPOTHESIS_SCHEMA_NAME)
    expect(JSON.parse(body.input).event.eventId).toBe("evt_policy_sector_1")
  })

  it("reports missing scoped OpenAI credentials instead of enabling", () => {
    vi.stubEnv("EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_PROVIDER", "openai")
    vi.stubEnv("EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_MODEL", "gpt-5.4-mini")

    expect(getLiveCausalHypothesisGenerator()).toBeUndefined()
    expect(getLiveCausalHypothesisGeneratorStatus()).toEqual({
      enabled: false,
      provider: "openai",
      model: "gpt-5.4-mini",
      promptId: CAUSAL_HYPOTHESIS_PROMPT_ID,
      promptVersion: CAUSAL_HYPOTHESIS_PROMPT_VERSION,
      missingConfig: [
        "EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_API_KEY",
        "LLM_API_KEY",
        "OPENAI_API_KEY",
      ],
    })
  })

  it("uses a 45 second timeout budget and clamps larger values", () => {
    expect(getLiveCausalHypothesisGeneratorTimeoutMs()).toBe(45000)

    vi.stubEnv("EVENT_ENGINE_CAUSAL_HYPOTHESIS_TIMEOUT_MS", "7000")
    expect(getLiveCausalHypothesisGeneratorTimeoutMs()).toBe(7000)

    vi.stubEnv("EVENT_ENGINE_CAUSAL_HYPOTHESIS_TIMEOUT_MS", "90000")
    expect(getLiveCausalHypothesisGeneratorTimeoutMs()).toBe(45000)
  })
})
