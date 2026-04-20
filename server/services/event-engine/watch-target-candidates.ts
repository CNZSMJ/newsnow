import type { IndustryTag } from "@shared/industry"
import type { AffectedMarket, EventSourceKind } from "@shared/event-profile"
import type { EventSubType, EventType, InvestmentEntityRef, InvestmentWatchTargetCandidate, SourceID } from "@shared/types"
import { normalizeTitle } from "#/services/event-engine/text"
import type {
  WatchTargetCandidateExtractionResult,
  WatchTargetCandidateExtractor,
} from "#/services/event-engine/watch-target-live-extractor"

interface CuratedWatchTargetRule {
  id: string
  industryLabels?: string[]
  topicTags?: IndustryTag[]
  keywords?: string[]
  candidates: Array<{
    label: string
    code: string
    fullCode: string
    market: "A" | "HK" | "US"
    confidence: number
    reason: string
  }>
}

interface WatchTargetRegistryResolveResult {
  code: string
  fullCode: string
  name: string
  exchange: string
  assetType: string
}

export interface WatchTargetRegistryResolver {
  resolveByName(value: string): Promise<WatchTargetRegistryResolveResult | null>
}

export interface ResolveWatchTargetCandidatesInput {
  eventId: string
  sourceId?: SourceID
  title: string
  summary?: string | null
  eventType: EventType
  eventSubType: EventSubType
  sourceKind?: EventSourceKind
  topicTags: IndustryTag[]
  affectedMarkets: AffectedMarket[]
  affectedEntities: InvestmentEntityRef[]
  impactSummary?: string[]
}

const HIGH_THROUGHPUT_LIVE_WATCH_TARGET_SOURCE_IDS = new Set<SourceID>([
  "mktnews-flash",
  "wallstreetcn-quick",
  "wallstreetcn-news",
  "wallstreetcn-hot",
  "cls-telegraph",
  "cls-depth",
  "cls-hot",
  "xueqiu-hotstock",
  "gelonghui",
  "fastbull-express",
  "fastbull-news",
  "eastmoney-7x24",
  "sina-7x24",
  "jin10",
])

const CURATED_WATCH_TARGET_RULES: CuratedWatchTargetRule[] = [
  {
    id: "fiber-optic-chain",
    industryLabels: ["光纤", "光纤光缆", "光通信"],
    keywords: ["光纤", "光缆", "光通信"],
    candidates: [
      {
        label: "长飞光纤",
        code: "601869",
        fullCode: "sh601869",
        market: "A",
        confidence: 0.95,
        reason: "光纤光缆龙头，事件直接指向光纤量价齐升时通常最值得优先跟踪。",
      },
      {
        label: "亨通光电",
        code: "600487",
        fullCode: "sh600487",
        market: "A",
        confidence: 0.92,
        reason: "主营光纤光缆与通信网络，受光纤价格和订单变化的传导较直接。",
      },
      {
        label: "中天科技",
        code: "600522",
        fullCode: "sh600522",
        market: "A",
        confidence: 0.88,
        reason: "覆盖光纤光缆与通信制造，适合作为链条扩散强度的验证标的。",
      },
      {
        label: "烽火通信",
        code: "600498",
        fullCode: "sh600498",
        market: "A",
        confidence: 0.84,
        reason: "光通信设备与网络侧暴露较高，可作为行业景气外溢的跟踪对象。",
      },
    ],
  },
] as const

const LEGAL_SUFFIX_RE = /(?:控股)?(?:集团)?(?:股份)?有限公司$/u
const TRAILING_GROUP_RE = /集团$/u
const REGION_PREFIX_RE = /^(?:北京|上海|深圳|广州|天津|重庆|江苏|浙江|广东|山东|四川|福建|安徽|湖北|湖南|河南|河北|山西|陕西|江西|广西|云南|贵州|甘肃|青海|宁夏|新疆|辽宁|吉林|黑龙江|海南|内蒙古)/u

function normalizeComparable(value?: string | null) {
  return normalizeTitle(value ?? "").toLowerCase()
}

function hasDirectTrackableEntity(entities: InvestmentEntityRef[]) {
  return entities.some(entity => entity.entityType === "security" || entity.entityType === "issuer")
}

