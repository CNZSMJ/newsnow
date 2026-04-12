import { describe, expect, it } from "vitest"
import type { EventDetail, EventRecord } from "@shared/types"
import { buildInvestmentRelatedEvents } from "#/services/event-engine/related-events"

function makeEvent(overrides: Partial<EventRecord>): EventRecord {
  return {
    eventId: overrides.eventId ?? "evt_default",
    title: overrides.title ?? "default",
    eventType: overrides.eventType ?? "news",
    eventSubType: overrides.eventSubType ?? "other",
    ingestedAt: overrides.ingestedAt ?? 1,
    importance: overrides.importance ?? "medium",
    affectedMarkets: overrides.affectedMarkets ?? [],
    topicTags: overrides.topicTags ?? [],
    evidenceCount: overrides.evidenceCount ?? 1,
    sourceIds: overrides.sourceIds ?? ["cls-telegraph"],
    ...overrides,
  }
}

function makeDetail(overrides: Partial<EventDetail>): EventDetail {
  return {
    eventId: overrides.eventId ?? "evt_target",
    title: overrides.title ?? "target",
    eventType: overrides.eventType ?? "announcement",
    eventSubType: overrides.eventSubType ?? "earnings",
    ingestedAt: overrides.ingestedAt ?? 1,
    importance: overrides.importance ?? "medium",
    affectedMarkets: overrides.affectedMarkets ?? ["A"],
    topicTags: overrides.topicTags ?? ["semiconductor"],
    evidenceCount: overrides.evidenceCount ?? 1,
    sourceIds: overrides.sourceIds ?? ["cninfo-szse"],
    evidences: overrides.evidences ?? [],
      entities: overrides.entities ?? [{
        eventId: "evt_target",
        entityType: "stock",
        entityName: "中际旭创",
        code: "300308",
        fullCode: "sz300308",
        confidence: 0.95,
        resolver: "unit-test",
      }],
    facts: overrides.facts ?? [],
    timeline: overrides.timeline ?? [],
    ...overrides,
  }
}

describe("buildInvestmentRelatedEvents", () => {
  it("builds entity, topic, market, and family sections in priority order without duplicates", async () => {
    const detail = makeDetail({})

    const entityEvent = makeEvent({
      eventId: "evt_entity",
      title: "中际旭创订单进展",
      eventType: "announcement",
      eventSubType: "contract",
      affectedMarkets: ["A"],
      sourceIds: ["cninfo-szse"],
    })
    const duplicateEntityTopic = makeEvent({
      eventId: "evt_dup",
      title: "半导体赛道催化",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "industry_news_feed",
      affectedMarkets: ["A"],
      topicTags: ["semiconductor"],
      sourceIds: ["caict-ai-news"],
    })
    const topicEvent = makeEvent({
      eventId: "evt_topic",
      title: "半导体景气跟踪",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "industry_news_feed",
      affectedMarkets: ["A"],
      topicTags: ["semiconductor"],
      sourceIds: ["semi-semiconductor"],
    })
    const marketEvent = makeEvent({
      eventId: "evt_market",
      title: "A股市场整体异动",
      eventType: "market_move",
      eventSubType: "other",
      affectedMarkets: ["A"],
      sourceIds: ["cls-telegraph"],
    })
    const familyEvent = makeEvent({
      eventId: "evt_family",
      title: "另一家业绩预告",
      eventType: "announcement",
      eventSubType: "earnings",
      affectedMarkets: ["A"],
      sourceIds: ["sse-latest"],
    })

    const sections = await buildInvestmentRelatedEvents(detail, {
      async getEntityEvents() {
        return { updatedAt: Date.now(), items: [entityEvent, duplicateEntityTopic], totalCount: 2 }
      },
      async listLatestEvents(options) {
        if (options?.topic)
          return { updatedAt: Date.now(), items: [duplicateEntityTopic, topicEvent], totalCount: 2 }
        if (options?.market)
          return { updatedAt: Date.now(), items: [marketEvent], totalCount: 1 }
        return { updatedAt: Date.now(), items: [familyEvent], totalCount: 1 }
      },
    })

    expect(sections.map(section => section.context)).toEqual(["entity", "topic", "market", "family"])
    expect(sections[0]?.items.map(item => item.eventId)).toEqual(["evt_entity", "evt_dup"])
    expect(sections[0]?.displayLabel).toBe("同主体相关事件 · 中际旭创")
    expect(sections[1]?.items.map(item => item.eventId)).toEqual(["evt_topic"])
    expect(sections[1]?.displayLabel).toBe("同赛道相关事件 · 半导体")
    expect(sections[2]?.items.map(item => item.eventId)).toEqual(["evt_market"])
    expect(sections[2]?.displayLabel).toBe("同市场相关事件 · A股")
    expect(sections[3]?.items.map(item => item.eventId)).toEqual(["evt_family"])
    expect(sections[3]?.displayLabel).toBe("同类事件 · 业绩")
  })

  it("falls back to same event type when subtype is other", async () => {
    const detail = makeDetail({
      eventType: "policy",
      eventSubType: "other",
      topicTags: [],
      affectedMarkets: ["CN_macro"],
      entities: [],
    })
    const policyPeer = makeEvent({
      eventId: "evt_policy_peer",
      title: "产业政策跟踪",
      eventType: "policy",
      eventSubType: "industrial_policy",
      affectedMarkets: ["CN_macro"],
      sourceIds: ["ndrc-industry"],
    })

    const sections = await buildInvestmentRelatedEvents(detail, {
      async getEntityEvents() {
        return { updatedAt: Date.now(), items: [], totalCount: 0 }
      },
      async listLatestEvents(options) {
        if (options?.market)
          return { updatedAt: Date.now(), items: [], totalCount: 0 }
        return { updatedAt: Date.now(), items: [policyPeer], totalCount: 1 }
      },
    })

    expect(sections.at(-1)?.context).toBe("family")
    expect(sections.at(-1)?.items[0]?.eventId).toBe("evt_policy_peer")
  })
})
