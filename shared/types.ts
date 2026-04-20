import type { colors } from "unocss/preset-mini"
import type { AffectedMarket, DirectionalView, EventProfile, EventSourceKind } from "./event-profile"
import type { IndustryTag } from "./industry"
import type { columns, fixedColumnIds } from "./metadata"
import type { originSources } from "./pre-sources"

export type Color = "primary" | Exclude<keyof typeof colors, "current" | "inherit" | "transparent" | "black" | "white">

type ConstSources = typeof originSources
type MainSourceID = keyof(ConstSources)

export type SourceID = {
  [Key in MainSourceID]: ConstSources[Key] extends { disable?: true } ? never :
    ConstSources[Key] extends { sub?: infer SubSource } ? {
    // @ts-expect-error >_<
      [SubKey in keyof SubSource]: SubSource[SubKey] extends { disable?: true } ? never : `${Key}-${SubKey}`
    }[keyof SubSource] | Key : Key;
}[MainSourceID]

export type AllSourceID = {
  [Key in MainSourceID]: ConstSources[Key] extends { sub?: infer SubSource } ? keyof {
    // @ts-expect-error >_<
    [SubKey in keyof SubSource as `${Key}-${SubKey}`]: never
  } | Key : Key
}[MainSourceID]

// export type DisabledSourceID = Exclude<SourceID, MainSourceID>

export type ColumnID = keyof typeof columns
export type Metadata = Record<ColumnID, Column>

export interface PrimitiveMetadata {
  updatedTime: number
  data: Record<FixedColumnID, SourceID[]>
  action: "init" | "manual" | "sync"
}

export type FixedColumnID = (typeof fixedColumnIds)[number]
export type HiddenColumnID = Exclude<ColumnID, FixedColumnID>
export type SourceColumnID = Exclude<ColumnID, "focus" | "hottest" | "realtime">

export interface OriginSource extends Partial<Omit<Source, "name" | "redirect">> {
  name: string
  sub?: Record<string, {
    /**
     * Subtitle 小标题
     */
    title: string
    // type?: "hottest" | "realtime"
    // desc?: string
    // column?: ManualColumnID
    // color?: Color
    // home?: string
    // disable?: boolean
    // interval?: number
  } & Partial<Omit<Source, "title" | "name" | "redirect">>>
}

export interface Source {
  name: string
  /**
   * 刷新的间隔时间
   */
  interval: number
  color: Color

  /**
   * Subtitle 小标题
   */
  title?: string
  desc?: string
  /**
   * Default normal timeline
   */
  type?: "hottest" | "realtime"
  column?: SourceColumnID
  home?: string
  tags?: IndustryTag[]
  eventProfile?: EventProfile
  /**
   * @default false
   */
  disable?: boolean | "cf"
  redirect?: SourceID
}

export interface Column {
  name: string
  sources: SourceID[]
}

export interface NewsItem {
  id: string | number // unique
  title: string
  url: string
  mobileUrl?: string
  pubDate?: number | string
  extra?: {
    hover?: string
    date?: number | string
    info?: false | string
    diff?: number
    raw?: unknown
    icon?: false | string | {
      url: string
      scale: number
    }
  }
}

export interface SourceResponse {
  status: "success" | "cache"
  id: SourceID
  updatedTime: number | string
  items: NewsItem[]
}

export type EventType = "news" | "announcement" | "policy" | "macro" | "industry" | "market_move"
export type EventSubType =
  | "other"
  | "analysis_signal"
  | "rate_fixing"
  | "earnings"
  | "financing"
  | "contract"
  | "shareholding_change"
  | "management_change"
  | "regulation"
  | "listing_status"
  | "buyback"
  | "dividend"
  | "monetary_policy"
  | "trade_policy"
  | "industrial_policy"
  | "macro_data"
  | "industry_data"
  | "industry_report"
  | "industry_news"
export type EventImportance = "low" | "medium" | "high"
export type EventSentiment = "positive" | "negative" | "neutral"
export type EventEntityType = "stock" | "index" | "industry" | "company" | "topic" | "institution"
export type EventLifecycleState = "detected" | "updated" | "confirmed" | "resolved"
export type InvestmentEventFamily =
  | "rates_liquidity"
  | "macro_print"
  | "policy"
  | "policy_signal"
  | "media_interpretation"
  | "earnings"
  | "financing"
  | "corporate_action"
  | "disclosure_signal"
  | "trading_status"
  | "industry_data"
  | "industry_report"
  | "industry_news"
  | "rumor_clarification"
  | "market_move"
  | "general_news"

