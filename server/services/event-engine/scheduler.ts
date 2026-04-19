import { Buffer } from "node:buffer"
import process from "node:process"
import md5 from "md5"
import type { EventProfile } from "@shared/event-profile"
import type { EventLifecycleState, InvestmentEntityRef, NewsItem, SourceID } from "@shared/types"
import sources from "@shared/sources"
import { hydrateClsRawItem } from "#/sources/cls"
import { getters } from "#/getters"
import { getEventTable } from "#/database/events"
import type { EventRow, RawItemRow } from "#/types"
import { normalizeEntityLinks, normalizeFactEntityIds, normalizePrimaryEntityName } from "#/services/event-engine/entity-normalization"
import { extractEventFacts } from "#/services/event-engine/extractors"
import { buildImpactSnapshot } from "#/services/event-engine/impact"
import { buildEventIdentity, buildEventIdentityHints, derivePeriodicSeriesMetadata } from "#/services/event-engine/merger"
import { EVENT_ENGINE_METRICS, incrementEventEngineMetric, toMetricLabels } from "#/services/event-engine/metrics"
import { getSourceEventProfile, validateSourceEventProfile } from "#/services/event-engine/profiles"
import { resolveRequestedSourceSeedIds } from "#/services/event-engine/request-scope"
import { type ResolvedEventClassification, resolveEventClassification } from "#/services/event-engine/resolver"
import {
  getLiveSubjectRoleExtractor,
  getLiveSubjectRoleExtractorTimeoutMs,
} from "#/services/event-engine/subject-role-live-extractor"
import { resolveEventSubjects } from "#/services/event-engine/subject-resolution"
import {
  getLiveWatchTargetCandidateExtractor,
  getLiveWatchTargetCandidateExtractorTimeoutMs,
} from "#/services/event-engine/watch-target-live-extractor"
import { resolveWatchTargetCandidates } from "#/services/event-engine/watch-target-candidates"
import { normalizeTitle, normalizeUrl, parsePublishedAt, stripHtml } from "#/services/event-engine/text"
import { EVENT_ENGINE_VERSIONS } from "#/services/event-engine/versions"
import { resolveSecurityByName } from "#/services/tdx-api"

const DEFAULT_EVENT_COLUMNS = new Set(["finance", "industry"])
const WORKER_INTERVAL_MS = Number(process.env.EVENT_BUS_INTERVAL_MS || 2 * 60 * 1000)
const WORKER_ENABLED = process.env.EVENT_BUS_WORKER !== "false"
const BACKFILL_MAX_HOURS = 24 * 365

let workerStarted = false
let workerRunning = false
let workerLastRunAt = 0
let workerLastError = ""
type EventTableInstance = NonNullable<Awaited<ReturnType<typeof getEventTable>>>

function getDefaultEventSourceIds() {
  return Object.entries(sources)
    .filter(([id, source]) => !source.redirect && source.column && DEFAULT_EVENT_COLUMNS.has(source.column) && getters[id as SourceID])
    .map(([id]) => id as SourceID)
}

function toRawRow(sourceId: SourceID, item: NewsItem, fetchedAt: number): RawItemRow {
  const title = normalizeTitle(item.title)
  const url = normalizeUrl(item.url)
  const mobileUrl = item.mobileUrl ? normalizeUrl(item.mobileUrl) : null
  const publishedAt = parsePublishedAt(item.pubDate ?? item.extra?.date)
  const sourceItemId = String(item.id)
  const rawId = `raw_${sourceId}_${sourceItemId}_${Buffer.from(url).toString("base64").slice(0, 24)}`

  return {
    raw_id: rawId,
    source_id: sourceId,
    source_item_id: sourceItemId,
    title,
    url,
    mobile_url: mobileUrl,
    published_at: publishedAt ?? null,
    fetched_at: fetchedAt,
    fingerprint: `${title}|${url}`,
    payload_json: JSON.stringify(item),
    status: "active",
  }
}

