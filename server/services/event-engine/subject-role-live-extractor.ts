import process from "node:process"
import { z } from "zod"
import type {
  SubjectRoleExtractionResult,
  SubjectRoleExtractor,
  SubjectResolutionInput,
} from "#/services/event-engine/subject-resolution"
import {
  buildSubjectRoleExtractionInput,
  SUBJECT_ROLE_EXTRACTION_PROMPT_ID,
  SUBJECT_ROLE_EXTRACTION_PROMPT_VERSION,
  SUBJECT_ROLE_EXTRACTION_RESPONSE_JSON_SCHEMA,
  SUBJECT_ROLE_EXTRACTION_SCHEMA_NAME,
  SUBJECT_ROLE_EXTRACTION_SYSTEM_PROMPT,
} from "#/services/event-engine/subject-role-prompt"
import {
  defineLlmProfile,
  getLlmProfileRuntimeConfig,
  getStructuredOutputClient,
  type LlmProviderId,
} from "#/services/llm/runtime"

interface LiveSubjectRoleExtractorConfig {
  provider: LlmProviderId | null
  url: string | null
  token: string | null
  model: string | null
  missingConfig: string[]
}

export interface LiveSubjectRoleExtractorStatus {
  enabled: boolean
  provider: LlmProviderId | null
  model: string | null
  promptId: string | null
  promptVersion: string | null
  missingConfig: string[]
}

const subjectRoleExtractionSchema = z.object({
  provider: z.literal("llm"),
  confidence: z.number().finite().min(0).max(1),
  slots: z.object({
    eventPhrases: z.array(z.string()),
    explicitCompanies: z.array(z.string()),
    explicitTickers: z.array(z.object({
      label: z.string(),
      code: z.string(),
      fullCode: z.string(),
      market: z.enum(["US", "HK"]),
    }).passthrough()),
    institutions: z.array(z.string()),
    industries: z.array(z.string()),
    markets: z.array(z.string()),
    nonEntityPhrases: z.array(z.string()),
    causalDrivers: z.array(z.string()),
  }),
})

const subjectRoleExtractionResponseSchema = z.union([
  subjectRoleExtractionSchema,
  z.object({
    result: subjectRoleExtractionSchema,
  }),
])

let cachedKey: string | null = null
let cachedExtractor: SubjectRoleExtractor | undefined
const DEFAULT_SUBJECT_ROLE_EXTRACTION_TIMEOUT_MS = 25000
const MIN_SUBJECT_ROLE_EXTRACTION_TIMEOUT_MS = 500
const MAX_SUBJECT_ROLE_EXTRACTION_TIMEOUT_MS = 45000

const subjectRoleLlmProfile = defineLlmProfile({
  id: "event-engine-subject-role",
  envPrefix: "EVENT_ENGINE_SUBJECT_ROLE",
  defaultModel: {
    openai: "gpt-5.4-mini",
    minimax: "MiniMax-M2.7",
  },
})

function clampTimeoutMs(value?: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SUBJECT_ROLE_EXTRACTION_TIMEOUT_MS
  }

  return Math.min(
    MAX_SUBJECT_ROLE_EXTRACTION_TIMEOUT_MS,
    Math.max(MIN_SUBJECT_ROLE_EXTRACTION_TIMEOUT_MS, Math.floor(parsed)),
  )
}

function getLiveExtractorConfig(): LiveSubjectRoleExtractorConfig {
  const llmRuntime = getLlmProfileRuntimeConfig(subjectRoleLlmProfile)
  return {
    provider: llmRuntime.provider,
    url: llmRuntime.baseUrl,
    token: llmRuntime.apiKey,
    model: llmRuntime.model,
    missingConfig: llmRuntime.missingConfig,
  }
}

function getOpenAIResponseText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text
  }

  const outputItems = Array.isArray(payload?.output) ? payload.output : []
  for (const item of outputItems) {
    const contentItems = Array.isArray(item?.content) ? item.content : []
    for (const content of contentItems) {
      if (typeof content?.text === "string" && content.text.trim()) {
        return content.text
      }
    }
  }

  return null
}

function normalizeExtractionResponse(payload: unknown): SubjectRoleExtractionResult {
  const directParsed = subjectRoleExtractionResponseSchema.safeParse(payload)
  if (directParsed.success) {
    return "result" in directParsed.data ? directParsed.data.result : directParsed.data
  }

  const responseText = getOpenAIResponseText(payload)
  if (!responseText) {
    throw new Error("subject_role_extraction_invalid_response")
  }

  const parsedJson = JSON.parse(responseText)
  return subjectRoleExtractionSchema.parse(parsedJson)
}

function createLlmExtractor(config: LiveSubjectRoleExtractorConfig): SubjectRoleExtractor | undefined {
  if (config.missingConfig.length || !config.provider || !config.model) return undefined

  const client = getStructuredOutputClient(subjectRoleLlmProfile)
  if (!client) return undefined

  return {
    async extract(input: SubjectResolutionInput) {
      const response = await client.generateStructuredOutput({
        instructions: SUBJECT_ROLE_EXTRACTION_SYSTEM_PROMPT,
        input: buildSubjectRoleExtractionInput(input),
        schemaName: SUBJECT_ROLE_EXTRACTION_SCHEMA_NAME,
        schema: SUBJECT_ROLE_EXTRACTION_RESPONSE_JSON_SCHEMA,
      })

      return normalizeExtractionResponse(response)
    },
  }
}

export function getLiveSubjectRoleExtractor() {
  const config = getLiveExtractorConfig()
  const cacheKey = [
    config.provider ?? "",
    config.url ?? "",
    config.token ?? "",
    config.model ?? "",
    config.missingConfig.join(","),
  ].join("|")

  if (cachedKey === cacheKey) return cachedExtractor

  cachedKey = cacheKey
  cachedExtractor = createLlmExtractor(config)

  return cachedExtractor
}

export function getLiveSubjectRoleExtractorStatus(): LiveSubjectRoleExtractorStatus {
  const config = getLiveExtractorConfig()
  return {
    enabled: Boolean(getLiveSubjectRoleExtractor()),
    provider: config.provider,
    model: config.model,
    promptId: config.provider ? SUBJECT_ROLE_EXTRACTION_PROMPT_ID : null,
    promptVersion: config.provider ? SUBJECT_ROLE_EXTRACTION_PROMPT_VERSION : null,
    missingConfig: config.missingConfig,
  }
}

export function isLiveSubjectRoleExtractorEnabled() {
  return Boolean(getLiveSubjectRoleExtractor())
}

export function getLiveSubjectRoleExtractorTimeoutMs() {
  return clampTimeoutMs(process.env.EVENT_ENGINE_SUBJECT_ROLE_TIMEOUT_MS)
}