export type InvestmentActionBucket = "actionable" | "watch" | "noise"

export interface EventRecord {
  eventId: string
  title: string
  summary?: string
  eventType: EventType
  eventSubType: EventSubType
  sourceKind?: EventSourceKind
  publishedAt?: number
  ingestedAt: number
  canonicalUrl?: string
  primaryEntityName?: string
  seriesKey?: string
  periodKey?: string
  releaseCadence?: string
  importance: EventImportance
  sentiment?: EventSentiment
  directionalView?: DirectionalView
  directionalConfidence?: number
  materialityScore?: number
  tradabilityScore?: number
  authorityScore?: number
  freshnessScore?: number
  surpriseScore?: number
  affectedMarkets: AffectedMarket[]
  impactSummary?: string[]
  degraded?: boolean
  latestLifecycleState?: EventLifecycleState
  latestLifecycleAt?: number
  topicTags: IndustryTag[]
  evidenceCount: number
  sourceIds: SourceID[]
}

export interface EventEvidence {
  eventId: string
  rawId: string
  sourceId: SourceID
  sourceItemId?: string
  sourceName?: string
  sourceTitle?: string
  title: string
  url: string
  mobileUrl?: string
  summary?: string
  publishedAt?: number
  fetchedAt?: number
  sourcePriority?: number
  authorityLevel?: string
  parserFamily?: string
  extractionStatus?: string
  extractionError?: string
}

export interface EventFact {
  factId: string
  eventId: string
  evidenceId?: string
  factType: string
  metricName: string
  value?: string
  unit?: string
  previousValue?: string
  delta?: string
  direction?: string
  effectiveAt?: number
  entityId?: string
  confidence: number
  payload?: Record<string, unknown>
}

export interface EventEvidenceCandidate {
  sourceId: SourceID
  eventType: EventType
  eventSubType: EventSubType
  sourceKind?: EventSourceKind
  title: string
  summary?: string
  canonicalUrl: string
  publishedAt?: number
  primaryEntityName?: string
  topicTags: IndustryTag[]
  affectedMarkets: AffectedMarket[]
  degraded?: boolean
}

export interface WatchlistQuery {
  entities?: string[]
  topics?: string[]
  eventTypes?: EventType[]
  eventSubTypes?: EventSubType[]
  sourceIds?: SourceID[]
  markets?: AffectedMarket[]
  directionalViews?: DirectionalView[]
  minMaterialityScore?: number
  minAuthorityScore?: number
}

export interface WatchlistRecord {
  watchlistId: string
  name: string
  description?: string
  query: WatchlistQuery
  createdAt: number
  updatedAt: number
  lastCheckedAt?: number
}

export interface WatchlistDetail extends WatchlistRecord {
  recentEvents: EventRecord[]
}

export interface InvestmentWatchlistDetail extends WatchlistRecord {
  recentEvents: InvestmentEventBrief[]
}

export interface EventEntityLink {
  eventId: string
  entityType: EventEntityType
  entityName: string
  code?: string
  fullCode?: string
  confidence: number
  resolver: string
}

export interface EventTimelineEntry {
  timelineId: string
  eventId: string
  stateFrom?: EventLifecycleState
  stateTo: EventLifecycleState
  changedAt: number
  triggerEvidenceId?: string
  actor?: string
  reason?: string
  metadata?: Record<string, unknown>
}

export interface EventDetail extends EventRecord {
  evidences: EventEvidence[]
  entities: EventEntityLink[]
  facts: EventFact[]
  timeline: EventTimelineEntry[]
  watchTargetCandidates?: InvestmentWatchTargetCandidate[]
}

export interface EventListResponse {
  status: "success"
  updatedTime: number
  items: EventRecord[]
}

export interface InvestmentEntityRef {
  entityId: string
  label: string
  entityType: "security" | "issuer" | "market" | "industry" | "topic" | "institution"
  entityTypeLabel: string
  code?: string
  market?: string
}

export interface InvestmentWatchTargetCandidate {
  entity: InvestmentEntityRef
  reason: string
  confidence: number
  source: "industry-watch-registry" | "llm-registry"
  matchedBy: "industry_entity" | "topic_tag" | "llm_hypothesis"
}