function inferWatchTargetMarket(fullCode?: string | null, code?: string | null) {
  const normalized = (fullCode || code || "").trim().toLowerCase()
  if (normalized.startsWith("sh") || normalized.startsWith("sz") || normalized.startsWith("bj")) return "A"
  if (normalized.startsWith("hk")) return "HK"
  if (normalized.startsWith("us:") || normalized.endsWith(".us")) return "US"
  return undefined
}

function toWatchTargetEntityRef(entity: ReturnType<typeof normalizeEntityLinks>[number]): InvestmentEntityRef {
  switch (entity.entity_type) {
    case "stock":
      return {
        entityId: entity.full_code || entity.code || entity.entity_name,
        label: entity.entity_name,
        entityType: "security",
        entityTypeLabel: "交易标的",
        code: entity.code || undefined,
        market: inferWatchTargetMarket(entity.full_code, entity.code),
      }
    case "company":
      return {
        entityId: entity.full_code || entity.code || entity.entity_name,
        label: entity.entity_name,
        entityType: "issuer",
        entityTypeLabel: "公司主体",
        code: entity.code || undefined,
        market: inferWatchTargetMarket(entity.full_code, entity.code),
      }
    case "industry":
      return {
        entityId: entity.entity_name,
        label: entity.entity_name,
        entityType: "industry",
        entityTypeLabel: "产业赛道",
      }
    case "institution":
      return {
        entityId: entity.entity_name,
        label: entity.entity_name,
        entityType: "institution",
        entityTypeLabel: "发布机构",
      }
    case "index":
      return {
        entityId: entity.full_code || entity.code || entity.entity_name,
        label: entity.entity_name,
        entityType: "market",
        entityTypeLabel: "影响市场",
        code: entity.code || undefined,
        market: inferWatchTargetMarket(entity.full_code, entity.code),
      }
    default:
      return {
        entityId: entity.entity_name,
        label: entity.entity_name,
        entityType: "topic",
        entityTypeLabel: "主题标签",
      }
  }
}

function buildEventRow(sourceId: SourceID, raw: RawItemRow): {
  eventRow: EventRow
  facts: ReturnType<typeof extractEventFacts>
  payload: NewsItem
  resolved: ResolvedEventClassification
} {
  const payload = JSON.parse(raw.payload_json) as NewsItem
  const summary = payload.extra?.hover ? stripHtml(payload.extra.hover) : null
  const resolved = resolveEventClassification(sourceId, raw.title, summary)
  const identityHints = buildEventIdentityHints({
    sourceId,
    sourceKind: resolved.profile?.sourceKind,
    eventSubType: resolved.eventSubType,
    raw,
    payload,
  })
  const seriesMetadata = derivePeriodicSeriesMetadata({
    sourceId,
    sourceKind: resolved.profile?.sourceKind,
    eventSubType: resolved.eventSubType,
    raw,
    payload,
  })
  const identity = buildEventIdentity({
    eventType: resolved.eventType,
    eventSubType: resolved.eventSubType,
    sourceKind: resolved.profile?.sourceKind,
    title: raw.title,
    primaryEntityName: resolved.primaryEntityName,
    publishedAt: raw.published_at ?? undefined,
    identityHints,
  })
  const facts = extractEventFacts({
    eventId: identity.eventId,
    rawId: raw.raw_id,
    sourceId,
    raw,
    payload,
    resolved,
  })
  const impact = buildImpactSnapshot({
    eventType: resolved.eventType,
    eventSubType: resolved.eventSubType,
    profile: resolved.profile,
    publishedAt: raw.published_at ?? undefined,
    facts,
  })
  const now = Date.now()

  return {
    facts,
    payload,
    resolved,
    eventRow: {
      event_id: identity.eventId,
      cluster_key: identity.clusterKey,
      title: raw.title,
      summary,
      event_type: resolved.eventType,
      event_subtype: resolved.eventSubType,
      source_kind: resolved.profile?.sourceKind ?? null,
      published_at: raw.published_at,
      ingested_at: now,
      canonical_url: raw.url,
      primary_entity_name: resolved.primaryEntityName ?? null,
      series_key: seriesMetadata.seriesKey,
      period_key: seriesMetadata.periodKey,
      release_cadence: seriesMetadata.releaseCadence,
      importance: resolved.importance,
      sentiment: null,
      directional_view: impact.directionalView,
      directional_confidence: impact.directionalConfidence,
      materiality_score: impact.materialityScore,
      tradability_score: impact.tradabilityScore,
      authority_score: impact.authorityScore,
      freshness_score: impact.freshnessScore,
      surprise_score: impact.surpriseScore,
      affected_markets_json: JSON.stringify(impact.affectedMarkets),
      impact_summary_json: JSON.stringify(impact.impactSummary),
      topic_tags_json: JSON.stringify(resolved.topicTags),
      degraded: impact.degraded ? 1 : 0,
      last_seen_at: now,
      status: "active",
    },
  }
}

