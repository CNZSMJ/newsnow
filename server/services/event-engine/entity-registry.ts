import type { EntityLinkRow, EventFactRow } from "#/types"
import { normalizePrimaryEntityCandidate } from "#/services/event-engine/text"

type EntityLinkLike = Pick<EntityLinkRow, "entity_type" | "entity_name" | "code" | "full_code" | "confidence" | "resolver">

function normalizeEntityText(value?: string | null) {
  return value?.trim().toLowerCase()
}

export function normalizeSecurityCode(value?: string | null) {
  const normalized = normalizeEntityText(value)
  if (!normalized) return undefined

  const fullCodeMatch = normalized.match(/^(?:sh|sz|bj|hk)(\d{4,6})$/)
  if (fullCodeMatch) return fullCodeMatch[1]

  const codeMatch = normalized.match(/^\d{4,6}$/)
  if (codeMatch) return codeMatch[0]

  return undefined
}

export function normalizeSecurityIdentifier(value?: string | null) {
  const normalized = normalizeEntityText(value)
  if (!normalized) return undefined

  const numericCode = normalizeSecurityCode(normalized)
  if (numericCode) return `code:${numericCode}`

  const qualifiedTickerMatch = normalized.match(/^([a-z0-9]{1,10})\.(us)$/)
  if (qualifiedTickerMatch) return `${qualifiedTickerMatch[2]}:${qualifiedTickerMatch[1]}`

  const explicitMarketMatch = normalized.match(/^(us):([a-z0-9]{1,10})$/)
  if (explicitMarketMatch) return `${explicitMarketMatch[1]}:${explicitMarketMatch[2]}`

  return undefined
}

export function isCodeLikeEntityName(value?: string | null) {
  const normalized = normalizeEntityText(value)
  return normalized ? /^(?:(?:sh|sz|bj|hk)?\d{4,6}|[a-z0-9]{1,10}\.us|us:[a-z0-9]{1,10})$/.test(normalized) : false
}

function getResolverPriority(resolver: string) {
  switch (resolver) {
    case "tdx-api-code":
    case "registry-code":
      return 40
    case "tdx-api-name":
    case "registry-company":
    case "explicit-ticker-mention":
      return 30
    case "llm-provisional-institution":
    case "deterministic-provisional-institution":
      return 20
    case "title-regex":
      return 10
    case "source-tags":
      return 5
    default:
      return 0
  }
}

function getEntityLinkScore(row: EntityLinkLike) {
  let score = Math.round(row.confidence * 100)
  if (!isCodeLikeEntityName(row.entity_name)) score += 50
  if (row.full_code) score += 20
  if (row.code) score += 10
  score += getResolverPriority(row.resolver)
  return score
}

function isPreferredEntityLink(candidate: EntityLinkLike, current: EntityLinkLike) {
  const candidateScore = getEntityLinkScore(candidate)
  const currentScore = getEntityLinkScore(current)
  if (candidateScore !== currentScore) return candidateScore > currentScore
  if (candidate.entity_name.length !== current.entity_name.length) {
    return candidate.entity_name.length > current.entity_name.length
  }
  if (candidate.full_code.length !== current.full_code.length) {
    return candidate.full_code.length > current.full_code.length
  }
  return candidate.code.length > current.code.length
}

export function getEntitySecurityGroupKey(row: EntityLinkLike) {
  if (row.entity_type !== "stock" && row.entity_type !== "company") return undefined
  const normalizedIdentifier = normalizeSecurityIdentifier(row.full_code)
    ?? normalizeSecurityIdentifier(row.code)
    ?? normalizeSecurityIdentifier(row.entity_name)
  if (!normalizedIdentifier) return undefined
  return `security:${normalizedIdentifier}`
}

export function getEntityAliasKey(row: EntityLinkLike) {
  const securityGroupKey = getEntitySecurityGroupKey(row)
  if (securityGroupKey) return `${row.entity_type}|${securityGroupKey}`

  return [
    row.entity_type,
    normalizeEntityText(row.entity_name) ?? "",
    normalizeEntityText(row.code) ?? "",
    normalizeEntityText(row.full_code) ?? "",
  ].join("|")
}

