import process from "node:process"
import { z } from "zod"
import {
  WATCH_TARGET_CANDIDATE_PROMPT_ID,
  WATCH_TARGET_CANDIDATE_PROMPT_VERSION,
  WATCH_TARGET_CANDIDATE_RESPONSE_JSON_SCHEMA,
  WATCH_TARGET_CANDIDATE_SCHEMA_NAME,
  WATCH_TARGET_CANDIDATE_SYSTEM_PROMPT,
  buildWatchTargetCandidateInput,
  type WatchTargetCandidateInput,
} from "#/services/event-engine/watch-target-prompt"
import {
  defineLlmProfile,
  getLlmProfileRuntimeConfig,
  getStructuredOutputClient,
  type LlmProviderId,
} from "#/services/llm/runtime"

export interface WatchTargetCandidateExtractionResult {
  provider: "llm"
  confidence: number
  candidates: Array<{
    label: string
    reason: string
    confidence: number
  }>
}

export interface WatchTargetCandidateExtractor {
  extract(input: WatchTargetCandidateInput): Promise<WatchTargetCandidateExtractionResult>
}

interface LiveWatchTargetCandidateExtractorConfig {
  provider: LlmProviderId | null
  url: string | null
  token: string | null
  model: string | null
  missingConfig: string[]
}

export interface LiveWatchTargetCandidateExtractorStatus {
  enabled: boolean
  provider: LlmProviderId | null
  model: string | null
  promptId: string | null
  promptVersion: string | null
  missingConfig: string[]
}

const watchTargetCandidateSchema = z.object({
  provider: z.literal("llm"),
  confidence: z.number().finite().min(0).max(1),
  candidates: z.array(z.object({
    label: z.string(),
    reason: z.string(),
    confidence: z.number().finite().min(0).max(1),
  })),
})

const watchTargetCandidateResponseSchema = z.union([
  watchTargetCandidateSchema,
  z.object({
    result: watchTargetCandidateSchema,
  }),
])

const DEFAULT_WATCH_TARGET_TIMEOUT_MS = 25000
const MIN_WATCH_TARGET_TIMEOUT_MS = 500
const MAX_WATCH_TARGET_TIMEOUT_MS = 45000

const watchTargetLlmProfile = defineLlmProfile({
  id: "event-engine-watch-target-candidate",
  envPrefix: "EVENT_ENGINE_WATCH_TARGET",
  defaultModel: {
    openai: "gpt-5.4-mini",
    minimax: "MiniMax-M2.7",
  },
})

let cachedKey: string | null = null
let cachedExtractor: WatchTargetCandidateExtractor | undefined

function clampTimeoutMs(value?: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WATCH_TARGET_TIMEOUT_MS
  }

  return Math.min(
    MAX_WATCH_TARGET_TIMEOUT_MS,
    Math.max(MIN_WATCH_TARGET_TIMEOUT_MS, Math.floor(parsed)),
  )
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

function normalizeExtractionResponse(payload: unknown): WatchTargetCandidateExtractionResult {
  const directParsed = watchTargetCandidateResponseSchema.safeParse(payload)
  if (directParsed.success) {
    return "result" in directParsed.data ? directParsed.data.result : directParsed.data
  }

  const responseText = getOpenAIResponseText(payload)
  if (!responseText) {
    throw new Error("watch_target_candidate_invalid_response")
  }

  const parsedJson = JSON.parse(responseText)
  return watchTargetCandidateSchema.parse(parsedJson)
}

function getLiveExtractorConfig(): LiveWatchTargetCandidateExtractorConfig {
  const llmRuntime = getLlmProfileRuntimeConfig(watchTargetLlmProfile)
  return {
    provider: llmRuntime.provider,
    url: llmRuntime.baseUrl,
    token: llmRuntime.apiKey,
    model: llmRuntime.model,
    missingConfig: llmRuntime.missingConfig,
  }
}

function createLlmExtractor(config: LiveWatchTargetCandidateExtractorConfig): WatchTargetCandidateExtractor | undefined {
  if (config.missingConfig.length || !config.provider || !config.model) return undefined

  const client = getStructuredOutputClient(watchTargetLlmProfile)
  if (!client) return undefined

  return {
    async extract(input: WatchTargetCandidateInput) {
      const response = await client.generateStructuredOutput({
        instructions: WATCH_TARGET_CANDIDATE_SYSTEM_PROMPT,
        input: buildWatchTargetCandidateInput(input),
        schemaName: WATCH_TARGET_CANDIDATE_SCHEMA_NAME,
        schema: WATCH_TARGET_CANDIDATE_RESPONSE_JSON_SCHEMA,
      })

      return normalizeExtractionResponse(response)
    },
  }
}

export function getLiveWatchTargetCandidateExtractor() {
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

export function getLiveWatchTargetCandidateExtractorStatus(): LiveWatchTargetCandidateExtractorStatus {
  const config = getLiveExtractorConfig()
  return {
    enabled: Boolean(getLiveWatchTargetCandidateExtractor()),
    provider: config.provider,
    model: config.model,
    promptId: config.provider ? WATCH_TARGET_CANDIDATE_PROMPT_ID : null,
    promptVersion: config.provider ? WATCH_TARGET_CANDIDATE_PROMPT_VERSION : null,
    missingConfig: config.missingConfig,
  }
}

export function getLiveWatchTargetCandidateExtractorTimeoutMs() {
  return clampTimeoutMs(process.env.EVENT_ENGINE_WATCH_TARGET_TIMEOUT_MS)
}
