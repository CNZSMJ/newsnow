import process from "node:process"
import type { EventDetail } from "@shared/types"
import {
  CAUSAL_HYPOTHESIS_PROMPT_ID,
  CAUSAL_HYPOTHESIS_PROMPT_VERSION,
  CAUSAL_HYPOTHESIS_RESPONSE_JSON_SCHEMA,
  CAUSAL_HYPOTHESIS_SCHEMA_NAME,
  CAUSAL_HYPOTHESIS_SYSTEM_PROMPT,
} from "#/services/event-engine/causal-hypothesis/prompt"
import { buildCausalHypothesisGenerationInput } from "#/services/event-engine/causal-hypothesis/input"
import { validateCausalHypothesisModelOutput } from "#/services/event-engine/causal-hypothesis/quality"
import type {
  CausalHypothesisGenerationInput,
  CausalHypothesisModelOutput,
  CausalHypothesisValidationResult,
} from "#/services/event-engine/causal-hypothesis/types"
import {
  defineLlmProfile,
  getLlmProfileRuntimeConfig,
  getStructuredOutputClient,
  type LlmProviderId,
} from "#/services/llm/runtime"

interface LiveCausalHypothesisGeneratorConfig {
  provider: LlmProviderId | null
  url: string | null
  token: string | null
  model: string | null
  missingConfig: string[]
}

export interface LiveCausalHypothesisGeneratorStatus {
  enabled: boolean
  provider: LlmProviderId | null
  model: string | null
  promptId: string | null
  promptVersion: string | null
  missingConfig: string[]
}

export interface CausalHypothesisGeneratorResult {
  generationInput: CausalHypothesisGenerationInput
  validation: CausalHypothesisValidationResult
}

export interface CausalHypothesisGenerator {
  provider: LlmProviderId
  modelName: string
  generate(detail: EventDetail): Promise<CausalHypothesisGeneratorResult>
  generateFromInput(generationInput: CausalHypothesisGenerationInput): Promise<CausalHypothesisGeneratorResult>
}

const DEFAULT_CAUSAL_HYPOTHESIS_TIMEOUT_MS = 45000
const MIN_CAUSAL_HYPOTHESIS_TIMEOUT_MS = 500
const MAX_CAUSAL_HYPOTHESIS_TIMEOUT_MS = 45000

const causalHypothesisLlmProfile = defineLlmProfile({
  id: "event-engine-causal-hypothesis",
  envPrefix: "EVENT_ENGINE_CAUSAL_HYPOTHESIS",
  defaultModel: {
    openai: "gpt-5.4-mini",
    minimax: "MiniMax-M2.7",
  },
})

let cachedKey: string | null = null
let cachedGenerator: CausalHypothesisGenerator | undefined

function clampTimeoutMs(value?: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CAUSAL_HYPOTHESIS_TIMEOUT_MS
  }

  return Math.min(
    MAX_CAUSAL_HYPOTHESIS_TIMEOUT_MS,
    Math.max(MIN_CAUSAL_HYPOTHESIS_TIMEOUT_MS, Math.floor(parsed)),
  )
}

function getLiveGeneratorConfig(): LiveCausalHypothesisGeneratorConfig {
  const llmRuntime = getLlmProfileRuntimeConfig(causalHypothesisLlmProfile)
  return {
    provider: llmRuntime.provider,
    url: llmRuntime.baseUrl,
    token: llmRuntime.apiKey,
    model: llmRuntime.model,
    missingConfig: llmRuntime.missingConfig,
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("causal_hypothesis_model_timeout"))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function createLlmGenerator(config: LiveCausalHypothesisGeneratorConfig): CausalHypothesisGenerator | undefined {
  if (config.missingConfig.length || !config.provider || !config.model) return undefined

  const client = getStructuredOutputClient(causalHypothesisLlmProfile)
  if (!client) return undefined
  const structuredClient = client

  async function generateFromInput(generationInput: CausalHypothesisGenerationInput) {
    const response = await withTimeout(
      structuredClient.generateStructuredOutput<CausalHypothesisModelOutput>({
        instructions: CAUSAL_HYPOTHESIS_SYSTEM_PROMPT,
        input: generationInput.promptInput,
        schemaName: CAUSAL_HYPOTHESIS_SCHEMA_NAME,
        schema: CAUSAL_HYPOTHESIS_RESPONSE_JSON_SCHEMA,
      }),
      getLiveCausalHypothesisGeneratorTimeoutMs(),
    )
    const validation = validateCausalHypothesisModelOutput(response, {
      selectedEvidenceIds: generationInput.inputSnapshot.evidence.map(evidence => evidence.evidenceId),
      selectedFactIds: generationInput.inputSnapshot.facts.map(fact => fact.factId),
    })

    return {
      generationInput,
      validation,
    }
  }

  return {
    provider: structuredClient.provider,
    modelName: structuredClient.model,
    async generate(detail: EventDetail) {
      const generationInput = buildCausalHypothesisGenerationInput(detail, {
        modelProvider: structuredClient.provider,
        modelName: structuredClient.model,
      })
      return generateFromInput(generationInput)
    },
    generateFromInput,
  }
}

export function getLiveCausalHypothesisGenerator() {
  const config = getLiveGeneratorConfig()
  const cacheKey = [
    config.provider ?? "",
    config.url ?? "",
    config.token ?? "",
    config.model ?? "",
    config.missingConfig.join(","),
  ].join("|")

  if (cachedKey === cacheKey) return cachedGenerator

  cachedKey = cacheKey
  cachedGenerator = createLlmGenerator(config)
  return cachedGenerator
}

export function getLiveCausalHypothesisGeneratorStatus(): LiveCausalHypothesisGeneratorStatus {
  const config = getLiveGeneratorConfig()
  return {
    enabled: Boolean(getLiveCausalHypothesisGenerator()),
    provider: config.provider,
    model: config.model,
    promptId: config.provider ? CAUSAL_HYPOTHESIS_PROMPT_ID : null,
    promptVersion: config.provider ? CAUSAL_HYPOTHESIS_PROMPT_VERSION : null,
    missingConfig: config.missingConfig,
  }
}

export function getLiveCausalHypothesisGeneratorTimeoutMs() {
  return clampTimeoutMs(process.env.EVENT_ENGINE_CAUSAL_HYPOTHESIS_TIMEOUT_MS)
}
