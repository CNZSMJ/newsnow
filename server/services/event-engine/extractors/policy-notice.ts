import md5 from "md5"
import type { NewsItem, SourceID } from "@shared/types"
import sources from "@shared/sources"
import type { EventFactRow, RawItemRow } from "#/types"
import { extractPeriodKey, inferReleaseCadence, normalizeReleaseTitle, normalizeTitle } from "#/services/event-engine/text"

function parsePolicyDirection(text: string) {
  if (/支持|鼓励|推进|促进|扩大|加快|优化|规范发展|提质|提效/.test(text)) return "up"
  if (/限制|压降|收紧|规范整治|处罚|禁止|叫停|暂停|约束/.test(text)) return "down"
  return null
}

function extractPolicyAction(title: string) {
  const normalized = normalizeTitle(title)
  const matched = normalized.match(/^关于(.+?)(?:的)?(?:实施意见|通知|公告|办法|规定|制度|细则|方案|若干措施)$/)
  if (matched?.[1]) return matched[1]
  return normalizeReleaseTitle(title) || normalized
}

function extractTargetScope(text: string, policyAction: string) {
  const stripLeadingPolicyVerbs = (value: string) => value.replace(/^(?:(?:关于|促进|支持|推动))+/, "")
  const matched = text.match(/([\u4e00-\u9fa5A-Za-z]{2,24}(?:行业|企业|项目|市场|机构|主体))/)
  if (matched?.[1]) return stripLeadingPolicyVerbs(matched[1])
  const actionMatch = policyAction.match(/([\u4e00-\u9fa5A-Za-z]{2,24}(?:行业|企业|项目|市场|机构|主体))/)
  return actionMatch?.[1] ? stripLeadingPolicyVerbs(actionMatch[1]) : null
}

function extractExecutionWindow(text: string) {
  const direct = text.match(/(\d{4}年\d{1,2}月\d{1,2}日(?:起|起实施|实施|开始实施)?)/)
  if (direct?.[1]) return direct[1]
  const ranged = text.match(/(自\d{4}年\d{1,2}月\d{1,2}日起[^，。；]*)/)
  return ranged?.[1] ?? null
}

function extractIssuerInstitution(sourceId: SourceID, title: string) {
  const normalized = normalizeTitle(title)
  const prefix = normalized.match(/^([\u4e00-\u9fa5A-Za-z]{2,32}(?:部|委|局|署|会|院|行|厅|总局|管理局|协会|央行))(?:发布|印发|关于|令)/)?.[1]
  if (prefix) return prefix
  return sources[sourceId]?.name ?? sourceId
}

function firstTagId(payload: NewsItem, sourceId: SourceID) {
  const tags = (payload.extra as { tags?: string[] } | undefined)?.tags
  if (Array.isArray(tags) && typeof tags[0] === "string") return tags[0]
  const sourceTags = sources[sourceId]?.tags
  if (sourceTags?.length) return sourceTags[0]
  const [main] = sourceId.split("-")
  return main
}

export function extractPolicyNoticeFacts(input: {
  eventId: string
  rawId: string
  sourceId: SourceID
  raw: RawItemRow
  payload: NewsItem
}) {
  const title = normalizeTitle(input.payload.title)
  const text = `${title} ${typeof input.payload.extra?.info === "string" ? input.payload.extra.info : ""}`
  const raw = (input.payload.extra?.raw ?? {}) as Record<string, unknown>
  const periodKey = extractPeriodKey(text)
  const cadence = inferReleaseCadence(text)
  const direction = parsePolicyDirection(text)
  const policyAction = extractPolicyAction(title)
  const targetScope = extractTargetScope(text, policyAction)
  const executionWindow = extractExecutionWindow(text)
  const issuerInstitution = extractIssuerInstitution(input.sourceId, title)
  const affectedMarkets = sources[input.sourceId]?.eventProfile?.markets ?? []

  const fact: EventFactRow = {
    fact_id: `fact_${md5(`${input.eventId}|${input.rawId}|policy_notice`)}`,
    event_id: input.eventId,
    evidence_id: input.rawId,
    fact_type: "policy_notice",
    metric_name: policyAction || normalizeReleaseTitle(title) || "policy_notice",
    value: null,
    unit: cadence,
    previous_value: null,
    delta: null,
    direction,
    effective_at: input.raw.published_at,
    entity_id: firstTagId(input.payload, input.sourceId),
    confidence: 0.72,
    payload_json: JSON.stringify({
      sourceId: input.sourceId,
      cadence,
      periodKey,
      issuerInstitution,
      policyAction,
      targetScope,
      executionWindow,
      affectedMarkets,
      summary: typeof input.payload.extra?.info === "string" ? input.payload.extra.info : undefined,
      raw,
    }),
  }

  return [fact]
}
