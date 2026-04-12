import type { IndustryTag } from "@shared/industry"
import type { EventEntityType, NewsItem } from "@shared/types"
import type { EntityLinkRow } from "#/types"
import { resolveSecurityByCode, resolveSecurityByName } from "#/services/tdx-api"
import { STOCK_CODE_RE, extractCompanyHints } from "#/services/event-engine/text"

export async function extractEntityLinks(
  eventId: string,
  title: string,
  topicTags: IndustryTag[],
  options?: {
    summary?: string | null
    payload?: NewsItem
  },
) {
  const entities: EntityLinkRow[] = []
  const seen = new Set<string>()
  const pushEntity = (entityType: EventEntityType, entityName: string, options?: { code?: string, fullCode?: string, confidence?: number, resolver?: string }) => {
    const key = [entityType, entityName, options?.code ?? "", options?.fullCode ?? ""].join("|")
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

  const hints = Array.from(new Set(contextTexts.flatMap(text => extractCompanyHints(text))))
  for (const hint of hints) {
    const resolved = await resolveSecurityByName(hint)
    if (!resolved) continue
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