async function persistResolvedEvent(input: {
  eventTable: EventTableInstance
  sourceId: SourceID
  rawRow: RawItemRow
  rank: number
}) {
  return input.eventTable.withTransaction(async () => {
    const { eventRow, facts, payload, resolved } = buildEventRow(input.sourceId, input.rawRow)
    const topicTags = JSON.parse(eventRow.topic_tags_json)
    const affectedMarkets = JSON.parse(eventRow.affected_markets_json)
    const subjectResolution = await resolveEventSubjects({
      eventId: eventRow.event_id,
      title: input.rawRow.title,
      summary: eventRow.summary,
      eventType: resolved.eventType,
      eventSubType: resolved.eventSubType,
      sourceKind: resolved.profile?.sourceKind,
      topicTags,
      affectedMarkets,
      payload,
      primaryEntityNameHint: resolved.primaryEntityName,
    }, {
      roleExtractor: getLiveSubjectRoleExtractor(),
      extractionTimeoutMs: getLiveSubjectRoleExtractorTimeoutMs(),
    })
    const normalizedEntityLinks = normalizeEntityLinks(subjectResolution.entityLinks)
    const normalizedFacts = normalizeFactEntityIds(facts, normalizedEntityLinks)
    const watchTargetCandidates = await resolveWatchTargetCandidates({
      eventId: eventRow.event_id,
      title: input.rawRow.title,
      summary: eventRow.summary,
      eventType: resolved.eventType,
      eventSubType: resolved.eventSubType,
      sourceKind: resolved.profile?.sourceKind,
      topicTags,
      affectedMarkets,
      affectedEntities: normalizedEntityLinks.map(toWatchTargetEntityRef),
      impactSummary: JSON.parse(eventRow.impact_summary_json),
    }, {
      extractor: getLiveWatchTargetCandidateExtractor(),
      extractionTimeoutMs: getLiveWatchTargetCandidateExtractorTimeoutMs(),
      registryResolver: {
        resolveByName: resolveSecurityByName,
      },
    })
    eventRow.primary_entity_name = normalizePrimaryEntityName(
      subjectResolution.primaryEntityName ?? null,
      normalizedEntityLinks,
    )
    eventRow.watch_target_candidates_json = JSON.stringify(watchTargetCandidates)
    const previousEvent = await input.eventTable.getEventById(eventRow.event_id)
    const eventMetric = previousEvent ? EVENT_ENGINE_METRICS.eventUpdates : EVENT_ENGINE_METRICS.eventCreates
    const eventMetricLabels = toMetricLabels({
      source_id: input.sourceId,
      event_type: eventRow.event_type,
      event_subtype: eventRow.event_subtype,
    })
    incrementEventEngineMetric(eventMetric, eventMetricLabels)
    await input.eventTable.incrementMetric(eventMetric, eventMetricLabels)
    await input.eventTable.upsertEvent(eventRow)
    await input.eventTable.addEvidence({
      event_id: eventRow.event_id,
      raw_id: input.rawRow.raw_id,
      source_id: input.sourceId,
      source_item_id: input.rawRow.source_item_id,
      title: input.rawRow.title,
      summary: eventRow.summary,
      canonical_url: input.rawRow.url,
      published_at: input.rawRow.published_at,
      fetched_at: input.rawRow.fetched_at,
      source_priority: input.rank,
      authority_level: resolved.profile?.authorityLevel ?? null,
      parser_family: resolved.profile?.parserFamily ?? null,
      passthrough_payload_json: input.rawRow.payload_json,
      extraction_status: "ready",
      extraction_error: null,
      rank: input.rank,
    })
    await input.eventTable.upsertEventFacts(normalizedFacts)
    const extractorMetricLabels = toMetricLabels({
      source_id: input.sourceId,
      parser_family: resolved.profile?.parserFamily ?? "none",
      fact_count: normalizedFacts.length,
    })
    incrementEventEngineMetric(EVENT_ENGINE_METRICS.extractorSuccess, extractorMetricLabels)
    await input.eventTable.incrementMetric(EVENT_ENGINE_METRICS.extractorSuccess, extractorMetricLabels)
    await input.eventTable.upsertEntityLinks(normalizedEntityLinks)
    await consolidateEquivalentEvents({
      eventTable: input.eventTable,
      eventRow,
    })
    await addLifecycleEntry({
      eventTable: input.eventTable,
      previousEvent,
      nextEvent: eventRow,
      rawId: input.rawRow.raw_id,
      sourceId: input.sourceId,
      subjectResolutionAudit: subjectResolution.audit,
    })

    return {
      eventRow,
      resolved,
      facts: normalizedFacts,
    }
  })
}

