import type { IndustryTag } from "@shared/industry"
import type { EventEntityType, NewsItem } from "@shared/types"
import type { EntityLinkRow } from "#/types"
import { getEntityAliasKey, normalizeSecurityIdentifier } from "#/services/event-engine/entity-registry"
import { resolveSecurityByCode, resolveSecurityByName } from "#/services/tdx-api"
import { STOCK_CODE_RE, extractCompanyHints, extractExplicitSecurityMentions, isBroadMarketDescriptor } from "#/services/event-engine/text"

export async function extractEntityLinks(
  eventId: string,
  title: string,
  topicTags: IndustryTag[],
  options?: {
    primaryEntityName?: string | null
    summary?: string | null
    payload?: NewsItem
  },
) {
  const entities: EntityLinkRow[] = []
  const seen = new Set<string>()
  const groundedSecurityIdentifiers = new Set<string>()
  const pushEntity = (entityType: EventEntityType, entityName: string, options?: { code?: string, fullCode?: string, confidence?: number, resolver?: string }) => {
    const key = getEntityAliasKey({
      entity_type: entityType,
      entity_name: entityName,
      code: options?.code ?? "",
      full_code: options?.fullCode ?? "",
      confidence: options?.confidence ?? 0.6,
      resolver: options?.resolver ?? "rule",
    })
    if (seen.has(key)) return
    seen.add(key)
    entities.push({
      event_id: eventId,
      entity_type: entityType,
      entity_name: entityName,
      code: options?.code ?? "",
      full_code: options?.fullCode ?? "",
      confidence: options?.confidence ?? 0.6,
      resolver: options?.resolver ?? "rule",
    })
  }
  const addGroundedSecurityIdentifier = (value?: string | null) => {
    const normalizedIdentifier = normalizeSecurityIdentifier(value)
    if (normalizedIdentifier) groundedSecurityIdentifiers.add(normalizedIdentifier)
  }
  const matchesGroundedSecurity = (input?: { code?: string | null, fullCode?: string | null }) => {
    if (!groundedSecurityIdentifiers.size) return true

    const fullCodeMatch = normalizeSecurityIdentifier(input?.fullCode)
    if (fullCodeMatch && groundedSecurityIdentifiers.has(fullCodeMatch)) return true

    const codeMatch = normalizeSecurityIdentifier(input?.code)
    if (codeMatch && groundedSecurityIdentifiers.has(codeMatch)) return true

    return false
  }

  for (const tag of topicTags) {
    pushEntity("topic", tag, { confidence: 0.95, resolver: "source-tags" })
    pushEntity("industry", tag, { confidence: 0.75, resolver: "source-tags" })
  }

  const raw = (options?.payload?.extra?.raw ?? {}) as Record<string, unknown>
  const contextTexts = [
    title,
    options?.summary ?? null,
    options?.payload?.extra?.info ?? null,
    options?.payload?.extra?.hover ?? null,
    typeof raw.brief === "string" ? raw.brief : null,
    typeof raw.description === "string" ? raw.description : null,
    typeof raw.abstract === "string" ? raw.abstract : null,
    typeof raw.previewText === "string" ? raw.previewText : null,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
  const contextText = contextTexts.join(" ")
  const matches = contextText.match(STOCK_CODE_RE) ?? []
  for (const rawCode of matches) {
    const lowered = rawCode.toLowerCase()
    const fullCode = /^(?:sh|sz|bj)\d{6}$/.test(lowered) ? lowered : undefined
    const code = lowered.slice(-6)
    addGroundedSecurityIdentifier(fullCode ?? code)
    pushEntity("stock", fullCode ?? code, { code, fullCode, confidence: fullCode ? 0.95 : 0.75, resolver: "title-regex" })
    const resolved = await resolveSecurityByCode(fullCode ?? code)
    if (resolved) {
      pushEntity("stock", resolved.name, {
        code: resolved.code,
        fullCode: resolved.fullCode,
        confidence: 0.98,
        resolver: "tdx-api-code",
      })
      pushEntity("company", resolved.name, {
        code: resolved.code,
        fullCode: resolved.fullCode,
        confidence: 0.98,
        resolver: "tdx-api-code",
      })
    }
  }

  const explicitSecurityMentions = Array.from(new Map(
    contextTexts
      .flatMap(text => extractExplicitSecurityMentions(text))
      .map(mention => [mention.fullCode, mention]),
  ).values())

  for (const mention of explicitSecurityMentions) {
    addGroundedSecurityIdentifier(mention.fullCode)
    pushEntity("stock", mention.label, {
      code: mention.code,
      fullCode: mention.fullCode,
      confidence: 0.93,
      resolver: "explicit-ticker-mention",
    })
    pushEntity("company", mention.label, {
      code: mention.code,
      fullCode: mention.fullCode,
      confidence: 0.88,
      resolver: "explicit-ticker-mention",
    })
  }

  if (options?.primaryEntityName?.trim()) {
    const primaryEntityName = options.primaryEntityName.trim()
    if (!isBroadMarketDescriptor(primaryEntityName)) {
      const resolved = await resolveSecurityByName(primaryEntityName)
      if (resolved && matchesGroundedSecurity(resolved)) {
        pushEntity("stock", resolved.name, {
          code: resolved.code,
          fullCode: resolved.fullCode,
          confidence: 0.9,
          resolver: "primary-entity-name",
        })
        pushEntity("company", resolved.name, {
          code: resolved.code,
          fullCode: resolved.fullCode,
          confidence: 0.9,
          resolver: "primary-entity-name",
        })
      } else if (!groundedSecurityIdentifiers.size) {
        pushEntity("company", primaryEntityName, {
          confidence: 0.65,
          resolver: "primary-entity-fallback",
        })
      }
    }
  }

  const hints = Array.from(new Set(contextTexts.flatMap(text => extractCompanyHints(text))))
  for (const hint of hints) {
    const resolved = await resolveSecurityByName(hint)
    if (!resolved || !matchesGroundedSecurity(resolved)) continue
    pushEntity("stock", resolved.name, {
      code: resolved.code,
      fullCode: resolved.fullCode,
      confidence: 0.85,
      resolver: "tdx-api-name",
    })
    pushEntity("company", resolved.name, {
      code: resolved.code,
      fullCode: resolved.fullCode,
      confidence: 0.85,
      resolver: "tdx-api-name",
    })
  }

  return entities
}
