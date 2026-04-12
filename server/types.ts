import type { DirectionalView, EventSourceKind } from "@shared/event-profile"
import type { EventEntityType, EventImportance, EventLifecycleState, EventSentiment, EventSubType, EventType, NewsItem, SourceID } from "@shared/types"

export interface RSSInfo {
  title: string
  description: string
  link: string
  image: string
  updatedTime: string
  items: RSSItem[]
}
export interface RSSItem {
  title: string
  description: string
  link: string
  created?: string
}

export interface CacheInfo {
  id: SourceID
  items: NewsItem[]
  updated: number
}

export interface CacheRow {
  id: SourceID
  data: string
  updated: number
}

export interface RawItemRow {
  raw_id: string
  source_id: SourceID
  source_item_id: string
  title: string
  url: string
  mobile_url: string | null
  published_at: number | null
  fetched_at: number
  fingerprint: string
  payload_json: string
  status: string
}

export interface EventRow {
  event_id: string
  cluster_key: string
  title: string
  summary: string | null
  event_type: EventType
  event_subtype: EventSubType
  source_kind: EventSourceKind | null
  published_at: number | null
  ingested_at: number
  canonical_url: string | null
  primary_entity_name: string | null
  importance: EventImportance
  sentiment: EventSentiment | null
  directional_view: DirectionalView | null
  directional_confidence: number | null
  materiality_score: number | null
  tradability_score: number | null
  authority_score: number | null
  freshness_score: number | null
  surprise_score: number | null
  affected_markets_json: string
  impact_summary_json: string
  degraded: number
  topic_tags_json: string
  last_seen_at: number
  status: string
}

export interface EventEvidenceRow {
  event_id: string
  raw_id: string
  source_id: SourceID
  source_item_id: string
  title: string
  summary: string | null
  canonical_url: string
  published_at: number | null
  fetched_at: number
  source_priority: number
  authority_level: string | null
  parser_family: string | null
  passthrough_payload_json: string
  extraction_status: string | null
  extraction_error: string | null
  rank: number
}

export interface EntityLinkRow {
  event_id: string
  entity_type: EventEntityType
  entity_name: string
  code: string
  full_code: string
  confidence: number
  resolver: string
}

export interface EventSourceRow {
  source_id: SourceID
  source_kind: EventSourceKind
  authority_level: string
  parser_family: string
  default_event_type: string
  default_event_subtype: string | null
  asset_classes_json: string
  markets_json: string
  profile_json: string
  updated_at: number
}

export interface EventFactRow {
  fact_id: string
  event_id: string
  evidence_id: string | null
  fact_type: string
  metric_name: string
  value: string | null
  unit: string | null
  previous_value: string | null
  delta: string | null
  direction: string | null
  effective_at: number | null
  entity_id: string | null
  confidence: number
  payload_json: string
}

export interface EventTimelineRow {
  timeline_id: string
  event_id: string
  state_from: EventLifecycleState | null
  state_to: EventLifecycleState
  changed_at: number
  trigger_evidence_id: string | null
  actor: string | null
  reason: string | null
  metadata_json: string
}

export interface WatchlistRow {
  watchlist_id: string
  name: string
  description: string | null
  query_json: string
  created_at: number
  updated_at: number
  last_checked_at: number | null
}

export interface RSSHubInfo {
  title: string
  home_page_url: string
  description: string
  items: RSSHubItem[]
}

export interface RSSHubItem {
  id: string
  url: string
  title: string
  content_html: string
  date_published: string
}

export interface UserInfo {
  id: string
  email: string
  type: "github"
  data: string
  created: number
  updated: number
}

export interface RSSHubOption {
  // default: true
  sorted?: boolean
  // default: 20
  limit?: number
}

export interface SourceOption {
  // default: false
  hiddenDate?: boolean
}

export type SourceGetter = () => Promise<NewsItem[]>
