export type EventProfileEventType = "news" | "announcement" | "policy" | "macro" | "industry" | "market_move"

export type EventSourceKind =
  | "official_policy_notice"
  | "official_macro_release"
  | "official_rate_fixing"
  | "official_central_bank_operation"
  | "exchange_disclosure"
  | "industry_stat_release"
  | "industry_report_release"
  | "industry_news_feed"
  | "industry_policy_notice"
  | "media_fast_feed"
  | "media_analysis"

export type EventSourceAuthorityLevel = "official" | "exchange" | "association" | "media"

export type EventParserFamily =
  | "policy"
  | "macro_rate"
  | "macro_release"
  | "central_bank_operation"
  | "exchange_announcement"
  | "industry_stat"
  | "industry_report"
  | "industry_news"
  | "media_fast"

export type AssetClass = "equity" | "rates" | "fx" | "commodity" | "credit" | "fund"

export type AffectedMarket = "A" | "HK" | "CN_rates" | "CN_macro" | "global_macro"

export type DirectionalView = "positive" | "negative" | "neutral" | "mixed" | "unknown"

export interface EventProfile {
  sourceKind: EventSourceKind
  defaultEventType: EventProfileEventType
  defaultEventSubType?: string
  authorityLevel: EventSourceAuthorityLevel
  parserFamily: EventParserFamily
  assetClasses: readonly AssetClass[]
  markets: readonly AffectedMarket[]
}

export const sourceKindAllowedEventTypes: Record<EventSourceKind, EventProfileEventType[]> = {
  official_policy_notice: ["policy"],
  official_macro_release: ["macro"],
  official_rate_fixing: ["macro"],
  official_central_bank_operation: ["policy", "macro"],
  exchange_disclosure: ["announcement"],
  industry_stat_release: ["industry", "macro"],
  industry_report_release: ["industry"],
  industry_news_feed: ["industry", "news"],
  industry_policy_notice: ["industry", "policy"],
  media_fast_feed: ["news", "market_move"],
  media_analysis: ["news"],
}