function collectIndustryLabels(entities: InvestmentEntityRef[]) {
  return new Set(
    entities
      .filter(entity => entity.entityType === "industry")
      .map(entity => normalizeComparable(entity.label))
      .filter(Boolean),
  )
}

function buildContextText(title: string, summary?: string | null) {
  return `${normalizeComparable(title)} ${normalizeComparable(summary)}`.trim()
}

function toCandidateEntity(candidate: CuratedWatchTargetRule["candidates"][number]): InvestmentEntityRef {
  return {
    entityId: candidate.fullCode,
    label: candidate.label,
    entityType: "security",
    entityTypeLabel: "交易标的",
    code: candidate.code,
    market: candidate.market,
  }
}

function inferMarketFromIdentifier(identifier?: string | null, exchange?: string | null) {
  const normalizedIdentifier = normalizeComparable(identifier)
  if (normalizedIdentifier.startsWith("sh") || normalizedIdentifier.startsWith("sz") || normalizedIdentifier.startsWith("bj")) {
    return "A"
  }
  if (normalizedIdentifier.startsWith("hk")) return "HK"
  if (normalizedIdentifier.startsWith("us:") || normalizedIdentifier.endsWith(".us")) return "US"

  const normalizedExchange = normalizeComparable(exchange)
  if (normalizedExchange === "sh" || normalizedExchange === "sz" || normalizedExchange === "bj") return "A"
  if (normalizedExchange === "hk") return "HK"
  if (normalizedExchange === "us" || normalizedExchange === "nasdaq" || normalizedExchange === "nyse") return "US"
  return undefined
}

function toResolvedEntity(candidate: WatchTargetRegistryResolveResult): InvestmentEntityRef {
  return {
    entityId: candidate.fullCode || candidate.code || candidate.name,
    label: candidate.name,
    entityType: "security",
    entityTypeLabel: "交易标的",
    code: candidate.code,
    market: inferMarketFromIdentifier(candidate.fullCode || candidate.code, candidate.exchange),
  }
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("watch_target_candidate_timeout"))
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

function combineConfidence(candidateConfidence: number, extraction: WatchTargetCandidateExtractionResult) {
  return Number(((clampConfidence(candidateConfidence) * 0.75) + (clampConfidence(extraction.confidence) * 0.25)).toFixed(3))
}

function getRegistryNameCandidates(value: string) {
  const normalized = value.trim()
  if (!normalized) return []

  const candidates = new Set<string>([normalized])
  const strippedLegalSuffix = normalized.replace(LEGAL_SUFFIX_RE, "").trim()
  if (strippedLegalSuffix) {
    candidates.add(strippedLegalSuffix)
    const strippedGroup = strippedLegalSuffix.replace(TRAILING_GROUP_RE, "").trim()
    if (strippedGroup) candidates.add(strippedGroup)
    const strippedRegion = strippedLegalSuffix.replace(REGION_PREFIX_RE, "").trim()
    if (strippedRegion && strippedRegion.length >= 3) candidates.add(strippedRegion)
    const strippedRegionGroup = strippedRegion.replace(TRAILING_GROUP_RE, "").trim()
    if (strippedRegionGroup && strippedRegionGroup.length >= 3) candidates.add(strippedRegionGroup)
  }

  return Array.from(candidates)
}

async function resolveRegistryCandidate(
  resolver: WatchTargetRegistryResolver,
  value: string,
) {
  for (const candidate of getRegistryNameCandidates(value)) {
    const resolved = await resolver.resolveByName(candidate)
    if (resolved) return resolved
  }

  return null
}

