import process from "node:process"
import { ofetch } from "ofetch"

export type LlmProviderId = "openai" | "minimax"
type ProviderScopedValue<T> = T | Partial<Record<LlmProviderId, T>>

interface LlmProfileEnvAliases {
  enabled?: string[]
  provider?: string[]
  baseUrl?: string[]
  apiKey?: string[]
  model?: string[]
}

export interface LlmProfileDefinition {
  id: string
  envPrefix: string
  defaultModel: ProviderScopedValue<string>
  legacyAliases?: LlmProfileEnvAliases
}

export interface LlmProfileStatus {
  enabled: boolean
  provider: LlmProviderId | null
  model: string | null
  missingConfig: string[]
}

export interface StructuredOutputRequest {
  instructions: string
  input: string
  schemaName: string
  schema: Record<string, unknown>
  model?: string | null
}

export interface StructuredOutputClient {
  provider: LlmProviderId
  model: string
  generateStructuredOutput<T = unknown>(request: StructuredOutputRequest): Promise<T>
}

interface EnvRead<T> {
  key: string
  value: T
}

export interface LlmProfileRuntimeConfig {
  enabled: boolean
  provider: LlmProviderId | null
  baseUrl: string | null
  apiKey: string | null
  model: string | null
  missingConfig: string[]
}

const clientCache = new Map<string, StructuredOutputClient | undefined>()

const providerDefaults: Record<LlmProviderId, {
  defaultBaseUrl: string
  apiKeyEnvKeys: string[]
  baseUrlEnvKeys: string[]
  modelEnvKeys: string[]
}> = {
  openai: {
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyEnvKeys: ["OPENAI_API_KEY"],
    baseUrlEnvKeys: ["OPENAI_BASE_URL"],
    modelEnvKeys: ["OPENAI_MODEL"],
  },
  minimax: {
    defaultBaseUrl: "https://api.minimax.io/v1",
    apiKeyEnvKeys: ["MINIMAX_API_KEY"],
    baseUrlEnvKeys: ["MINIMAX_BASE_URL"],
    modelEnvKeys: ["MINIMAX_MODEL"],
  },
}

export function defineLlmProfile(input: LlmProfileDefinition) {
  return input
}

function isProviderScopedRecord<T>(value: ProviderScopedValue<T>): value is Partial<Record<LlmProviderId, T>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function resolveProviderScopedValue<T>(value: ProviderScopedValue<T>, provider: LlmProviderId | null) {
  if (!isProviderScopedRecord(value)) {
    return value
  }

  if (provider && value[provider] !== undefined) {
    return value[provider]
  }

  return value.openai ?? value.minimax ?? null
}

function trimToNull(value?: string | null) {
  const normalized = value?.trim()
  return normalized?.length ? normalized : null
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)))
}

function readFirstEnvEntry(keys: string[]): EnvRead<string> | null {
  for (const key of keys) {
    const value = trimToNull(process.env[key])
    if (value) {
      return {
        key,
        value,
      }
    }
  }

  return null
}

function readFirstEnv(keys: string[]) {
  return readFirstEnvEntry(keys)?.value ?? null
}

function readBooleanEnv(keys: string[]) {
  const entry = readFirstEnvEntry(keys)
  if (!entry) return null

  const normalized = entry.value.toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return {
      key: entry.key,
      value: true,
    }
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return {
      key: entry.key,
      value: false,
    }
  }

  return null
}

function normalizeProvider(value?: string | null): LlmProviderId | null {
  const normalized = value?.trim().toLowerCase()
  if (normalized === "openai") return "openai"
  if (normalized === "minimax") return "minimax"
  return null
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "")
}

const scopedEnvSuffixMap = {
  enabled: "LLM_ENABLED",
  provider: "LLM_PROVIDER",
  baseUrl: "LLM_BASE_URL",
  apiKey: "LLM_API_KEY",
  model: "LLM_MODEL",
} as const

function getScopedEnvKey(profile: LlmProfileDefinition, suffix: keyof typeof scopedEnvSuffixMap) {
  return `${profile.envPrefix}_${scopedEnvSuffixMap[suffix]}`
}

function getScopedEnvKeys(profile: LlmProfileDefinition, suffix: keyof typeof scopedEnvSuffixMap) {
  const legacy = profile.legacyAliases?.[suffix as keyof LlmProfileEnvAliases] ?? []
  return [getScopedEnvKey(profile, suffix), ...legacy]
}

function getMissingApiKeyHintsForProvider(profile: LlmProfileDefinition, provider: LlmProviderId) {
  return unique([
    getScopedEnvKey(profile, "apiKey"),
    "LLM_API_KEY",
    ...providerDefaults[provider].apiKeyEnvKeys,
    ...(profile.legacyAliases?.apiKey ?? []),
  ])
}

function detectImplicitProvider() {
  for (const provider of Object.keys(providerDefaults) as LlmProviderId[]) {
    const providerApiKey = readFirstEnv(providerDefaults[provider].apiKeyEnvKeys)
    if (providerApiKey) {
      return provider
    }
  }

  return null
}

