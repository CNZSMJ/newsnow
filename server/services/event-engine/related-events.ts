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
  const sections: InvestmentRelatedEventsSection[] = []
  const seen = new Set<string>([detail.eventId])

  const primaryEntity = getPrimaryEntity(detail)
  if (primaryEntity) {
    const result = await deps.getEntityEvents({
      entity: getEntityLookupValue(primaryEntity),
      limit: 6,
      sortBy: "investment",
    })
    const items = takeProjectedSection(result.items, seen)
    if (items.length) {
      sections.push({
        context: "entity",
        label: primaryEntity.entityName,
        displayLabel: getInvestmentRelatedSectionDisplayLabel("entity", primaryEntity.entityName),
        items,
      })
    }
  }

  const primaryTopic = detail.topicTags[0]
  if (primaryTopic) {
    const result = await deps.listLatestEvents({
      topic: primaryTopic,
      limit: 6,
      sortBy: "investment",
    })
    const items = takeProjectedSection(result.items, seen)
    if (items.length) {
      sections.push({
        context: "topic",
        label: primaryTopic,
        displayLabel: getInvestmentRelatedSectionDisplayLabel("topic", primaryTopic),
        items,
      })
    }
  }

  const primaryMarket = detail.affectedMarkets[0]
  if (primaryMarket) {
    const result = await deps.listLatestEvents({
      market: primaryMarket,
      limit: 6,
      sortBy: "investment",
    })
    const items = takeProjectedSection(result.items, seen)
    if (items.length) {
      sections.push({
        context: "market",
        label: primaryMarket,
        displayLabel: getInvestmentRelatedSectionDisplayLabel("market", primaryMarket),
        items,
      })
    }
  }

  const familyQuery = detail.eventSubType !== "other"
    ? { eventSubType: detail.eventSubType, label: detail.eventSubType }
    : detail.eventType !== "news"
      ? { eventType: detail.eventType, label: detail.eventType }
      : undefined
  if (familyQuery) {
    const result = await deps.listLatestEvents({
      eventType: "eventType" in familyQuery ? familyQuery.eventType : undefined,
      eventSubType: "eventSubType" in familyQuery ? familyQuery.eventSubType : undefined,
      limit: 6,
      sortBy: "investment",
    })
    const items = takeProjectedSection(result.items, seen)
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