export function getEntityLookupTerms(value?: string | null) {
  const normalizedText = normalizeEntityText(value)
  if (!normalizedText) return []

  const terms = new Set<string>([normalizedText])
  const normalizedIdentifier = normalizeSecurityIdentifier(value)
  if (!normalizedIdentifier) return Array.from(terms)

  if (normalizedIdentifier.startsWith("us:")) {
    const ticker = normalizedIdentifier.slice(3)
    terms.add(normalizedIdentifier)
    terms.add(`${ticker}.us`)
    terms.add(ticker)
    return Array.from(terms)
  }

  const normalizedCode = normalizeSecurityCode(value)
  if (!normalizedCode) return Array.from(terms)

  for (const prefix of ["sh", "sz", "bj", "hk"]) {
    terms.add(`${prefix}${normalizedCode}`)
  }
  terms.add(normalizedCode)
  return Array.from(terms)
}

function buildSecurityIdMap(rows: EntityLinkLike[]) {
  const bestBySecurityGroup = new Map<string, EntityLinkLike>()

  for (const row of rows) {
    const securityGroupKey = getEntitySecurityGroupKey(row)
    if (!securityGroupKey) continue

    const existing = bestBySecurityGroup.get(securityGroupKey)
    if (!existing || isPreferredEntityLink(row, existing)) {
      bestBySecurityGroup.set(securityGroupKey, row)
    }
  }

  return new Map(
    Array.from(bestBySecurityGroup.entries())
      .map(([securityGroupKey, row]) => [securityGroupKey, row.full_code || row.code || row.entity_name]),
  )
}

export function normalizeEntityLinks(rows: EntityLinkRow[]) {
  const bestByAlias = new Map<string, EntityLinkRow>()

  for (const row of rows) {
    const aliasKey = getEntityAliasKey(row)
    const existing = bestByAlias.get(aliasKey)
    if (!existing || isPreferredEntityLink(row, existing)) {
      bestByAlias.set(aliasKey, row)
    }
  }

  return Array.from(bestByAlias.values())
}

export function normalizeFactEntityIds(rows: EventFactRow[], entityLinks: EntityLinkRow[]) {
  const canonicalSecurityIds = buildSecurityIdMap(entityLinks)

  return rows.map((row) => {
    const normalizedIdentifier = normalizeSecurityIdentifier(row.entity_id)
    const canonicalEntityId = normalizedIdentifier ? canonicalSecurityIds.get(`security:${normalizedIdentifier}`) : undefined
    if (!canonicalEntityId || canonicalEntityId === row.entity_id) return row
    return {
      ...row,
      entity_id: canonicalEntityId,
    }
  })
}

export function normalizePrimaryEntityName(primaryEntityName: string | null, entityLinks: EntityLinkRow[]) {
  const normalizedPrimaryEntityName = normalizePrimaryEntityCandidate(primaryEntityName)
  if (normalizedPrimaryEntityName && !isCodeLikeEntityName(normalizedPrimaryEntityName)) return normalizedPrimaryEntityName

  const candidates = entityLinks
    .filter(row => (row.entity_type === "company" || row.entity_type === "stock" || row.entity_type === "institution") && !isCodeLikeEntityName(row.entity_name))
    .sort((a, b) => {
      const priority = (value: EntityLinkRow["entity_type"]) => {
        if (value === "company") return 0
        if (value === "stock") return 1
        if (value === "institution") return 2
        return 3
      }
      if (a.entity_type !== b.entity_type) return priority(a.entity_type) - priority(b.entity_type)
      return getEntityLinkScore(b) - getEntityLinkScore(a)
    })

  return normalizePrimaryEntityCandidate(candidates[0]?.entity_name) ?? normalizedPrimaryEntityName ?? primaryEntityName
}

export function getEntityLinkPersistenceKey(row: EntityLinkRow) {
  return [
    row.event_id,
    row.entity_type,
    row.entity_name,
    row.code,
    row.full_code,
    row.confidence,
    row.resolver,
  ].join("|")
}

export class EntityRegistry {
  constructor(private readonly entityLinks: EntityLinkRow[] = []) {}

  getAliasKey(row: EntityLinkLike) {
    return getEntityAliasKey(row)
  }

  getLookupTerms(value?: string | null) {
    return getEntityLookupTerms(value)
  }

  normalizeEntityLinks(rows: EntityLinkRow[] = this.entityLinks) {
    return normalizeEntityLinks(rows)
  }

  normalizeFactEntityIds(rows: EventFactRow[], entityLinks: EntityLinkRow[] = this.entityLinks) {
    return normalizeFactEntityIds(rows, entityLinks)
  }

  normalizePrimaryEntityName(primaryEntityName: string | null, entityLinks: EntityLinkRow[] = this.entityLinks) {
    return normalizePrimaryEntityName(primaryEntityName, entityLinks)
  }
}

export function createEntityRegistry(entityLinks: EntityLinkRow[] = []) {
  return new EntityRegistry(entityLinks)
}