function dedupeCandidates(candidates: InvestmentWatchTargetCandidate[]) {
  const deduped = new Map<string, InvestmentWatchTargetCandidate>()
  for (const candidate of candidates) {
    const key = `${candidate.entity.entityId}|${candidate.entity.label}`
    const existing = deduped.get(key)
    if (!existing || candidate.confidence > existing.confidence) {
      deduped.set(key, candidate)
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => right.confidence - left.confidence || left.entity.label.localeCompare(right.entity.label))
    .slice(0, 4)
}

export function deriveWatchTargetCandidates(input: {
  title: string
  summary?: string | null
  affectedEntities: InvestmentEntityRef[]
  relatedTopics: IndustryTag[]
}): InvestmentWatchTargetCandidate[] {
  if (hasDirectTrackableEntity(input.affectedEntities)) return []

  const contextText = buildContextText(input.title, input.summary)
  const industryLabels = collectIndustryLabels(input.affectedEntities)
  const topicTags = new Set(input.relatedTopics)

  const matched: InvestmentWatchTargetCandidate[] = []
  for (const rule of CURATED_WATCH_TARGET_RULES) {
    const matchedByIndustry = rule.industryLabels?.some(label => industryLabels.has(normalizeComparable(label))) ?? false
    const matchedByTopic = rule.topicTags?.some(tag => topicTags.has(tag)) ?? false
    const matchedByKeyword = !matchedByIndustry && !matchedByTopic
      ? (rule.keywords?.some(keyword => contextText.includes(normalizeComparable(keyword))) ?? false)
      : false

    if (!matchedByIndustry && !matchedByTopic && !matchedByKeyword) continue

    const matchedBy = matchedByIndustry || matchedByKeyword ? "industry_entity" as const : "topic_tag" as const
    for (const candidate of rule.candidates) {
      matched.push({
        entity: toCandidateEntity(candidate),
        reason: candidate.reason,
        confidence: candidate.confidence,
        source: "industry-watch-registry",
        matchedBy,
      })
    }
  }

  return dedupeCandidates(matched)
}

export async function resolveWatchTargetCandidates(
  input: ResolveWatchTargetCandidatesInput,
  options?: {
    extractor?: WatchTargetCandidateExtractor
    registryResolver?: WatchTargetRegistryResolver
    extractionTimeoutMs?: number
  },
) {
  if (hasDirectTrackableEntity(input.affectedEntities)) return []

  if (input.sourceId && HIGH_THROUGHPUT_LIVE_WATCH_TARGET_SOURCE_IDS.has(input.sourceId)) {
    return deriveWatchTargetCandidates({
      title: input.title,
      summary: input.summary,
      affectedEntities: input.affectedEntities,
      relatedTopics: input.topicTags,
    })
  }

  if (!options?.extractor || !options.registryResolver) {
    return deriveWatchTargetCandidates({
      title: input.title,
      summary: input.summary,
      affectedEntities: input.affectedEntities,
      relatedTopics: input.topicTags,
    })
  }

  let extraction: WatchTargetCandidateExtractionResult
  try {
    extraction = await withTimeout(options.extractor.extract({
      eventId: input.eventId,
      title: input.title,
      summary: input.summary,
      eventType: input.eventType,
      eventSubType: input.eventSubType,
      sourceKind: input.sourceKind,
      topicTags: input.topicTags,
      affectedMarkets: input.affectedMarkets,
      affectedEntities: input.affectedEntities,
      impactSummary: input.impactSummary,
    }), options.extractionTimeoutMs ?? 1500)
  } catch {
    return deriveWatchTargetCandidates({
      title: input.title,
      summary: input.summary,
      affectedEntities: input.affectedEntities,
      relatedTopics: input.topicTags,
    })
  }

  const llmCandidateResults = await Promise.all(extraction.candidates.map(async (candidate) => {
    const resolved = await resolveRegistryCandidate(options.registryResolver!, candidate.label)
    if (!resolved) return null
    return {
      entity: toResolvedEntity(resolved),
      reason: candidate.reason.trim(),
      confidence: combineConfidence(candidate.confidence, extraction),
      source: "llm-registry" as const,
      matchedBy: "llm_hypothesis" as const,
    }
  })) as Array<InvestmentWatchTargetCandidate | null>

  const llmCandidates = llmCandidateResults
    .filter((candidate): candidate is InvestmentWatchTargetCandidate => candidate !== null)

  if (llmCandidates.length) {
    return dedupeCandidates(llmCandidates)
  }

  return deriveWatchTargetCandidates({
    title: input.title,
    summary: input.summary,
    affectedEntities: input.affectedEntities,
    relatedTopics: input.topicTags,
  })
}
