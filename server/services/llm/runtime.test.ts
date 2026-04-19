import { afterEach, describe, expect, it, vi } from "vitest"
import {
  defineLlmProfile,
  getLlmProfileStatus,
  getStructuredOutputClient,
} from "#/services/llm/runtime"

const originalFetch = globalThis.fetch

const testProfile = defineLlmProfile({
  id: "test-structured-output",
  envPrefix: "TEST_FEATURE",
  defaultModel: {
    openai: "gpt-5.4-mini",
    minimax: "MiniMax-M2.7",
  },
  legacyAliases: {
    provider: ["LEGACY_TEST_PROVIDER"],
    model: ["LEGACY_TEST_MODEL"],
  },
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  if (originalFetch) {
    globalThis.fetch = originalFetch
  } else {
    delete (globalThis as Partial<typeof globalThis>).fetch
  }
})

describe("llm runtime", () => {
  it("prefers feature-scoped configuration over shared defaults", () => {
    vi.stubEnv("LLM_PROVIDER", "openai")
    vi.stubEnv("LLM_API_KEY", "shared-key")
    vi.stubEnv("LLM_MODEL", "shared-model")
    vi.stubEnv("TEST_FEATURE_LLM_MODEL", "feature-model")

    expect(getLlmProfileStatus(testProfile)).toEqual({
      enabled: true,
      provider: "openai",
      model: "feature-model",
      missingConfig: [],
    })
  })

  it("reports preferred api-key envs when a profile is enabled without credentials", () => {
    vi.stubEnv("TEST_FEATURE_LLM_PROVIDER", "openai")

    expect(getLlmProfileStatus(testProfile)).toEqual({
      enabled: false,
      provider: "openai",
      model: "gpt-5.4-mini",
      missingConfig: [
        "TEST_FEATURE_LLM_API_KEY",
        "LLM_API_KEY",
        "OPENAI_API_KEY",
      ],
    })
  })

  it("sends OpenAI-compatible structured-output requests", async () => {
    vi.stubEnv("TEST_FEATURE_LLM_PROVIDER", "openai")
    vi.stubEnv("TEST_FEATURE_LLM_MODEL", "feature-model")
    vi.stubEnv("TEST_FEATURE_LLM_API_KEY", "feature-key")
    vi.stubEnv("TEST_FEATURE_LLM_BASE_URL", "http://127.0.0.1:9911/v1")

    const fetchSpy = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            provider: "llm",
            confidence: 0.91,
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

    const client = getStructuredOutputClient(testProfile)
    expect(client).toBeTruthy()

    const result = await client!.generateStructuredOutput({
      instructions: "Return structured JSON only.",
      input: "{\"title\":\"台积电法说会\"}",
      schemaName: "test_schema",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          provider: {
            type: "string",
          },
          confidence: {
            type: "number",
          },
        },
        required: ["provider", "confidence"],
      },
    })

    expect(result).toEqual({
      provider: "llm",
      confidence: 0.91,
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const url = fetchSpy.mock.calls[0]?.[0]
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
    expect(String(url)).toBe("http://127.0.0.1:9911/v1/responses")
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer feature-key")

    const body = JSON.parse(String(init?.body ?? "{}"))
    expect(body.model).toBe("feature-model")
    expect(body.temperature).toBe(0)
    expect(body.instructions).toBe("Return structured JSON only.")
    expect(body.input).toBe("{\"title\":\"台积电法说会\"}")
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      name: "test_schema",
      strict: true,
    })
  })

  it("keeps legacy provider and model aliases working", () => {
    vi.stubEnv("LEGACY_TEST_PROVIDER", "openai")
    vi.stubEnv("LEGACY_TEST_MODEL", "legacy-model")
    vi.stubEnv("OPENAI_API_KEY", "legacy-key")

    expect(getLlmProfileStatus(testProfile)).toEqual({
      enabled: true,
      provider: "openai",
      model: "legacy-model",
      missingConfig: [],
    })
  })

  it("supports minimax as a first-class provider with provider-specific env aliases", () => {
    vi.stubEnv("LLM_PROVIDER", "minimax")
    vi.stubEnv("MINIMAX_API_KEY", "minimax-key")

    expect(getLlmProfileStatus(testProfile)).toEqual({
      enabled: true,
      provider: "minimax",
      model: "MiniMax-M2.7",
      missingConfig: [],
    })
  })

  it("sends MiniMax structured-output calls over chat completions", async () => {
    vi.stubEnv("LLM_PROVIDER", "minimax")
    vi.stubEnv("MINIMAX_API_KEY", "minimax-key")
    vi.stubEnv("MINIMAX_BASE_URL", "http://127.0.0.1:9912/v1")
    vi.stubEnv("MINIMAX_MODEL", "MiniMax-M2.1")

    const fetchSpy = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            provider: "llm",
            confidence: 0.89,
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

    const client = getStructuredOutputClient(testProfile)
    expect(client).toBeTruthy()

    const result = await client!.generateStructuredOutput({
      instructions: "Return structured JSON only.",
      input: "{\"title\":\"台积电法说会\"}",
      schemaName: "test_schema",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          provider: {
            type: "string",
          },
          confidence: {
            type: "number",
          },
        },
        required: ["provider", "confidence"],
      },
    })

    expect(result).toEqual({
      provider: "llm",
      confidence: 0.89,
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const url = fetchSpy.mock.calls[0]?.[0]
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
    expect(String(url)).toBe("http://127.0.0.1:9912/v1/chat/completions")
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer minimax-key")

    const body = JSON.parse(String(init?.body ?? "{}"))
    expect(body.model).toBe("MiniMax-M2.1")
    expect(body.temperature).toBe(0)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].content).toContain("Return valid JSON only")
    expect(body.messages[0].content).toContain("\"required\":[\"provider\",\"confidence\"]")
    expect(body.messages[1].content).toBe("{\"title\":\"台积电法说会\"}")
    expect(body.reasoning_split).toBe(true)
  })

  it("strips MiniMax reasoning tags before parsing structured JSON", async () => {
    vi.stubEnv("LLM_PROVIDER", "minimax")
    vi.stubEnv("MINIMAX_API_KEY", "minimax-key")
    vi.stubEnv("MINIMAX_BASE_URL", "http://127.0.0.1:9912/v1")
    vi.stubEnv("MINIMAX_MODEL", "MiniMax-M2.1")

    const fetchSpy = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{
        message: {
          content: "<think>\nLet me analyze the title first.\n</think>\n{\"provider\":\"llm\",\"confidence\":0.87}",
        },
      }],
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }))
    globalThis.fetch = fetchSpy as typeof fetch

    const client = getStructuredOutputClient(testProfile)
    const result = await client!.generateStructuredOutput({
      instructions: "Return structured JSON only.",
      input: "{\"title\":\"台积电法说会\"}",
      schemaName: "test_schema",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          provider: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["provider", "confidence"],
      },
    })

    expect(result).toEqual({
      provider: "llm",
      confidence: 0.87,
    })
  })
})
