import type { AffectedMarket, EventSourceKind } from "@shared/event-profile"
import { industries, resolveIndustryTagsFromKeywordQuery } from "@shared/industry"
import type { EventEntityType, EventSubType, EventType, NewsItem } from "@shared/types"
import type { EntityLinkRow } from "#/types"
import { getEntityAliasKey, normalizeSecurityIdentifier } from "#/services/event-engine/entity-registry"
import { resolveSecurityByCode, resolveSecurityByName } from "#/services/tdx-api"
import {
  STOCK_CODE_RE,
  extractCompanyHints,
  extractExplicitSecurityMentions,
  getPrimaryEntityName,
  isBroadMarketDescriptor,
  normalizePrimaryEntityCandidate,
  normalizeTitle,
} from "#/services/event-engine/text"

interface SecurityResolveResult {
  code: string
  fullCode: string
  name: string
  exchange: string
  assetType: string
}

export interface SubjectRoleSlots {
  eventPhrases: string[]
  explicitCompanies: string[]
  explicitTickers: ReturnType<typeof extractExplicitSecurityMentions>
  institutions: string[]
  industries: string[]
  markets: string[]
  nonEntityPhrases: string[]
  causalDrivers: string[]
}

export interface SubjectRoleExtractionResult {
  provider: "llm" | "deterministic"
  confidence: number
  slots: SubjectRoleSlots
}

export interface SubjectRoleExtractor {
  extract(input: SubjectResolutionInput): Promise<SubjectRoleExtractionResult>
}

export interface SubjectRegistryResolver {
  resolveByName(value: string): Promise<SecurityResolveResult | null>
  resolveByCode(value: string): Promise<SecurityResolveResult | null>
}

export interface SubjectResolutionInput {
  eventId: string
  title: string
  summary?: string | null
  eventType: EventType
  eventSubType: EventSubType
  sourceKind?: EventSourceKind
  topicTags: string[]
  affectedMarkets: AffectedMarket[]
  payload?: NewsItem
  primaryEntityNameHint?: string | null
}

export interface SubjectResolutionResult {
  primaryEntityName?: string
  entityLinks: EntityLinkRow[]
  audit: {
    provider: "llm" | "deterministic"
    confidence: number
    timedOut: boolean
    usedFallback: boolean
  }
}