function hasMeaningfulEventChange(previous: EventRow, next: EventRow) {
  return previous.title !== next.title
    || previous.summary !== next.summary
    || previous.event_type !== next.event_type
    || previous.event_subtype !== next.event_subtype
    || previous.primary_entity_name !== next.primary_entity_name
    || previous.directional_view !== next.directional_view
    || previous.directional_confidence !== next.directional_confidence
    || previous.materiality_score !== next.materiality_score
    || previous.tradability_score !== next.tradability_score
    || previous.authority_score !== next.authority_score
    || previous.freshness_score !== next.freshness_score
    || previous.surprise_score !== next.surprise_score
    || previous.affected_markets_json !== next.affected_markets_json
    || previous.impact_summary_json !== next.impact_summary_json
    || previous.topic_tags_json !== next.topic_tags_json
    || previous.degraded !== next.degraded
}

function summarizeChangedFields(previous: EventRow, next: EventRow) {
  const changed = new Set<string>()
  if (previous.title !== next.title || previous.summary !== next.summary)
    changed.add("标题与摘要")
  if (previous.event_type !== next.event_type || previous.event_subtype !== next.event_subtype)
    changed.add("事件分类")
  if (previous.primary_entity_name !== next.primary_entity_name)
    changed.add("核心主体")
  if (
    previous.directional_view !== next.directional_view
    || previous.directional_confidence !== next.directional_confidence
  ) {
    changed.add("方向判断")
  }
  if (
    previous.materiality_score !== next.materiality_score
    || previous.tradability_score !== next.tradability_score
    || previous.authority_score !== next.authority_score
    || previous.freshness_score !== next.freshness_score
    || previous.surprise_score !== next.surprise_score
  ) {
    changed.add("投资评分")
  }
  if (previous.affected_markets_json !== next.affected_markets_json)
    changed.add("影响市场")
  if (previous.impact_summary_json !== next.impact_summary_json)
    changed.add("投资解读")
  if (previous.topic_tags_json !== next.topic_tags_json)
    changed.add("赛道标签")
  if (previous.degraded !== next.degraded)
    changed.add("结构化完整度")
  return Array.from(changed)
}

