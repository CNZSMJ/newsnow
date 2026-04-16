import type { EntityLinkRow, EventFactRow } from "#/types"

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

export function isCodeLikeEntityName(value?: string | null) {
  const normalized = normalizeEntityText(value)
  return normalized ? /^(?:sh|sz|bj|hk)?\d{4,6}$/.test(normalized) : false
}

function getResolverPriority(resolver: string) {
  switch (resolver) {
    case "tdx-api-code":
      return 40
    case "tdx-api-name":
      return 30
    case "title-regex":
      return 10
    case "source-tags":
      return 5
    default:
      return 0
  }
}

function getEntityLinkScore(row: EntityLinkRow) {
  let score = Math.round(row.confidence * 100)
  if (!isCodeLikeEntityName(row.entity_name)) score += 50
  if (row.full_code) score += 20
  if (row.code) score += 10
  score += getResolverPriority(row.resolver)
  return score
}

function isPreferredEntityLink(candidate: EntityLinkRow, current: EntityLinkRow) {
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

function getEntityAliasKey(row: EntityLinkRow) {
  if (row.entity_type === "stock" || row.entity_type === "company") {
    const normalizedCode = normalizeSecurityCode(row.full_code)
      ?? normalizeSecurityCode(row.code)
      ?? normalizeSecurityCode(row.entity_name)
    if (normalizedCode) return `${row.entity_type}|security:${normalizedCode}`
  }

  return [
    row.entity_type,
    normalizeEntityText(row.entity_name) ?? "",
    normalizeEntityText(row.code) ?? "",
    normalizeEntityText(row.full_code) ?? "",
  ].join("|")
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

function buildCanonicalSecurityIdMap(entityLinks: EntityLinkRow[]) {
  const bestByCode = new Map<string, EntityLinkRow>()

  for (const row of entityLinks) {
    if (row.entity_type !== "stock") continue
    const normalizedCode = normalizeSecurityCode(row.full_code)
      ?? normalizeSecurityCode(row.code)
      ?? normalizeSecurityCode(row.entity_name)
    if (!normalizedCode) continue

    const existing = bestByCode.get(normalizedCode)
    if (!existing || isPreferredEntityLink(row, existing)) {
      bestByCode.set(normalizedCode, row)
    }
  }

  return new Map(
    Array.from(bestByCode.entries())
      .map(([normalizedCode, row]) => [normalizedCode, row.full_code || row.code || row.entity_name]),
  )
}

export function normalizeFactEntityIds(rows: EventFactRow[], entityLinks: EntityLinkRow[]) {
  const canonicalSecurityIds = buildCanonicalSecurityIdMap(entityLinks)

  return rows.map((row) => {
    const normalizedCode = normalizeSecurityCode(row.entity_id)
    const canonicalEntityId = normalizedCode ? canonicalSecurityIds.get(normalizedCode) : undefined
    if (!canonicalEntityId || canonicalEntityId === row.entity_id) return row
    return {
      ...row,
      entity_id: canonicalEntityId,
    }
  })
}

export function normalizePrimaryEntityName(primaryEntityName: string | null, entityLinks: EntityLinkRow[]) {
  if (primaryEntityName && !isCodeLikeEntityName(primaryEntityName)) return primaryEntityName

  const candidates = entityLinks
    .filter(row => (row.entity_type === "company" || row.entity_type === "stock") && !isCodeLikeEntityName(row.entity_name))
    .sort((a, b) => {
      if (a.entity_type !== b.entity_type) return a.entity_type === "company" ? -1 : 1
      return getEntityLinkScore(b) - getEntityLinkScore(a)
    })

  return candidates[0]?.entity_name ?? primaryEntityName
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
