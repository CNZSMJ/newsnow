import { describe, expect, it } from "vitest"
import { createChinamoneyFdr007Fixture, createChinapvPolicyFixture, createCninfoAnnouncementFixture, createEastmoneyMarketMoveFixture } from "#/services/event-engine/fixtures"
import { extractExchangeAnnouncementFacts } from "#/services/event-engine/extractors/exchange-announcement"
import { extractMacroRateFacts } from "#/services/event-engine/extractors/macro-rate"
import { extractMediaFastFacts } from "#/services/event-engine/extractors/media-fast"
import { extractPolicyNoticeFacts } from "#/services/event-engine/extractors/policy-notice"
import { evaluateMinimalFactTemplate } from "#/services/event-engine/minimal-facts"

describe("minimal fact templates", () => {
  it("treats exchange announcements as complete when issuer, action, and timing fields are present", () => {
    const raw = createCninfoAnnouncementFixture({
      itemId: "minimal-fact-announcement",
      secCode: "300750",
      secName: "宁德时代",
      title: "关于向特定对象发行股票预案的公告",
      announcementTypeName: "再融资",
    })
    const payload = JSON.parse(raw.payload_json)
    const facts = extractExchangeAnnouncementFacts({
      eventId: "evt_minimal_announcement",
      rawId: raw.raw_id,
      sourceId: raw.source_id,
      raw,
      payload,
      eventSubType: "financing",
    })

    const evaluation = evaluateMinimalFactTemplate({
      eventType: "announcement",
      eventSubType: "financing",
      facts: facts.map(fact => ({
        factId: fact.fact_id,
        eventId: fact.event_id,
        evidenceId: fact.evidence_id ?? undefined,
        factType: fact.fact_type,
        metricName: fact.metric_name,
        value: fact.value ?? undefined,
        unit: fact.unit ?? undefined,
        previousValue: fact.previous_value ?? undefined,
        delta: fact.delta ?? undefined,
        direction: fact.direction ?? undefined,
        effectiveAt: fact.effective_at ?? undefined,
        entityId: fact.entity_id ?? undefined,
        confidence: fact.confidence,
        payload: JSON.parse(fact.payload_json),
      })),
    })

    expect(evaluation.templateId).toBe("announcement")
    expect(evaluation.complete).toBe(true)
    expect(evaluation.missingFields).toEqual([])
  })

  it("captures issuer, action, scope, and execution timing for policy notices", () => {
    const raw = createChinapvPolicyFixture({
      title: "关于促进光伏行业高质量发展的实施意见",
      summary: "光伏行业协会提出支持光伏产业提质增效，2026年7月1日起实施。",
    })
    const payload = JSON.parse(raw.payload_json)
    const facts = extractPolicyNoticeFacts({
      eventId: "evt_minimal_policy",
      rawId: raw.raw_id,
      sourceId: raw.source_id,
      raw,
      payload,
    })
    const factPayload = JSON.parse(facts[0]?.payload_json ?? "{}")
    const evaluation = evaluateMinimalFactTemplate({
      eventType: "policy",
      eventSubType: "industrial_policy",
      facts: facts.map(fact => ({
        factId: fact.fact_id,
        eventId: fact.event_id,
        evidenceId: fact.evidence_id ?? undefined,
        factType: fact.fact_type,
        metricName: fact.metric_name,
        value: fact.value ?? undefined,
        unit: fact.unit ?? undefined,
        previousValue: fact.previous_value ?? undefined,
        delta: fact.delta ?? undefined,
        direction: fact.direction ?? undefined,
        effectiveAt: fact.effective_at ?? undefined,
        entityId: fact.entity_id ?? undefined,
        confidence: fact.confidence,
        payload: JSON.parse(fact.payload_json),
      })),
    })

    expect(factPayload.issuerInstitution).toBe("光伏行业协会")
    expect(factPayload.policyAction).toContain("促进光伏行业高质量发展")
    expect(factPayload.targetScope).toBe("光伏行业")
    expect(factPayload.executionWindow).toContain("2026年7月1日")
    expect(evaluation.complete).toBe(true)
    expect(evaluation.missingFields).toEqual([])
  })

  it("keeps macro rate templates complete when metric, current value, prior value, and time are present", () => {
    const raw = createChinamoneyFdr007Fixture()
    const payload = JSON.parse(raw.payload_json)
    const facts = extractMacroRateFacts({
      eventId: "evt_minimal_macro",
      rawId: raw.raw_id,
      sourceId: raw.source_id,
      raw,
      payload,
    })

    const evaluation = evaluateMinimalFactTemplate({
      eventType: "macro",
      eventSubType: "rate_fixing",
      facts: facts.map(fact => ({
        factId: fact.fact_id,
        eventId: fact.event_id,
        evidenceId: fact.evidence_id ?? undefined,
        factType: fact.fact_type,
        metricName: fact.metric_name,
        value: fact.value ?? undefined,
        unit: fact.unit ?? undefined,
        previousValue: fact.previous_value ?? undefined,
        delta: fact.delta ?? undefined,
        direction: fact.direction ?? undefined,
        effectiveAt: fact.effective_at ?? undefined,
        entityId: fact.entity_id ?? undefined,
        confidence: fact.confidence,
        payload: JSON.parse(fact.payload_json),
      })),
    })

    expect(evaluation.templateId).toBe("macro")
    expect(evaluation.complete).toBe(true)
    expect(evaluation.missingFields).toEqual([])
  })

  it("captures subject, magnitude, and move direction for market-move fast signals", () => {
    const raw = createEastmoneyMarketMoveFixture()
    const payload = JSON.parse(raw.payload_json)
    const facts = extractMediaFastFacts({
      eventId: "evt_minimal_market_move",
      rawId: raw.raw_id,
      sourceId: raw.source_id,
      raw,
      payload,
    })
    const factPayload = JSON.parse(facts[0]?.payload_json ?? "{}")
    const evaluation = evaluateMinimalFactTemplate({
      eventType: "market_move",
      eventSubType: "other",
      facts: facts.map(fact => ({
        factId: fact.fact_id,
        eventId: fact.event_id,
        evidenceId: fact.evidence_id ?? undefined,
        factType: fact.fact_type,
        metricName: fact.metric_name,
        value: fact.value ?? undefined,
        unit: fact.unit ?? undefined,
        previousValue: fact.previous_value ?? undefined,
        delta: fact.delta ?? undefined,
        direction: fact.direction ?? undefined,
        effectiveAt: fact.effective_at ?? undefined,
        entityId: fact.entity_id ?? undefined,
        confidence: fact.confidence,
        payload: JSON.parse(fact.payload_json),
      })),
    })

    expect(factPayload.subjectText).toBe("沪指")
    expect(factPayload.magnitudeText).toContain("1")
    expect(factPayload.market).toBe("A")
    expect(evaluation.complete).toBe(true)
    expect(evaluation.missingFields).toEqual([])
  })
})