async function addLifecycleEntry(input: {
  eventTable: EventTableInstance
  previousEvent?: EventRow
  nextEvent: EventRow
  rawId: string
  sourceId: SourceID
  subjectResolutionAudit?: {
    provider: "llm" | "deterministic"
    confidence: number
    timedOut: boolean
    usedFallback: boolean
  }
}) {
  if (!input.eventTable) return

  let stateTo: EventLifecycleState | undefined
  let stateFrom: EventLifecycleState | undefined
  let reason: string | undefined
  const latestTimeline = await input.eventTable.getLatestTimelineState(input.nextEvent.event_id)
  const entries: Array<{
    stateFrom?: EventLifecycleState
    stateTo: EventLifecycleState
    reason: string
    metadata?: Record<string, unknown>
  }> = []

  if (!input.previousEvent) {
    stateTo = "detected"
    reason = "new_event"
  } else if (hasMeaningfulEventChange(input.previousEvent, input.nextEvent)) {
    stateFrom = (latestTimeline.state as EventLifecycleState | undefined) ?? "detected"
    // Once an event has reached confirmed, later snapshot refreshes should keep that
    // lifecycle truth instead of repeatedly downgrading to updated and re-confirming.
    stateTo = stateFrom === "confirmed" ? "confirmed" : "updated"
    reason = "event_snapshot_changed"
  }

  if (stateTo && reason === "event_snapshot_changed" && input.previousEvent) {
    entries.push({
      stateFrom,
      stateTo,
      reason,
      metadata: {
        changedFields: summarizeChangedFields(input.previousEvent, input.nextEvent),
      },
    })
  } else if (stateTo && reason) {
    entries.push({
      stateFrom,
      stateTo,
      reason,
    })
  }

  const evidenceStats = await input.eventTable.getEventEvidenceStats(input.nextEvent.event_id)
  const currentOrNextState = entries.at(-1)?.stateTo ?? latestTimeline.state
  const authoritativeSourceKinds = new Set([
    "official_rate_fixing",
    "official_central_bank_operation",
    "exchange_disclosure",
    "official_macro_release",
  ])

  if (
    evidenceStats.authoritativeEvidenceCount >= 1
    && authoritativeSourceKinds.has(input.nextEvent.source_kind ?? "")
    && currentOrNextState !== "confirmed"
  ) {
    entries.push({
      stateFrom: (currentOrNextState as EventLifecycleState | undefined) ?? "detected",
      stateTo: "confirmed",
      reason: "authoritative_source_confirmation",
      metadata: {
        authoritativeEvidenceCount: evidenceStats.authoritativeEvidenceCount,
        sourceCount: evidenceStats.sourceCount,
        evidenceCount: evidenceStats.evidenceCount,
      },
    })
  } else if (evidenceStats.sourceCount >= 2 && currentOrNextState !== "confirmed") {
    entries.push({
      stateFrom: (currentOrNextState as EventLifecycleState | undefined) ?? "detected",
      stateTo: "confirmed",
      reason: "multi_source_confirmation",
      metadata: {
        sourceCount: evidenceStats.sourceCount,
        evidenceCount: evidenceStats.evidenceCount,
      },
    })
  }

  for (const entry of entries) {
    const changedAt = Date.now()
    await input.eventTable.addTimeline({
      timeline_id: `etl_${md5(`${input.nextEvent.event_id}|${input.rawId}|${entry.stateTo}|${changedAt}`)}`,
      event_id: input.nextEvent.event_id,
      state_from: entry.stateFrom ?? null,
      state_to: entry.stateTo,
      changed_at: changedAt,
      trigger_evidence_id: input.rawId,
      actor: "event-engine",
      reason: entry.reason,
      metadata_json: JSON.stringify({
        sourceId: input.sourceId,
        resolverVersion: EVENT_ENGINE_VERSIONS.resolver,
        sourceKind: input.nextEvent.source_kind,
        subjectResolutionProvider: input.subjectResolutionAudit?.provider,
        subjectResolutionConfidence: input.subjectResolutionAudit?.confidence,
        subjectResolutionTimedOut: input.subjectResolutionAudit?.timedOut,
        subjectResolutionUsedFallback: input.subjectResolutionAudit?.usedFallback,
        ...entry.metadata,
      }),
    })
  }
}

