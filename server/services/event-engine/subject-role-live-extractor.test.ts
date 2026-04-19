import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildSubjectRoleExtractionInput,
  SUBJECT_ROLE_EXTRACTION_PROMPT_ID,
  SUBJECT_ROLE_EXTRACTION_PROMPT_VERSION,
  SUBJECT_ROLE_EXTRACTION_SCHEMA_NAME,
  SUBJECT_ROLE_EXTRACTION_SYSTEM_PROMPT,
} from "#/services/event-engine/subject-role-prompt"
import {
  getLiveSubjectRoleExtractor,
  getLiveSubjectRoleExtractorStatus,
  getLiveSubjectRoleExtractorTimeoutMs,
} from "#/services/event-engine/subject-role-live-extractor"
import type { SubjectResolutionInput } from "#/services/event-engine/subject-resolution"

const originalFetch = globalThis.fetch

const sampleInput: SubjectResolutionInput = {
  eventId: "evt_tsmc_briefing",
  title: "台积电法说会：AI需求极为强劲，供不应求将持续至至少2027年",
  summary: "魏哲家称，对2026年台积全年营收以美元计成长超过30%充满信心。",
  eventType: "industry" as const,
  eventSubType: "industry_news" as const,
  sourceKind: "media_analysis" as const,
  topicTags: ["ai-computing"],
  affectedMarkets: ["A", "HK"],
  payload: {
    id: "raw_tsmc_briefing",
    title: "台积电法说会：AI需求极为强劲，供不应求将持续至至少2027年",
    url: "https://example.com/tsmc-briefing",
    extra: {
      info: "管理层强调先进封装和AI需求持续强劲。",
    },
  },
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

describe("subject role live extractor", () => {
  it("builds an OpenAI Responses structured-output request with the subject-role prompt", async () => {
    vi.stubEnv("EVENT_ENGINE_SUBJECT_ROLE_LLM_PROVIDER", "openai")
    vi.stubEnv("EVENT_ENGINE_SUBJECT_ROLE_LLM_MODEL", "gpt-5.4-mini")
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key")
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:4318/v1")

    const fetchSpy = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            provider: "llm",
            confidence: 0.93,
            slots: {
              eventPhrases: ["法说会"],
              explicitCompanies: ["台积电"],
              explicitTickers: [],
              institutions: [],
              industries: ["ai-computing"],
              markets: ["A股", "港股"],
              nonEntityPhrases: ["AI需求极为强劲"],
              causalDrivers: ["AI需求持续强劲"],
            },
          }),
        }],
      }],
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }))
    globalThis.fetch = fetchSpy as typeof fetch

    const extractor = getLiveSubjectRoleExtractor()
    expect(extractor).toBeTruthy()

    const result = await extractor!.extract(sampleInput)
    expect(result.slots.explicitCompanies).toEqual(["台积电"])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = fetchSpy.mock.calls[0]?.[0]
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
    expect(url).toBeTruthy()
    expect(String(url)).toBe("http://127.0.0.1:4318/v1/responses")

    const headers = new Headers(init?.headers)
    expect(headers.get("authorization")).toBe("Bearer test-openai-key")

    const body = JSON.parse(String(init?.body ?? "{}"))
    expect(body.model).toBe("gpt-5.4-mini")
    expect(body.store).toBe(false)
    expect(body.instructions).toContain("You are not the security registry.")
    expect(body.instructions).toContain("directly impacted product chain, sector, or supply-chain segment")
    expect(body.instructions).toContain("台积电法说会")
    expect(body.text.format.name).toBe(SUBJECT_ROLE_EXTRACTION_SCHEMA_NAME)
    expect(body.text.format.schema.required).toContain("slots")
    expect(JSON.parse(body.input)).toMatchObject({
      eventContext: {
        title: sampleInput.title,
        eventType: "industry",
      },
      sourceText: {
        payloadInfo: sampleInput.payload!.extra!.info,
      },
    })
  })

  it("reports missing OpenAI credentials in extractor status instead of silently enabling", () => {
    vi.stubEnv("EVENT_ENGINE_SUBJECT_ROLE_LLM_PROVIDER", "openai")
    vi.stubEnv("EVENT_ENGINE_SUBJECT_ROLE_LLM_MODEL", "gpt-5.4-mini")

    expect(getLiveSubjectRoleExtractor()).toBeUndefined()
    expect(getLiveSubjectRoleExtractorStatus()).toEqual({
      enabled: false,
      provider: "openai",
      model: "gpt-5.4-mini",
      promptId: SUBJECT_ROLE_EXTRACTION_PROMPT_ID,
      promptVersion: SUBJECT_ROLE_EXTRACTION_PROMPT_VERSION,
      missingConfig: [
        "EVENT_ENGINE_SUBJECT_ROLE_LLM_API_KEY",
        "LLM_API_KEY",
        "OPENAI_API_KEY",
      ],
    })
  })

  it("inherits shared llm defaults when the feature does not override them", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai")
    vi.stubEnv("LLM_MODEL", "gpt-5.4-mini")
    vi.stubEnv("LLM_API_KEY", "shared-openai-key")
    vi.stubEnv("LLM_BASE_URL", "http://127.0.0.1:4318/v1")

    const fetchSpy = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            provider: "llm",
            confidence: 0.88,
            slots: {
              eventPhrases: ["法说会"],
              explicitCompanies: ["台积电"],
              explicitTickers: [],
              institutions: [],
              industries: [],
              markets: [],
              nonEntityPhrases: [],
              causalDrivers: [],
            },
          }),
        }],
      }],
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }))
    globalThis.fetch = fetchSpy as typeof fetch

    const extractor = getLiveSubjectRoleExtractor()
    const result = await extractor!.extract(sampleInput)

    expect(result.slots.explicitCompanies).toEqual(["台积电"])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("http://127.0.0.1:4318/v1/responses")
  })

  it("supports MiniMax through the shared llm runtime", async () => {
    vi.stubEnv("LLM_PROVIDER", "minimax")
    vi.stubEnv("MINIMAX_API_KEY", "shared-minimax-key")
    vi.stubEnv("MINIMAX_BASE_URL", "http://127.0.0.1:4319/v1")

    const fetchSpy = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            provider: "llm",
            confidence: 0.9,
            slots: {
              eventPhrases: ["法说会"],
              explicitCompanies: ["台积电"],
              explicitTickers: [],
              institutions: ["台积电"],
              industries: ["ai-computing"],
              markets: ["A股", "港股"],
              nonEntityPhrases: ["AI需求极为强劲"],
              causalDrivers: ["AI需求持续强劲"],
            },
          }),
        },
      }],
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }))
    globalThis.fetch = fetchSpy as typeof fetch

    const extractor = getLiveSubjectRoleExtractor()
    expect(extractor).toBeTruthy()

    const result = await extractor!.extract(sampleInput)
    expect(result.slots.explicitCompanies).toEqual(["台积电"])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("http://127.0.0.1:4319/v1/chat/completions")

    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}"))
    expect(body.model).toBe("MiniMax-M2.7")
    expect(body.messages[0].content).toContain("Never invent canonical listed companies")
    expect(body.messages[0].content).toContain("put the tightest watch target into `industries`")
  })

  it("keeps the prompt focused on slots instead of canonical mapping", () => {
    expect(SUBJECT_ROLE_EXTRACTION_PROMPT_ID).toBe("subject-role-extractor")
    expect(SUBJECT_ROLE_EXTRACTION_PROMPT_VERSION).toBe("subject-role-extractor-v2")
    expect(SUBJECT_ROLE_EXTRACTION_SYSTEM_PROMPT).toContain("Return JSON only")
    expect(SUBJECT_ROLE_EXTRACTION_SYSTEM_PROMPT).toContain("Never invent canonical listed companies")
    expect(SUBJECT_ROLE_EXTRACTION_SYSTEM_PROMPT).toContain("put the tightest watch target into `industries`")
    expect(SUBJECT_ROLE_EXTRACTION_SYSTEM_PROMPT).toContain("nonEntityPhrases")

    const renderedInput = JSON.parse(buildSubjectRoleExtractionInput(sampleInput))
    expect(renderedInput.eventContext.eventSubType).toBe("industry_news")
    expect(renderedInput.sourceText.payloadInfo).toBe(sampleInput.payload!.extra!.info)
  })

  it("uses a wider configurable timeout budget for live llm extraction", () => {
    expect(getLiveSubjectRoleExtractorTimeoutMs()).toBe(25000)

    vi.stubEnv("EVENT_ENGINE_SUBJECT_ROLE_TIMEOUT_MS", "7000")
    expect(getLiveSubjectRoleExtractorTimeoutMs()).toBe(7000)
  })
})
