import type {
  EventRecord,
  InvestmentEntityRef,
  InvestmentEventBrief,
  InvestmentEventDetail,
  InvestmentEventEvidence,
  InvestmentEventFact,
  InvestmentWatchTargetCandidate,
  InvestmentWatchlistDetail,
  InvestmentRelatedEventsSection,
  InvestmentTimelineEntry,
  WatchlistDetail,
} from "@shared/types"
import { projectInvestmentEventBrief } from "#/services/event-engine/investment-view"

export interface McpInvestmentEntityRef extends InvestmentEntityRef {}
export interface McpInvestmentWatchTargetCandidate extends InvestmentWatchTargetCandidate {}

export interface McpInvestmentEventFact {
  label: string
  metricName?: string
  value?: string | number | boolean | null
  previousValue?: string | number | boolean | null
  delta?: string | number | null
  unit?: string | null
  direction?: "up" | "down" | "flat" | "unknown" | null
  directionLabel?: string | null
  effectiveAt?: number | null
  confidence: number
  entity?: McpInvestmentEntityRef | null
  debug?: {
    factType: string
    evidenceId?: string | null
  }
}

export interface McpInvestmentEventEvidence {
  sourceId: string
  sourceName: string
  sourceTitle?: string
  authorityLevel: string
  authorityLabel: string
  title: string
  summary?: string
  url?: string
  publishedAt?: number
  extractionStatusLabel: string
  debug?: {
    evidenceId: string
    extractionStatus: string
    sourceKind?: string
  }
}

export interface McpInvestmentTimelineEntry {
  changedAt: number
  state: string
  label: string
  note?: string
  sourceName?: string
  debug?: {
    timelineId: string
  }
}

export interface McpInvestmentScoreInsight {
  band: string
  note: string
}

export interface McpInvestmentEventBrief {
  eventId: string
  title: string
  eventFamily: InvestmentEventBrief["eventFamily"]
  eventFamilyLabel: string
  actionBucket: InvestmentEventBrief["actionBucket"]
  actionLabel: string
  actionReason: string
  whatHappened: string
  whoIsAffected: string[]
  signalDirection: InvestmentEventBrief["signalDirection"]
  signalDirectionLabel: string
  signalConfidence: number
  signalConfidenceInsight: McpInvestmentScoreInsight
  materialityScore: number
  materialityInsight: McpInvestmentScoreInsight
  tradabilityScore: number
  tradabilityInsight: McpInvestmentScoreInsight
  authorityScore: number
  authorityInsight: McpInvestmentScoreInsight
  affectedMarkets: InvestmentEventBrief["affectedMarkets"]
  affectedMarketLabels: string[]
  affectedEntities: McpInvestmentEntityRef[]
  primarySubject?: McpInvestmentEntityRef
  subjectSummary: string
  publisherInstitution?: string
  whyItMatters: string
  tradableNow: InvestmentEventBrief["tradableNow"]
  tradableNowLabel: string
  whatToWatchNext: string[]
  riskOfMisread: string[]
  latestLifecycleState?: InvestmentEventBrief["latestLifecycleState"]
  latestLifecycleAt?: number
  seriesKey?: string
  periodKey?: string
  releaseCadence?: string
  seriesSummary?: string
  canonicalUrl?: string
  relatedTopics: InvestmentEventBrief["relatedTopics"]
  sourceSummary: {
    primarySourceId?: string
    primarySourceName?: string
    debug?: {
      sourceKinds: string[]
    }
  }
  publishedAt?: number
}

export interface McpInvestmentRelatedEventsSection {
  context: string
  label: string
  displayLabel: string
  items: McpInvestmentEventBrief[]
}

export interface McpInvestmentEventDetail extends McpInvestmentEventBrief {
  thesis: string
  keyFacts: McpInvestmentEventFact[]
  evidence: McpInvestmentEventEvidence[]
  timelineSummary: McpInvestmentTimelineEntry[]
  watchTargetCandidates: McpInvestmentWatchTargetCandidate[]
  relatedEvents?: McpInvestmentRelatedEventsSection[]
}

export interface McpWatchlistDetail {
  watchlistId: string
  name: string
  description?: string
  query: WatchlistDetail["query"]
  recentEvents: McpInvestmentEventBrief[]
}

function toMcpFact(fact: InvestmentEventFact, debug = false): McpInvestmentEventFact {
  return {
    label: fact.label,
    metricName: fact.metricName,
    value: fact.value,
    previousValue: fact.previousValue,
    delta: fact.delta,
    unit: fact.unit,
    direction: fact.direction,
    directionLabel: fact.directionLabel,
    effectiveAt: fact.effectiveAt,
    confidence: fact.confidence,
    entity: fact.entity ?? undefined,
    debug: debug
      ? {
          factType: fact.factType,
          evidenceId: fact.evidenceId,
        }
      : undefined,
  }
}

function toMcpEvidence(evidence: InvestmentEventEvidence, debug = false): McpInvestmentEventEvidence {
  return {
    sourceId: evidence.sourceId,
    sourceName: evidence.sourceName,
    sourceTitle: evidence.sourceTitle,
    authorityLevel: evidence.authorityLevel,
    authorityLabel: evidence.authorityLabel,
    title: evidence.title,
    summary: evidence.summary,
    url: evidence.url,
    publishedAt: evidence.publishedAt,
    extractionStatusLabel: evidence.extractionStatusLabel,
    debug: debug
      ? {
          evidenceId: evidence.evidenceId,
          extractionStatus: evidence.extractionStatus,
          sourceKind: evidence.sourceKind,
        }
      : undefined,
  }
}