async function consolidateEquivalentEvents(input: {
  eventTable: EventTableInstance
  eventRow: EventRow
}) {
  if (!input.eventTable) return

  const duplicateIds = await input.eventTable.findEquivalentEventIds({
    canonicalUrl: input.eventRow.canonical_url,
    sourceKind: input.eventRow.source_kind,
    excludeEventId: input.eventRow.event_id,
  })

  for (const duplicateEventId of duplicateIds) {
    const labels = toMetricLabels({
      source_kind: input.eventRow.source_kind ?? "unknown",
      event_subtype: input.eventRow.event_subtype,
    })
    incrementEventEngineMetric(EVENT_ENGINE_METRICS.mergeCollisions, {
      source_kind: input.eventRow.source_kind ?? "unknown",
      event_subtype: input.eventRow.event_subtype,
    })
    await input.eventTable.incrementMetric(EVENT_ENGINE_METRICS.mergeCollisions, labels)
    await input.eventTable.mergeEventIntoCanonical({
      canonicalEventId: input.eventRow.event_id,
      duplicateEventId,
      reason: "canonical_identity_merge",
    })
  }
}

async function upsertSourceProfile(sourceId: SourceID, profile?: EventProfile) {
  if (!profile) return
  const eventTable = await getEventTable()
  if (!eventTable) return
  await eventTable.upsertEventSource({
    source_id: sourceId,
    source_kind: profile.sourceKind,
    authority_level: profile.authorityLevel,
    parser_family: profile.parserFamily,
    default_event_type: profile.defaultEventType,
    default_event_subtype: profile.defaultEventSubType ?? null,
    asset_classes_json: JSON.stringify(profile.assetClasses),
    markets_json: JSON.stringify(profile.markets),
    profile_json: JSON.stringify(profile),
    updated_at: Date.now(),
  })
}

export function getRequestedEventSourceIds(options?: {
  sourceIds?: SourceID[]
  replayRawIds?: string[]
}) {
  return [...new Set(resolveRequestedSourceSeedIds(options, getDefaultEventSourceIds())
    .filter((sourceId): sourceId is SourceID => Boolean(sources[sourceId] && getters[sourceId])))]
}