export function getLlmProfileRuntimeConfig(profile: LlmProfileDefinition): LlmProfileRuntimeConfig {
  const explicitEnabled = readBooleanEnv([
    ...getScopedEnvKeys(profile, "enabled"),
    "LLM_ENABLED",
  ])
  const providerEntry = readFirstEnvEntry([
    ...getScopedEnvKeys(profile, "provider"),
    "LLM_PROVIDER",
  ])
  const genericApiKey = readFirstEnv([
    ...getScopedEnvKeys(profile, "apiKey"),
    "LLM_API_KEY",
  ])
  const provider = normalizeProvider(providerEntry?.value)
    ?? detectImplicitProvider()
    ?? (genericApiKey ? "openai" : null)

  const providerConfig = provider ? providerDefaults[provider] : null
  const apiKey = providerConfig
    ? readFirstEnv([
      ...getScopedEnvKeys(profile, "apiKey"),
      "LLM_API_KEY",
      ...providerConfig.apiKeyEnvKeys,
    ])
    : genericApiKey

  const model = provider
    ? (readFirstEnv([
      ...getScopedEnvKeys(profile, "model"),
      "LLM_MODEL",
      ...providerConfig!.modelEnvKeys,
    ]) ?? resolveProviderScopedValue(profile.defaultModel, provider))
    : null

  const baseUrl = provider
    ? stripTrailingSlash(readFirstEnv([
      ...getScopedEnvKeys(profile, "baseUrl"),
      "LLM_BASE_URL",
      ...providerConfig!.baseUrlEnvKeys,
    ]) ?? providerConfig!.defaultBaseUrl)
    : null

  if (explicitEnabled?.value === false) {
    return {
      enabled: false,
      provider,
      baseUrl,
      apiKey,
      model,
      missingConfig: [],
    }
  }

  const missingConfig: string[] = []
  if ((provider || explicitEnabled?.value === true) && !apiKey) {
    missingConfig.push(...getMissingApiKeyHintsForProvider(profile, provider ?? "openai"))
  }

  return {
    enabled: Boolean(provider && !missingConfig.length),
    provider,
    baseUrl,
    apiKey,
    model,
    missingConfig,
  }
}

function extractOpenAIOutputText(payload: any) {
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

function extractChatCompletionText(payload: any) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : []
  const content = choices[0]?.message?.content
  if (typeof content === "string" && content.trim()) {
    return content
  }

  if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item?.text === "string" && item.text.trim()) {
        return item.text
      }
      if (typeof item?.content === "string" && item.content.trim()) {
        return item.content
      }
    }
  }

  return null
}

function stripReasoningTags(value: string) {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
}

function extractJsonPayloadText(value: string) {
  const normalized = stripReasoningTags(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  if (!normalized) return normalized
  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    return normalized
  }

  const firstBrace = normalized.indexOf("{")
  const lastBrace = normalized.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return normalized.slice(firstBrace, lastBrace + 1)
  }

  const firstBracket = normalized.indexOf("[")
  const lastBracket = normalized.lastIndexOf("]")
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return normalized.slice(firstBracket, lastBracket + 1)
  }

  return normalized
}

function createOpenAIClient(config: LlmProfileRuntimeConfig): StructuredOutputClient | undefined {
  if (!config.enabled || config.provider !== "openai" || !config.apiKey || !config.baseUrl || !config.model) {
    return undefined
  }

  return {
    provider: "openai",
    model: config.model,
    async generateStructuredOutput<T = unknown>(request: StructuredOutputRequest) {
      const response = await ofetch(`${config.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: {
          model: request.model ?? config.model,
          temperature: 0,
          store: false,
          instructions: request.instructions,
          input: request.input,
          text: {
            format: {
              type: "json_schema",
              name: request.schemaName,
              strict: true,
              schema: request.schema,
            },
          },
        },
      })

      const responseText = extractOpenAIOutputText(response)
      if (!responseText) {
        throw new Error("llm_structured_output_invalid_response")
      }

      return JSON.parse(extractJsonPayloadText(responseText)) as T
    },
  }
}

function createMiniMaxClient(config: LlmProfileRuntimeConfig): StructuredOutputClient | undefined {
  if (!config.enabled || config.provider !== "minimax" || !config.apiKey || !config.baseUrl || !config.model) {
    return undefined
  }

  return {
    provider: "minimax",
    model: config.model,
    async generateStructuredOutput<T = unknown>(request: StructuredOutputRequest) {
      const response = await ofetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: {
          model: request.model ?? config.model,
          temperature: 0,
          reasoning_split: true,
          messages: [
            {
              role: "system",
              content: [
                request.instructions.trim(),
                "",
                "Output requirements:",
                `- Return valid JSON only for schema: ${request.schemaName}`,
                "- Do not wrap the JSON in markdown fences.",
                `- Follow this JSON Schema exactly: ${JSON.stringify(request.schema)}`,
              ].join("\n"),
            },
            {
              role: "user",
              content: request.input,
            },
          ],
        },
      })

      const responseText = extractChatCompletionText(response)
      if (!responseText) {
        throw new Error("llm_structured_output_invalid_response")
      }

      return JSON.parse(extractJsonPayloadText(responseText)) as T
    },
  }
}

export function getStructuredOutputClient(profile: LlmProfileDefinition) {
  const config = getLlmProfileRuntimeConfig(profile)
  const cacheKey = [
    profile.id,
    config.enabled ? "enabled" : "disabled",
    config.provider ?? "",
    config.baseUrl ?? "",
    config.apiKey ?? "",
    config.model ?? "",
    config.missingConfig.join(","),
  ].join("|")

  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)
  }

  const client = config.provider === "minimax"
    ? createMiniMaxClient(config)
    : createOpenAIClient(config)
  clientCache.set(cacheKey, client)
  return client
}

export function getLlmProfileStatus(profile: LlmProfileDefinition): LlmProfileStatus {
  const config = getLlmProfileRuntimeConfig(profile)
  return {
    enabled: config.enabled,
    provider: config.provider,
    model: config.provider ? config.model : null,
    missingConfig: config.missingConfig,
  }
}
