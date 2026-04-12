import { describe, expect, it } from "vitest"
import { buildEventIdentity, buildEventIdentityHints } from "#/services/event-engine/merger"
import { getSourceEventProfile } from "#/services/event-engine/profiles"
import { resolveRequestedSourceSeedIds } from "#/services/event-engine/request-scope"
import { resolveEventClassification } from "#/services/event-engine/resolver"
import { buildImpactSnapshot } from "#/services/event-engine/impact"
import { extractEntityLinks } from "#/services/event-engine/entity"
import { extractEventFacts } from "#/services/event-engine/extractors"
import { EVENT_ENGINE_METRICS, getEventEngineMetricsSnapshot, incrementEventEngineMetric, resetEventEngineMetrics } from "#/services/event-engine/metrics"
import { createChinaisaIndustryFixture, createChinamoneyFdr007Fixture, createChinapvPolicyFixture, createClsInterpretationFixture, createClsOmoFixture, createCninfoAnnouncementFixture, createEastmoneyMarketMoveFixture, createHkexResumeFixtures, createPbcOmoFixture } from "#/services/event-engine/fixtures"

describe("event-engine replay fixtures", () => {
  it("does not expand to default sources when replaying explicit raw ids", () => {
    expect(resolveRequestedSourceSeedIds({
      replayRawIds: ["raw_wallstreetcn-quick_1"],
    })).toEqual([])

    expect(resolveRequestedSourceSeedIds({
      sourceIds: ["wallstreetcn-quick"],
      replayRawIds: ["raw_wallstreetcn-quick_1"],
    })).toEqual(["wallstreetcn-quick"])
  })

  it("extracts macro rate facts and emits positive CN rates direction when FDR007 falls", () => {
    const raw = createChinamoneyFdr007Fixture()
    const payload = JSON.parse(raw.payload_json)
    const resolved = resolveEventClassification(raw.source_id, raw.title)
    const identityHints = buildEventIdentityHints({
      sourceId: raw.source_id,
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
      sourceId: raw.source_id,
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

    expect(resolved.eventType).toBe("macro")
    expect(resolved.eventSubType).toBe("rate_fixing")
    expect(facts[0]?.metric_name).toBe("FDR007")
    expect(facts[0]?.delta).toBe("-5.5")
    expect(impact.directionalView).toBe("positive")
    expect(impact.affectedMarkets).toContain("CN_rates")
  })

  it("extracts central bank operation facts from OMO passthrough payload", () => {
    const raw = createPbcOmoFixture()
    const payload = JSON.parse(raw.payload_json)
    const resolved = resolveEventClassification(raw.source_id, raw.title, payload.extra?.hover)
    const identityHints = buildEventIdentityHints({
      sourceId: raw.source_id,
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
      sourceId: raw.source_id,
      raw,
      payload,
      resolved,
    })
    const operationPayload = JSON.parse(facts[0]?.payload_json ?? "{}") as Record<string, unknown>

    expect(resolved.eventType).toBe("policy")
    expect(resolved.eventSubType).toBe("monetary_policy")
    expect(facts[0]?.fact_type).toBe("central_bank_operation")
    expect(facts[0]?.value).toBe("20")
    expect(operationPayload.rate).toBe(1.4)
    expect(operationPayload.tenor).toBe("7天")
  })

  it("merges the same HKEX disclosure PDF into one canonical event identity", () => {
    const rows = createHkexResumeFixtures()
    const eventIds = rows.map((raw) => {
      const payload = JSON.parse(raw.payload_json)
      const resolved = resolveEventClassification(raw.source_id, raw.title)
      const identityHints = buildEventIdentityHints({
        sourceId: raw.source_id,
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

      expect(resolved.eventSubType).toBe("listing_status")
      return identity.eventId
    })

    expect(new Set(eventIds).size).toBe(1)
  })

  it("classifies media fast feed OMO news into monetary policy with structured signal fact", () => {
    const raw = createClsOmoFixture()
    const payload = JSON.parse(raw.payload_json)
    const resolved = resolveEventClassification(raw.source_id, raw.title, payload.extra?.hover)
    const identityHints = buildEventIdentityHints({
      sourceId: raw.source_id,
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
      sourceId: raw.source_id,
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

    expect(resolved.eventType).toBe("policy")
    expect(resolved.eventSubType).toBe("monetary_policy")
    expect(facts[0]?.fact_type).toBe("media_fast_signal")
    expect(impact.directionalView).toBe("positive")
  })

  it("classifies market move fast feed into market_move and narrows affected market", () => {
    const raw = createEastmoneyMarketMoveFixture()
    const payload = JSON.parse(raw.payload_json)
    const resolved = resolveEventClassification(raw.source_id, raw.title, payload.extra?.hover)
    const identityHints = buildEventIdentityHints({
      sourceId: raw.source_id,
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
      sourceId: raw.source_id,
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

    expect(resolved.eventType).toBe("market_move")
    expect(facts[0]?.fact_type).toBe("media_fast_signal")
    expect(impact.directionalView).toBe("negative")
    expect(impact.affectedMarkets).toEqual(["A"])
  })

  it("extracts issuer context from teaser-style CLS interpretation items", async () => {
    const raw = createClsInterpretationFixture()
    const payload = JSON.parse(raw.payload_json)
    const resolved = resolveEventClassification(raw.source_id, raw.title, payload.extra?.hover)
    const identityHints = buildEventIdentityHints({
      sourceId: raw.source_id,
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
      sourceId: raw.source_id,
      raw,
      payload,
      resolved,
    })
    const entities = await extractEntityLinks(identity.eventId, raw.title, resolved.topicTags, {
      summary: payload.extra?.hover,
      payload,
    })
    const impact = buildImpactSnapshot({
      eventType: resolved.eventType,
      eventSubType: resolved.eventSubType,
      profile: resolved.profile,
      publishedAt: raw.published_at ?? undefined,
      facts,
    })

    expect(resolved.eventSubType).toBe("analysis_signal")
    expect(entities.some(entity => entity.entity_type === "company" && entity.entity_name === "鹏辉能源")).toBe(true)
    expect(impact.tradabilityScore).toBeLessThan(45)
  })

  it.each([
    {
      label: "earnings",
      raw: createCninfoAnnouncementFixture({
        itemId: "cninfo-earnings",
        secCode: "300750",
        secName: "宁德时代",
        title: "2026年第一季度报告",
        announcementTypeName: "定期报告",
      }),
      expectedSubType: "earnings",
    },
    {
      label: "financing",
      raw: createCninfoAnnouncementFixture({
        itemId: "cninfo-financing",
        secCode: "300750",
        secName: "宁德时代",
        title: "向特定对象发行股票募集说明书",
        announcementTypeName: "再融资",
      }),
      expectedSubType: "financing",
    },
    {
      label: "buyback",
      raw: createCninfoAnnouncementFixture({
        itemId: "cninfo-buyback",
        secCode: "000001",
        secName: "平安银行",
        title: "关于回购公司股份方案的公告",
        announcementTypeName: "回购",
      }),
      expectedSubType: "buyback",
    },
    {
      label: "dividend",
      raw: createCninfoAnnouncementFixture({
        itemId: "cninfo-dividend",
        secCode: "600519",
        secName: "贵州茅台",
        title: "2025年度利润分配预案公告",
        announcementTypeName: "权益分派",
      }),
      expectedSubType: "dividend",
    },
  ])("extracts exchange announcement facts for $label", ({ raw, expectedSubType }) => {
    const payload = JSON.parse(raw.payload_json)
    const resolved = resolveEventClassification(raw.source_id, raw.title)
    const identityHints = buildEventIdentityHints({
      sourceId: raw.source_id,
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
      sourceId: raw.source_id,
      raw,
      payload,
      resolved,
    })

    expect(resolved.eventType).toBe("announcement")
    expect(resolved.eventSubType).toBe(expectedSubType)
    expect(facts[0]?.fact_type).toBe("exchange_announcement")
    expect(facts[0]?.metric_name).toBe(expectedSubType)
    expect(facts[0]?.entity_id).toBe((payload.extra?.raw as { secCode?: string })?.secCode)
  })

  it("extracts structured industry facts for monthly industry releases", () => {
    const raw = createChinaisaIndustryFixture({
      itemId: "steel-monthly-202603",
      title: "2026年3月钢铁行业运行月报：产量增长3.2%",
      summary: "行业景气改善，产量持续增长。",
    })
    const payload = JSON.parse(raw.payload_json)
    const resolved = resolveEventClassification(raw.source_id, raw.title, payload.extra?.info)
    const identityHints = buildEventIdentityHints({
      sourceId: raw.source_id,
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
      sourceId: raw.source_id,
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
    const factPayload = JSON.parse(facts[0]?.payload_json ?? "{}") as Record<string, unknown>

    expect(resolved.eventType).toBe("industry")
    expect(resolved.eventSubType).toBe("industry_data")
    expect(facts[0]?.fact_type).toBe("industry_release")
    expect(facts[0]?.unit).toBe("monthly")
    expect(factPayload.periodKey).toBe("2026-03")
    expect(impact.materialityScore).toBeGreaterThanOrEqual(60)
    expect(impact.affectedMarkets).toContain("A")
  })

  it("extracts structured policy facts for industry policy notices", () => {
    const raw = createChinapvPolicyFixture()
    const payload = JSON.parse(raw.payload_json)
    const resolved = resolveEventClassification(raw.source_id, raw.title, payload.extra?.info)
    const identityHints = buildEventIdentityHints({
      sourceId: raw.source_id,
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
      sourceId: raw.source_id,
      raw,
      payload,
      resolved,
    })

    expect(resolved.eventType).toBe("policy")
    expect(resolved.eventSubType).toBe("industrial_policy")
    expect(facts[0]?.fact_type).toBe("policy_notice")
    expect(facts[0]?.entity_id).toBe("photovoltaic")
  })

  it("separates different monthly releases while merging duplicate periodic releases", () => {
    const march = createChinaisaIndustryFixture({
      itemId: "steel-monthly-202603-a",
      title: "2026年3月钢铁行业运行月报：产量增长3.2%",
      publishedAt: Date.parse("2026-04-10T10:00:00+08:00"),
    })
    const marchDuplicate = createChinaisaIndustryFixture({
      itemId: "steel-monthly-202603-b",
      title: "2026年3月钢铁行业运行月报：产量增长3.2%",
      publishedAt: Date.parse("2026-04-10T10:30:00+08:00"),
    })
    const april = createChinaisaIndustryFixture({
      itemId: "steel-monthly-202604-a",
      title: "2026年4月钢铁行业运行月报：产量增长1.1%",
      publishedAt: Date.parse("2026-05-10T10:00:00+08:00"),
    })

    const identities = [march, marchDuplicate, april].map((raw) => {
      const payload = JSON.parse(raw.payload_json)
      const resolved = resolveEventClassification(raw.source_id, raw.title, payload.extra?.info)
      const identityHints = buildEventIdentityHints({
        sourceId: raw.source_id,
        sourceKind: resolved.profile?.sourceKind,
        eventSubType: resolved.eventSubType,
        raw,
        payload,
      })
      return buildEventIdentity({
        eventType: resolved.eventType,
        eventSubType: resolved.eventSubType,
        sourceKind: resolved.profile?.sourceKind,
        title: raw.title,
        primaryEntityName: resolved.primaryEntityName,
        publishedAt: raw.published_at ?? undefined,
        identityHints,
      }).eventId
    })

    expect(identities[0]).toBe(identities[1])
    expect(identities[0]).not.toBe(identities[2])
  })
})

describe("event-engine metrics", () => {
  it("tracks counters with labels and totals", () => {
    resetEventEngineMetrics()
    incrementEventEngineMetric(EVENT_ENGINE_METRICS.eventCreates, { source_id: "pbc-omo", event_type: "policy" })
    incrementEventEngineMetric(EVENT_ENGINE_METRICS.eventCreates, { source_id: "pbc-omo", event_type: "policy" })
    incrementEventEngineMetric(EVENT_ENGINE_METRICS.extractorSuccess, { parser_family: getSourceEventProfile("pbc-omo")?.parserFamily })
    incrementEventEngineMetric(EVENT_ENGINE_METRICS.replayedRawItems, { source_id: "wallstreetcn-quick", replay_mode: "raw_id" })

    const snapshot = getEventEngineMetricsSnapshot()
    expect(snapshot.totals[EVENT_ENGINE_METRICS.eventCreates]).toBe(2)
    expect(snapshot.totals[EVENT_ENGINE_METRICS.extractorSuccess]).toBe(1)
    expect(snapshot.totals[EVENT_ENGINE_METRICS.replayedRawItems]).toBe(1)
    expect(snapshot.points.some(point => point.labels.source_id === "pbc-omo")).toBe(true)
  })
})