export async function ingestEventSources(options?: {
  sourceIds?: SourceID[]
  force?: boolean
  replaySince?: number
  replayLimit?: number
  replayRawIds?: string[]
}) {
  const eventTable = await getEventTable()
  if (!eventTable) {
    return {
      updatedAt: Date.now(),
      ingestedSources: [] as SourceID[],
      replayedRawItems: 0,
      removedEvents: 0,
    }
  }

  const sourceIds = getRequestedEventSourceIds(options)

  if (!sourceIds.length && !options?.replayRawIds?.length) {
    return {
      updatedAt: Date.now(),
      ingestedSources: [] as SourceID[],
      replayedRawItems: 0,
      removedEvents: 0,
    }
  }

  for (const sourceId of sourceIds) {
    validateSourceEventProfile(sourceId)
  }

  const lastFetchedMap = await eventTable.getLastFetchedAtBySourceIds(sourceIds)
  const now = Date.now()
  const staleSourceIds = options?.force
    ? sourceIds
    : sourceIds.filter((sourceId) => {
        const lastFetchedAt = lastFetchedMap[sourceId] ?? 0
        return now - lastFetchedAt >= (sources[sourceId]?.interval ?? 0)
      })

  const ingestedSources: SourceID[] = []
  for (const sourceId of staleSourceIds) {
    try {
      const profile = getSourceEventProfile(sourceId)
      await upsertSourceProfile(sourceId, profile)
      const items = (await getters[sourceId]()).slice(0, 50)
      const fetchedAt = Date.now()
      await eventTable.recordSourceFetchRun({
        source_id: sourceId,
        fetched_at: fetchedAt,
        status: "success",
        item_count: items.length,
      })
      let rank = 0
      for (const item of items) {
        try {
          const rawRow = toRawRow(sourceId, item, fetchedAt)
          await eventTable.upsertRawItem(rawRow)
          await persistResolvedEvent({
            eventTable,
            sourceId,
            rawRow,
            rank,
          })
        } catch (error) {
          const failureMetricLabels = toMetricLabels({
            source_id: sourceId,
            raw_id: String(item.id),
          })
          incrementEventEngineMetric(EVENT_ENGINE_METRICS.extractorFailure, failureMetricLabels)
          await eventTable.incrementMetric(EVENT_ENGINE_METRICS.extractorFailure, failureMetricLabels)
          logger.error(`failed to persist ${sourceId} event item`, error)
          workerLastError = error instanceof Error ? error.message : String(error)
        }
        rank += 1
      }
      ingestedSources.push(sourceId)
      logger.success(`ingest ${sourceId} events (${EVENT_ENGINE_VERSIONS.resolver})`)
    } catch (error) {
      await eventTable.recordSourceFetchRun({
        source_id: sourceId,
        fetched_at: Date.now(),
        status: "error",
        item_count: 0,
        error: error instanceof Error ? error.message : String(error),
      })
      const failureMetricLabels = toMetricLabels({
        source_id: sourceId,
      })
      incrementEventEngineMetric(EVENT_ENGINE_METRICS.extractorFailure, failureMetricLabels)
      await eventTable.incrementMetric(EVENT_ENGINE_METRICS.extractorFailure, failureMetricLabels)
      logger.error(`failed to ingest ${sourceId} events`, error)
      workerLastError = error instanceof Error ? error.message : String(error)
    }
  }

  let replayedRawItems = 0
  let removedEvents = 0
  if (options?.replaySince || options?.replayRawIds?.length) {
    const replayRes = await replayEventRawItems({
      sourceIds,
      since: options.replaySince,
      limit: options.replayLimit,
      rawIds: options.replayRawIds,
    })
    replayedRawItems = replayRes.replayed
    removedEvents = replayRes.removedEvents
  }

  return {
    updatedAt: Date.now(),
    ingestedSources,
    replayedRawItems,
    removedEvents,
  }
}

export async function replayEventRawItems(options: {
  sourceIds?: SourceID[]
  since?: number
  limit?: number
  rawIds?: string[]
}) {
  const eventTable = await getEventTable()
  if (!eventTable) return { replayed: 0, removedEvents: 0 }

  const rawItems = options.rawIds?.length
    ? await eventTable.getRawItemsByIds(options.rawIds)
    : await eventTable.listRawItems({
      sourceIds: options.sourceIds,
      since: options.since,
      limit: options.limit ?? 500,
    })

  let replayed = 0
  let removedEvents = 0
  for (const rawRow of rawItems.reverse()) {
    const hydratedRawRow = await hydrateClsRawItem(rawRow)
    if (hydratedRawRow.payload_json !== rawRow.payload_json || hydratedRawRow.mobile_url !== rawRow.mobile_url || hydratedRawRow.fetched_at !== rawRow.fetched_at) {
      await eventTable.upsertRawItem(hydratedRawRow)
    }
    const replayMetricLabels = toMetricLabels({
      source_id: hydratedRawRow.source_id,
      replay_mode: options.rawIds?.length ? "raw_id" : "window",
    })
    const oldEventIds = await eventTable.getEventIdsByRawId(hydratedRawRow.raw_id)
    await eventTable.deleteEvidenceByRawId(hydratedRawRow.raw_id)
    await eventTable.deleteFactsByEvidenceId(hydratedRawRow.raw_id)
    await persistResolvedEvent({
      eventTable,
      sourceId: hydratedRawRow.source_id,
      rawRow: hydratedRawRow,
      rank: 0,
    })

    for (const oldEventId of oldEventIds) {
      if (await eventTable.deleteEventIfOrphan(oldEventId)) {
        removedEvents += 1
        incrementEventEngineMetric(EVENT_ENGINE_METRICS.replayRemovedEvents, replayMetricLabels)
        await eventTable.incrementMetric(EVENT_ENGINE_METRICS.replayRemovedEvents, replayMetricLabels)
      }
    }
    replayed += 1
    incrementEventEngineMetric(EVENT_ENGINE_METRICS.replayedRawItems, replayMetricLabels)
    await eventTable.incrementMetric(EVENT_ENGINE_METRICS.replayedRawItems, replayMetricLabels)
  }

  return {
    replayed,
    removedEvents,
  }
}

