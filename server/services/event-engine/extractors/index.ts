import type { NewsItem, SourceID } from "@shared/types"
import type { EventFactRow, RawItemRow } from "#/types"
import type { ResolvedEventClassification } from "#/services/event-engine/resolver"
import { extractCentralBankOperationFacts } from "#/services/event-engine/extractors/central-bank-operation"
import { extractExchangeAnnouncementFacts } from "#/services/event-engine/extractors/exchange-announcement"
import { extractIndustryNewsFacts } from "#/services/event-engine/extractors/industry-news"
import { extractIndustryReleaseFacts } from "#/services/event-engine/extractors/industry-release"
import { extractMacroRateFacts } from "#/services/event-engine/extractors/macro-rate"
import { extractMediaFastFacts } from "#/services/event-engine/extractors/media-fast"
import { extractPolicyNoticeFacts } from "#/services/event-engine/extractors/policy-notice"

export function extractEventFacts(input: {
  eventId: string
  rawId: string
  sourceId: SourceID
  raw: RawItemRow
  payload: NewsItem
  resolved: ResolvedEventClassification
}) {
  switch (input.resolved.profile?.parserFamily) {
    case "macro_rate":
      return extractMacroRateFacts(input)
    case "central_bank_operation":
      return extractCentralBankOperationFacts(input)
    case "exchange_announcement":
      return extractExchangeAnnouncementFacts({
        ...input,
        eventSubType: input.resolved.eventSubType,
      })
    case "industry_stat":
      return extractIndustryReleaseFacts({
        ...input,
        eventSubType: input.resolved.eventSubType,
      })
    case "industry_news":
      return extractIndustryNewsFacts(input)
    case "policy":
      return extractPolicyNoticeFacts(input)
    case "media_fast":
      return extractMediaFastFacts(input)
    default:
      return [] as EventFactRow[]
  }
}
