import type { EventDetail, EventEntityLink, EventRecord, InvestmentRelatedEventsSection } from "@shared/types"
import { getEntityEvents, listLatestEvents } from "#/services/event-engine/query"
import {
  getInvestmentEventFamilyLabel,
  getInvestmentRelatedSectionDisplayLabel,
  projectInvestmentEventBrief,
} from "#/services/event-engine/investment-view"

interface RelatedEventDeps {
  getEntityEvents: typeof getEntityEvents
  listLatestEvents: typeof listLatestEvents
}

function getPrimaryEntity(detail: EventDetail) {
  return detail.entities.find(entity => entity.entityType === "stock" || entity.entityType === "company")
}

function getEntityLookupValue(entity: EventEntityLink) {
  return entity.fullCode || entity.code || entity.entityName
}

const RELATED_ENTITY_SCAN_LIMIT = 24
const RELATED_TOPIC_SCAN_LIMIT = 48
const RELATED_MARKET_SCAN_LIMIT = 24
const RELATED_FAMILY_SCAN_LIMIT = 24

function takeProjectedSection(
  items: EventRecord[],
  seen: Set<string>,
  limit = 4,
) {
  return items
    .filter(item => !seen.has(item.eventId))
    .slice(0, limit)
    .map((item) => {
      seen.add(item.eventId)
      return projectInvestmentEventBrief(item)
    })
}

export async function buildInvestmentRelatedEvents(
  detail: EventDetail,
  deps: RelatedEventDeps = {
    getEntityEvents,
    listLatestEvents,
  },
): Promise<InvestmentRelatedEventsSection[]> {
  const seen = new Set<string>([detail.eventId])
  const primaryEntity = getPrimaryEntity(detail)
  const primaryTopic = detail.topicTags[0]
  const primaryMarket = detail.affectedMarkets[0]
  const familyQuery = detail.eventSubType !== "other"
    ? { eventSubType: detail.eventSubType, label: detail.eventSubType }
    : detail.eventType !== "news"
      ? { eventType: detail.eventType, label: detail.eventType }
      : undefined

  const [entityResult, topicResult, marketResult, familyResult] = await Promise.all([
    primaryEntity
      ? deps.getEntityEvents({
          entity: getEntityLookupValue(primaryEntity),
          limit: 6,
          scanLimit: RELATED_ENTITY_SCAN_LIMIT,
          sortBy: "investment",
          includeTotalCount: false,
        })
      : Promise.resolve(null),
    primaryTopic
      ? deps.listLatestEvents({
          topic: primaryTopic,
          limit: 6,
          scanLimit: RELATED_TOPIC_SCAN_LIMIT,
          sortBy: "investment",
          includeTotalCount: false,
        })
      : Promise.resolve(null),
    primaryMarket
      ? deps.listLatestEvents({
          market: primaryMarket,
          limit: 6,
          scanLimit: RELATED_MARKET_SCAN_LIMIT,
          sortBy: "investment",
          includeTotalCount: false,
        })
      : Promise.resolve(null),
    familyQuery
      ? deps.listLatestEvents({
          eventType: "eventType" in familyQuery ? familyQuery.eventType : undefined,
          eventSubType: "eventSubType" in familyQuery ? familyQuery.eventSubType : undefined,
          limit: 6,
          scanLimit: RELATED_FAMILY_SCAN_LIMIT,
          sortBy: "investment",
          includeTotalCount: false,
        })
      : Promise.resolve(null),
  ])

  const sections: InvestmentRelatedEventsSection[] = []

  if (primaryEntity && entityResult) {
    const items = takeProjectedSection(entityResult.items, seen)
    if (items.length) {
      sections.push({
        context: "entity",
        label: primaryEntity.entityName,
        displayLabel: getInvestmentRelatedSectionDisplayLabel("entity", primaryEntity.entityName),
        items,
      })
    }
  }

  if (primaryTopic && topicResult) {
    const items = takeProjectedSection(topicResult.items, seen)
    if (items.length) {
      sections.push({
        context: "topic",
        label: primaryTopic,
        displayLabel: getInvestmentRelatedSectionDisplayLabel("topic", primaryTopic),
        items,
      })
    }
  }

  if (primaryMarket && marketResult) {
    const items = takeProjectedSection(marketResult.items, seen)
    if (items.length) {
      sections.push({
        context: "market",
        label: primaryMarket,
        displayLabel: getInvestmentRelatedSectionDisplayLabel("market", primaryMarket),
        items,
      })
    }
  }

  if (familyQuery && familyResult) {
    const items = takeProjectedSection(familyResult.items, seen)
    if (items.length) {
      sections.push({
        context: "family",
        label: "eventSubType" in familyQuery
          ? getInvestmentEventFamilyLabel(items[0]?.eventFamily ?? "general_news")
          : familyQuery.label,
        displayLabel: getInvestmentRelatedSectionDisplayLabel(
          "family",
          "eventSubType" in familyQuery
            ? getInvestmentEventFamilyLabel(items[0]?.eventFamily ?? "general_news")
            : familyQuery.label,
        ),
        items,
      })
    }
  }

  return sections
}