export interface InvestmentEventFact {
  factType: string
  label: string
  metricName?: string
  summary?: string
  valueLabel?: string
  previousValueLabel?: string
  deltaLabel?: string
  value?: string | number | boolean | null
  previousValue?: string | number | boolean | null
  delta?: string | number | null
  unit?: string | null
  direction?: "up" | "down" | "flat" | "unknown" | null
  directionLabel?: string | null
  effectiveAt?: number | null
  confidence: number
  entity?: InvestmentEntityRef | null
  evidenceId?: string | null
}

export interface InvestmentEventEvidence {
  evidenceId: string
  sourceId: SourceID
  sourceName: string
  sourceTitle?: string
  authorityLevel: string
  authorityLabel: string
  sourceKind?: EventSourceKind
  title: string
  summary?: string
  url?: string
  publishedAt?: number
  extractionStatus: "ready" | "degraded" | "legacy" | "failed"
  extractionStatusLabel: string
}

export interface InvestmentTimelineEntry {
  timelineId: string
  changedAt: number
  state: EventLifecycleState
  label: string
  note?: string
  sourceName?: string
  relatedEventId?: string
  relatedEventTitle?: string
  relatedEventUrl?: string
}

export interface InvestmentScoreInsight {
  band: string
  note: string
}

export interface InvestmentEventBrief {
  eventId: string
  title: string
  summary?: string
  eventType?: EventType
  sourceKind?: EventSourceKind
  ingestedAt?: number
  eventFamily: InvestmentEventFamily
  eventFamilyLabel: string
  actionBucket: InvestmentActionBucket
  actionLabel: string
  actionReason: string
  whatHappened: string
  whoIsAffected: string[]
  signalDirection: DirectionalView
  signalDirectionLabel: string
  signalConfidence: number
  signalConfidenceInsight: InvestmentScoreInsight
  materialityScore: number
  materialityInsight: InvestmentScoreInsight
  tradabilityScore: number
  tradabilityInsight: InvestmentScoreInsight
  authorityScore: number
  authorityInsight: InvestmentScoreInsight
  affectedMarkets: AffectedMarket[]
  affectedMarketLabels: string[]
  affectedEntities: InvestmentEntityRef[]
  primarySubject?: InvestmentEntityRef
  subjectSummary: string
  publisherInstitution?: string
  whyItMatters: string
  tradableNow: "yes" | "watch" | "no"
  tradableNowLabel: string
  whatToWatchNext: string[]
  riskOfMisread: string[]
  latestLifecycleState?: EventLifecycleState
  latestLifecycleAt?: number
  seriesKey?: string
  periodKey?: string
  releaseCadence?: string
  canonicalUrl?: string
  relatedTopics: IndustryTag[]
  sourceSummary: {
    primarySourceId?: SourceID
    primarySourceName?: string
    sourceKinds: EventSourceKind[]
  }
  publishedAt?: number
}

export interface InvestmentEventDetail extends InvestmentEventBrief {
  thesis: string
  keyFacts: InvestmentEventFact[]
  evidence: InvestmentEventEvidence[]
  timelineSummary: InvestmentTimelineEntry[]
  watchTargetCandidates: InvestmentWatchTargetCandidate[]
  relatedEvents?: InvestmentRelatedEventsSection[]
}

export interface InvestmentEventListResponse {
  status: "success"
  updatedTime: number
  items: InvestmentEventBrief[]
  totalCount?: number
  displayedCount?: number
  hasMore?: boolean
}

export interface InvestmentProviderMeta {
  version: "investment-provider-v1"
  projection: "investment"
  surface: "event_list" | "event_detail" | "watchlist_events" | "watchlist_detail"
}

export interface InvestmentProviderEventListResponse extends InvestmentEventListResponse {
  contract: InvestmentProviderMeta
}

export interface InvestmentProviderEventDetailResponse {
  status: "success"
  contract: InvestmentProviderMeta
  item: InvestmentEventDetail
}

export interface InvestmentProviderWatchlistDetailResponse {
  status: "success"
  updatedTime: number
  contract: InvestmentProviderMeta
  item: InvestmentWatchlistDetail
}

export interface InvestmentRelatedEventsSection {
  context: "entity" | "topic" | "market" | "family"
  label: string
  displayLabel: string
  items: InvestmentEventBrief[]
}