export function resolveBackfillSince(hours?: number) {
  const normalized = Number.isFinite(hours) && (hours ?? 0) > 0
    ? Math.min(Math.floor(hours as number), BACKFILL_MAX_HOURS)
    : BACKFILL_MAX_HOURS
  return {
    hours: normalized,
    since: Date.now() - normalized * 60 * 60 * 1000,
  }
}

export async function backfillEventHistory(options?: {
  sourceIds?: SourceID[]
  hours?: number
  limit?: number
}) {
  const { hours, since } = resolveBackfillSince(options?.hours)
  const replayRes = await replayEventRawItems({
    sourceIds: options?.sourceIds,
    since,
    limit: options?.limit ?? 5000,
  })

  const labels = toMetricLabels({
    mode: "historical",
    window_hours: hours,
  })
  incrementEventEngineMetric(EVENT_ENGINE_METRICS.backfillRuns, labels)
  incrementEventEngineMetric(EVENT_ENGINE_METRICS.backfilledRawItems, labels, replayRes.replayed)
  const eventTable = await getEventTable()
  await eventTable?.incrementMetric(EVENT_ENGINE_METRICS.backfillRuns, labels)
  await eventTable?.incrementMetric(EVENT_ENGINE_METRICS.backfilledRawItems, labels, replayRes.replayed)

  return {
    replayedRawItems: replayRes.replayed,
    removedEvents: replayRes.removedEvents,
    effectiveHours: hours,
    effectiveSince: since,
    versions: EVENT_ENGINE_VERSIONS,
  }
}

async function runWorkerTick() {
  if (workerRunning) return
  workerRunning = true
  try {
    const res = await ingestEventSources()
    workerLastRunAt = res.updatedAt
    workerLastError = ""
  } catch (error: unknown) {
    workerLastError = error instanceof Error ? error.message : String(error)
    logger.error("event-engine worker tick failed", error)
  } finally {
    workerRunning = false
  }
}

export function ensureEventEngineWorkerStarted() {
  if (!WORKER_ENABLED || workerStarted) return workerStarted
  if (process.env.CF_PAGES || process.env.VERCEL) {
    logger.info("skip event-engine worker in edge environment")
    return false
  }

  workerStarted = true
  const start = () => {
    void runWorkerTick()
    setInterval(() => {
      void runWorkerTick()
    }, WORKER_INTERVAL_MS)
  }

  setTimeout(start, 1000)
  logger.success(`event-engine worker started, interval=${WORKER_INTERVAL_MS}ms`)
  return true
}

export function getEventEngineWorkerStatus() {
  return {
    enabled: WORKER_ENABLED,
    started: workerStarted,
    running: workerRunning,
    intervalMs: WORKER_INTERVAL_MS,
    lastRunAt: workerLastRunAt || undefined,
    lastError: workerLastError || undefined,
  }
}