const INSTITUTION_RE = /(?:部|委|局|署|会|院|厅|办|法院|检察院|税务总局|人民银行|银行|外汇管理局|海关总署|协会|信通院|中汽协|药审中心|国家医保局|国务院|央行|中行|工行|农行|建行|交行|招行)$/
const INSTITUTION_PREFIX_RE = /^([\u4e00-\u9fa5A-Za-z*“”"《》（）()\s]{2,64}?)(?:发布|印发|关于|答记者问|就|开展|推出|宣布|官宣)/
const NON_ENTITY_CANDIDATE_RE = /(推出|发布|發布|举行|召开|回购|公告|方案|意见|通知|平台|系统|电话会|法说会|業績|说明会|發布會|需求|强劲|持續|持续|定调|实录|增长|下滑|改善|(?:称|表示)$)/
const INDUSTRY_SUFFIX_RE = /(行业|產業鏈|产业链|产业|板块|賽道|赛道|概念|主线|主題|主题)$/u

function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

function buildContextTexts(input: SubjectResolutionInput) {
  const raw = (input.payload?.extra?.raw ?? {}) as Record<string, unknown>
  return [
    input.title,
    input.summary ?? null,
    input.payload?.extra?.info ?? null,
    input.payload?.extra?.hover ?? null,
    typeof raw.brief === "string" ? raw.brief : null,
    typeof raw.description === "string" ? raw.description : null,
    typeof raw.abstract === "string" ? raw.abstract : null,
    typeof raw.previewText === "string" ? raw.previewText : null,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
}

function isInstitutionLike(value?: string | null) {
  return value ? INSTITUTION_RE.test(value.trim()) : false
}

function extractInstitutionCandidates(input: SubjectResolutionInput, contextTexts: string[]) {
  const candidates = new Set<string>()
  const primaryHint = normalizePrimaryEntityCandidate(input.primaryEntityNameHint)
  if (isInstitutionLike(primaryHint)) candidates.add(primaryHint!)

  const titlePrimary = getPrimaryEntityName(input.title)
  if (isInstitutionLike(titlePrimary)) candidates.add(titlePrimary!)

  const normalizedTitle = normalizeTitle(input.title)
  const prefixMatch = normalizedTitle.match(INSTITUTION_PREFIX_RE)
  const prefix = prefixMatch?.[1]?.replace(/\s+/g, " ").trim()
  if (prefix) {
    for (const part of prefix.split(/\s+/).filter(Boolean)) {
      if (isInstitutionLike(part)) candidates.add(part)
    }
  }

  for (const text of contextTexts) {
    const match = normalizeTitle(text).match(/([\u4e00-\u9fa5A-Za-z]{2,32}(?:部|委|局|署|会|院|厅|总局|管理局|协会|人民银行|银行|央行|中行|工行|农行|建行|交行|招行))/g)
    for (const candidate of match ?? []) {
      const normalized = normalizePrimaryEntityCandidate(candidate)
      if (isInstitutionLike(normalized)) candidates.add(normalized!)
    }
  }

  return Array.from(candidates)
}

function isNonEntityCandidate(value?: string | null) {
  const normalized = normalizeTitle(value ?? "")
  if (!normalized) return true
  if (isBroadMarketDescriptor(normalized)) return true
  return NON_ENTITY_CANDIDATE_RE.test(normalized)
}

function isSanitizedPrimaryEntityHint(input: SubjectResolutionInput, value: string) {
  const rawCandidates = unique([
    input.primaryEntityNameHint ?? undefined,
    input.title,
    typeof input.payload?.title === "string" ? input.payload.title : undefined,
  ])

  return rawCandidates.some((candidate) => {
    const rawHint = normalizeTitle(candidate ?? "")
    const normalizedHint = normalizePrimaryEntityCandidate(candidate)
    return Boolean(rawHint && normalizedHint && normalizedHint === value && normalizedHint !== rawHint)
  })
}

function normalizeIndustrySlotValue(value?: string | null) {
  const normalized = normalizeTitle(value ?? "")
    .replace(INDUSTRY_SUFFIX_RE, "")
    .trim()
  if (!normalized || isBroadMarketDescriptor(normalized)) return undefined

  const matchedTags = resolveIndustryTagsFromKeywordQuery(normalized)
  if (matchedTags.length === 1) return matchedTags[0]
  return normalized
}

function inferMarkets(input: SubjectResolutionInput) {
  const labels = input.affectedMarkets.map((market) => {
    switch (market) {
      case "A":
        return "A股"
      case "HK":
        return "港股"
      case "CN_rates":
        return "中国资金面"
      case "CN_macro":
        return "中国宏观"
      default:
        return market
    }
  })
  return unique(labels)
}

function buildDeterministicSlots(input: SubjectResolutionInput): SubjectRoleExtractionResult {
  const contextTexts = buildContextTexts(input)
  const contextText = contextTexts.join(" ")
  const primaryHint = normalizePrimaryEntityCandidate(input.primaryEntityNameHint)
  const companyHints = unique([
    ...(primaryHint ? [primaryHint] : []),
    ...extractCompanyHints(contextText),
  ])
  const nonEntityPhrases = unique(companyHints.filter(candidate => isBroadMarketDescriptor(candidate)))
  const explicitCompanies = companyHints.filter(candidate => !nonEntityPhrases.includes(candidate) && !isNonEntityCandidate(candidate))
  const explicitTickers = Array.from(new Map(
    contextTexts
      .flatMap(text => extractExplicitSecurityMentions(text))
      .map(mention => [mention.fullCode, mention]),
  ).values())

  return {
    provider: "deterministic",
    confidence: 0.72,
    slots: {
      eventPhrases: [normalizeTitle(input.title)],
      explicitCompanies,
      explicitTickers,
      institutions: extractInstitutionCandidates(input, contextTexts),
      industries: input.topicTags.map(tag => industries[tag as keyof typeof industries] ?? tag),
      markets: inferMarkets(input),
      nonEntityPhrases,
      causalDrivers: [],
    },
  }
}

function getExtractionConfidence(extraction: SubjectRoleExtractionResult, fallback: number) {
  const normalized = Number(extraction.confidence)
  if (!Number.isFinite(normalized)) return fallback
  return Math.max(0, Math.min(1, normalized))
}

function mergeRoleSlots(primary: SubjectRoleExtractionResult, fallback: SubjectRoleExtractionResult): SubjectRoleExtractionResult {
  return {
    provider: primary.provider,
    confidence: primary.confidence,
    slots: {
      eventPhrases: unique([...primary.slots.eventPhrases, ...fallback.slots.eventPhrases]),
      explicitCompanies: unique([...primary.slots.explicitCompanies, ...fallback.slots.explicitCompanies]),
      explicitTickers: unique([...primary.slots.explicitTickers, ...fallback.slots.explicitTickers]),
      institutions: unique([...primary.slots.institutions, ...fallback.slots.institutions]),
      industries: unique([...primary.slots.industries, ...fallback.slots.industries]),
      markets: unique([...primary.slots.markets, ...fallback.slots.markets]),
      nonEntityPhrases: unique([...primary.slots.nonEntityPhrases, ...fallback.slots.nonEntityPhrases]),
      causalDrivers: unique([...primary.slots.causalDrivers, ...fallback.slots.causalDrivers]),
    },
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("subject_role_extraction_timeout"))
    }, timeoutMs)
    promise.then((value) => {
      clearTimeout(timer)
      resolve(value)
    }, (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function getSubjectPolicy(input: SubjectResolutionInput) {
  if (input.eventType === "market_move") {
    return {
      prefer: ["stock", "industry", "institution", "company"] as const,
      allowUnmappedInstitution: false,
    }
  }
  if (input.eventType === "policy") {
    return {
      prefer: ["institution", "stock", "company", "industry"] as const,
      allowUnmappedInstitution: true,
    }
  }
  if (input.eventType === "announcement") {
    return {
      prefer: ["stock", "company", "institution", "industry"] as const,
      allowUnmappedInstitution: true,
    }
  }
  if (input.eventSubType === "industry_data") {
    return {
      prefer: ["industry", "institution", "stock", "company"] as const,
      allowUnmappedInstitution: true,
    }
  }
  return {
    prefer: ["stock", "company", "institution", "industry"] as const,
    allowUnmappedInstitution: true,
  }
}

function pickPrimaryEntityName(input: SubjectResolutionInput, entities: EntityLinkRow[], slots: SubjectRoleSlots) {
  const policy = getSubjectPolicy(input)
  const hint = normalizePrimaryEntityCandidate(input.primaryEntityNameHint)
  if (hint && !slots.nonEntityPhrases.includes(hint) && !isBroadMarketDescriptor(hint) && entities.some(entity => entity.entity_name === hint)) {
    return hint
  }
  for (const entityType of policy.prefer) {
    const entity = entities
      .filter(item => item.entity_type === entityType)
      .sort((left, right) => right.confidence - left.confidence || right.entity_name.length - left.entity_name.length)[0]
    if (entity?.entity_name) return entity.entity_name
  }

  return undefined
}

function createDefaultRegistryResolver(): SubjectRegistryResolver {
  return {
    resolveByName: resolveSecurityByName,
    resolveByCode: resolveSecurityByCode,
  }
}

export async function resolveEventSubjects(
  input: SubjectResolutionInput,
  options?: {
    roleExtractor?: SubjectRoleExtractor
    registryResolver?: SubjectRegistryResolver
    extractionTimeoutMs?: number
  },
): Promise<SubjectResolutionResult> {
  const fallbackExtraction = buildDeterministicSlots(input)
  let extraction = fallbackExtraction
  let timedOut = false
  let usedFallback = false

  if (options?.roleExtractor) {
    try {
      const extracted = await withTimeout(
        options.roleExtractor.extract(input),
        options.extractionTimeoutMs ?? 1200,
      )
      extraction = mergeRoleSlots(extracted, fallbackExtraction)
    } catch {
      extraction = fallbackExtraction
      timedOut = true
      usedFallback = true
    }
  }

  const registryResolver = options?.registryResolver ?? createDefaultRegistryResolver()
  const entityLinks: EntityLinkRow[] = []
  const seen = new Set<string>()
  const groundedSecurityIdentifiers = new Set<string>()
  const pushEntity = (entityType: EventEntityType, entityName: string, metadata?: {
    code?: string
    fullCode?: string
    confidence?: number
    resolver?: string
  }) => {
    const row: EntityLinkRow = {
      event_id: input.eventId,
      entity_type: entityType,
      entity_name: entityName,
      code: metadata?.code ?? "",
      full_code: metadata?.fullCode ?? "",
      confidence: metadata?.confidence ?? 0.7,
      resolver: metadata?.resolver ?? "subject-arbiter",
    }
    const key = getEntityAliasKey(row)
    if (seen.has(key)) return
    seen.add(key)
    entityLinks.push(row)
  }
  const addGroundedSecurityIdentifier = (value?: string | null) => {
    const identifier = normalizeSecurityIdentifier(value)
    if (identifier) groundedSecurityIdentifiers.add(identifier)
  }
  const matchesGroundedSecurity = (inputValue?: { code?: string | null, fullCode?: string | null }) => {
    if (!groundedSecurityIdentifiers.size) return true
    const fullCodeMatch = normalizeSecurityIdentifier(inputValue?.fullCode)
    if (fullCodeMatch && groundedSecurityIdentifiers.has(fullCodeMatch)) return true
    const codeMatch = normalizeSecurityIdentifier(inputValue?.code)
    if (codeMatch && groundedSecurityIdentifiers.has(codeMatch)) return true
    return false
  }

  for (const tag of input.topicTags) {
    pushEntity("topic", tag, { confidence: 0.95, resolver: "source-tags" })
    pushEntity("industry", tag, { confidence: 0.78, resolver: "source-tags" })
  }

  for (const industry of extraction.slots.industries) {
    const normalizedIndustry = normalizeIndustrySlotValue(industry)
    if (!normalizedIndustry) continue
    pushEntity("industry", normalizedIndustry, {
      confidence: extraction.provider === "llm" ? getExtractionConfidence(extraction, 0.8) : 0.74,
      resolver: extraction.provider === "llm" ? "llm-industry" : "deterministic-industry",
    })
  }

  for (const institution of extraction.slots.institutions) {
    pushEntity("institution", institution, {
      confidence: extraction.provider === "llm" ? getExtractionConfidence(extraction, 0.84) : 0.74,
      resolver: extraction.provider === "llm" ? "llm-provisional-institution" : "deterministic-provisional-institution",
    })
  }

  for (const ticker of extraction.slots.explicitTickers) {
    addGroundedSecurityIdentifier(ticker.fullCode)
    pushEntity("stock", ticker.label, {
      code: ticker.code,
      fullCode: ticker.fullCode,
      confidence: 0.93,
      resolver: "explicit-ticker-mention",
    })
    pushEntity("company", ticker.label, {
      code: ticker.code,
      fullCode: ticker.fullCode,
      confidence: 0.88,
      resolver: "explicit-ticker-mention",
    })
  }

  const contextText = buildContextTexts(input).join(" ")
  for (const rawCode of contextText.match(STOCK_CODE_RE) ?? []) {
    const lowered = rawCode.toLowerCase()
    const fullCode = /^(?:sh|sz|bj)\d{6}$/.test(lowered) ? lowered : undefined
    const code = lowered.slice(-6)
    const resolved = await registryResolver.resolveByCode(fullCode ?? code)
    if (!resolved) continue
    addGroundedSecurityIdentifier(resolved.fullCode)
    pushEntity("stock", resolved.name, {
      code: resolved.code,
      fullCode: resolved.fullCode,
      confidence: 0.96,
      resolver: "registry-code",
    })
    pushEntity("company", resolved.name, {
      code: resolved.code,
      fullCode: resolved.fullCode,
      confidence: 0.96,
      resolver: "registry-code",
    })
  }

  for (const company of extraction.slots.explicitCompanies) {
    if (extraction.slots.nonEntityPhrases.includes(company) || isBroadMarketDescriptor(company)) continue
    const resolved = await registryResolver.resolveByName(company)
    if (resolved && matchesGroundedSecurity(resolved)) {
      addGroundedSecurityIdentifier(resolved.fullCode)
      pushEntity("stock", resolved.name, {
        code: resolved.code,
        fullCode: resolved.fullCode,
        confidence: extraction.provider === "llm" ? getExtractionConfidence(extraction, 0.94) : 0.9,
        resolver: "registry-company",
      })
      pushEntity("company", resolved.name, {
        code: resolved.code,
        fullCode: resolved.fullCode,
        confidence: extraction.provider === "llm" ? getExtractionConfidence(extraction, 0.94) : 0.9,
        resolver: "registry-company",
      })
      continue
    }

    if (
      getSubjectPolicy(input).allowUnmappedInstitution
      && (
        extraction.provider === "llm"
          ? (isInstitutionLike(company) || extraction.slots.institutions.includes(company))
          : isSanitizedPrimaryEntityHint(input, company)
      )
    ) {
      pushEntity("institution", company, {
        confidence: extraction.provider === "llm" ? getExtractionConfidence(extraction, 0.82) : 0.72,
        resolver: extraction.provider === "llm" ? "llm-provisional-institution" : "deterministic-provisional-institution",
      })
    }
  }

  const primaryEntityName = pickPrimaryEntityName(input, entityLinks, extraction.slots)

  return {
    primaryEntityName,
    entityLinks,
    audit: {
      provider: extraction.provider,
      confidence: extraction.confidence,
      timedOut,
      usedFallback,
    },
  }
}
