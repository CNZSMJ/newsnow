import md5 from "md5"
import type { EventSourceKind } from "@shared/event-profile"
import type { EventSubType, EventType, NewsItem, SourceID } from "@shared/types"
import sources from "@shared/sources"
import type { RawItemRow } from "#/types"
import { extractPeriodKey, inferReleaseCadence, normalizeReleaseTitle, normalizeTitleForClustering } from "#/services/event-engine/text"

function toClusterBucket(eventType: EventType, publishedAt?: number) {
  const bucketMs = eventType === "news" ? 30 * 60 * 1000 : 24 * 60 * 60 * 1000
  return publishedAt ? Math.floor(publishedAt / bucketMs) : 0
}

export function buildEventIdentity(input: {
  eventType: EventType
  eventSubType: EventSubType
  sourceKind?: EventSourceKind
  title: string
  primaryEntityName?: string
  publishedAt?: number
  identityHints?: string[]
}) {
  const clusterTitle = normalizeTitleForClustering(input.title, input.primaryEntityName)
  const bucket = toClusterBucket(input.eventType, input.publishedAt)
  const canonicalIdentityParts = (() => {
    if (input.sourceKind === "exchange_disclosure" && input.identityHints?.length) {
      return [
        input.sourceKind,
        ...input.identityHints,
      ]
    }

    if (input.sourceKind === "official_rate_fixing" && input.identityHints?.length) {
      return [
        input.sourceKind,
        ...input.identityHints,
      ]
    }

    if (input.sourceKind === "official_central_bank_operation" && input.identityHints?.length) {
      return [
        input.sourceKind,
        ...input.identityHints,
      ]
    }

    if ((input.sourceKind === "industry_stat_release" || input.sourceKind === "industry_report_release" || input.sourceKind === "industry_policy_notice") && input.identityHints?.length) {
      return [
        input.sourceKind,
        ...input.identityHints,
      ]
    }

    return null
  })()
  const clusterKey = md5([
    ...(canonicalIdentityParts ?? [
      input.eventType,
      input.eventSubType,
      input.sourceKind ?? "",
      input.primaryEntityName ?? "",
      clusterTitle.toLowerCase(),
      ...(input.identityHints ?? []),
      bucket,
    ]),
  ].join("|"))
  return {
    clusterKey,
    eventId: `evt_${clusterKey}`,
  }
}

function getPublishedDay(publishedAt?: number | null) {
  if (!publishedAt) return null
  return new Date(publishedAt).toISOString().slice(0, 10)
}

export function buildEventIdentityHints(input: {
  sourceId: SourceID
  sourceKind?: EventSourceKind
  eventSubType: EventSubType
  raw: RawItemRow
  payload: NewsItem
}) {
  const raw = (input.payload.extra?.raw ?? {}) as Record<string, unknown>
  const publishedDay = getPublishedDay(input.raw.published_at)
  const sourceTags = sources[input.sourceId]?.tags ?? []

  if (input.sourceKind === "official_rate_fixing") {
    const metric = typeof raw.termCode === "string"
      ? raw.termCode
      : typeof raw.productCode === "string"
        ? raw.productCode
        : null
    const effectiveDate = typeof raw.showDateCN === "string"
      ? raw.showDateCN.slice(0, 10)
      : typeof raw.produceDate === "string"
        ? raw.produceDate.slice(0, 10)
        : publishedDay

    return [metric, effectiveDate].filter(Boolean) as string[]
  }

  if (input.sourceKind === "official_central_bank_operation") {
    const href = typeof raw.href === "string" ? raw.href : null
    return [input.eventSubType, href ?? publishedDay].filter(Boolean) as string[]
  }

  if (input.sourceKind === "exchange_disclosure") {
    const documentKey = typeof raw.webPath === "string"
      ? raw.webPath
      : typeof raw.href === "string"
        ? raw.href
        : input.raw.url
    const secCode = typeof raw.secCode === "string"
      ? raw.secCode
      : typeof raw.securityCode === "string"
        ? raw.securityCode
        : null
    const announcementCode = typeof raw.announcementId === "string"
      ? raw.announcementId
      : typeof raw.newsId === "number"
        ? String(raw.newsId)
        : null

    return [documentKey, announcementCode, secCode, publishedDay].filter(Boolean) as string[]
  }

  if (input.sourceKind === "industry_stat_release" || input.sourceKind === "industry_report_release" || input.sourceKind === "industry_policy_notice") {
    const text = `${input.payload.title} ${typeof input.payload.extra?.info === "string" ? input.payload.extra.info : ""}`
    const periodKey = extractPeriodKey(text) ?? publishedDay
    const cadence = inferReleaseCadence(text)
    const normalizedCore = normalizeReleaseTitle(input.payload.title) || normalizeTitleForClustering(input.payload.title)
    const rawCategory = typeof raw.announcementTypeName === "string"
      ? raw.announcementTypeName
      : typeof raw.columnName === "string"
        ? raw.columnName
        : null

    return [
      input.sourceId,
      input.eventSubType,
      sourceTags.join(","),
      rawCategory,
      cadence,
      periodKey,
      normalizedCore.toLowerCase(),
    ].filter(Boolean) as string[]
  }

  return []
}