function toMcpTimeline(item: InvestmentTimelineEntry, debug = false): McpInvestmentTimelineEntry {
  return {
    changedAt: item.changedAt,
    state: item.state,
    label: item.label,
    note: item.note,
    sourceName: item.sourceName,
    debug: debug
      ? {
          timelineId: item.timelineId,
        }
      : undefined,
  }
}

function formatReleaseCadenceLabel(value?: string) {
  switch (value) {
    case "daily":
      return "日度序列"
    case "weekly":
      return "周度序列"
    case "monthly":
      return "月度序列"
    case "quarterly":
      return "季度序列"
    case "yearly":
      return "年度序列"
    default:
      return value ? "持续跟踪序列" : undefined
  }
}

function getSeriesSummary(item: Pick<InvestmentEventBrief, "periodKey" | "releaseCadence" | "seriesKey">) {
  if (!item.seriesKey && !item.periodKey && !item.releaseCadence) return undefined
  const cadenceLabel = formatReleaseCadenceLabel(item.releaseCadence)
  if (cadenceLabel && item.periodKey) return `${cadenceLabel}，当前期次：${item.periodKey}`
  if (cadenceLabel) return cadenceLabel
  if (item.periodKey) return `当前期次：${item.periodKey}`
  return "持续跟踪序列"
}

export function toMcpEventBrief(item: InvestmentEventBrief, debug = false): McpInvestmentEventBrief {
  return {
    eventId: item.eventId,
    title: item.title,
    eventFamily: item.eventFamily,
    eventFamilyLabel: item.eventFamilyLabel,
    actionBucket: item.actionBucket,
    actionLabel: item.actionLabel,
    actionReason: item.actionReason,
    whatHappened: item.whatHappened,
    whoIsAffected: item.whoIsAffected,
    signalDirection: item.signalDirection,
    signalDirectionLabel: item.signalDirectionLabel,
    signalConfidence: item.signalConfidence,
    signalConfidenceInsight: item.signalConfidenceInsight,
    materialityScore: item.materialityScore,
    materialityInsight: item.materialityInsight,
    tradabilityScore: item.tradabilityScore,
    tradabilityInsight: item.tradabilityInsight,
    authorityScore: item.authorityScore,
    authorityInsight: item.authorityInsight,
    affectedMarkets: item.affectedMarkets,
    affectedMarketLabels: item.affectedMarketLabels,
    affectedEntities: item.affectedEntities,
    primarySubject: item.primarySubject,
    subjectSummary: item.subjectSummary,
    publisherInstitution: item.publisherInstitution,
    whyItMatters: item.whyItMatters,
    tradableNow: item.tradableNow,
    tradableNowLabel: item.tradableNowLabel,
    whatToWatchNext: item.whatToWatchNext,
    riskOfMisread: item.riskOfMisread,
    latestLifecycleState: item.latestLifecycleState,
    latestLifecycleAt: item.latestLifecycleAt,
    seriesKey: item.seriesKey,
    periodKey: item.periodKey,
    releaseCadence: item.releaseCadence,
    seriesSummary: getSeriesSummary(item),
    canonicalUrl: item.canonicalUrl,
    relatedTopics: item.relatedTopics,
    sourceSummary: {
      primarySourceId: item.sourceSummary.primarySourceId,
      primarySourceName: item.sourceSummary.primarySourceName,
      debug: debug
        ? {
            sourceKinds: item.sourceSummary.sourceKinds,
          }
        : undefined,
    },
    publishedAt: item.publishedAt,
  }
}

function toMcpRelatedSection(section: InvestmentRelatedEventsSection, debug = false): McpInvestmentRelatedEventsSection {
  return {
    context: section.context,
    label: section.label,
    displayLabel: section.displayLabel,
    items: section.items.map(item => toMcpEventBrief(item, debug)),
  }
}

export function toMcpEventDetail(item: InvestmentEventDetail, debug = false): McpInvestmentEventDetail {
  return {
    ...toMcpEventBrief(item, debug),
    thesis: item.thesis,
    keyFacts: item.keyFacts.map(fact => toMcpFact(fact, debug)),
    evidence: item.evidence.map(evidence => toMcpEvidence(evidence, debug)),
    timelineSummary: item.timelineSummary.map(entry => toMcpTimeline(entry, debug)),
    watchTargetCandidates: item.watchTargetCandidates,
    relatedEvents: item.relatedEvents?.map(section => toMcpRelatedSection(section, debug)),
  }
}

function toProjectedBrief(item: InvestmentEventBrief | EventRecord, debug = false): McpInvestmentEventBrief {
  const brief = "eventFamily" in item ? item : projectInvestmentEventBrief(item)
  return toMcpEventBrief(brief, debug)
}

export function toMcpWatchlistDetail(item: WatchlistDetail | InvestmentWatchlistDetail, debug = false): McpWatchlistDetail {
  return {
    watchlistId: item.watchlistId,
    name: item.name,
    description: item.description,
    query: item.query,
    recentEvents: item.recentEvents.map(event => toProjectedBrief(event, debug)),
  }
}
