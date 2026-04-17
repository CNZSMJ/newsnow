import { describe, expect, it } from "vitest"
import { buildEventIdentity, buildEventIdentityHints, derivePeriodicSeriesMetadata } from "#/services/event-engine/merger"
import { getSourceEventProfile } from "#/services/event-engine/profiles"
import { resolveRequestedSourceSeedIds } from "#/services/event-engine/request-scope"
import { resolveEventClassification } from "#/services/event-engine/resolver"
import { buildImpactSnapshot } from "#/services/event-engine/impact"
import { extractEntityLinks } from "#/services/event-engine/entity"
import { extractEventFacts } from "#/services/event-engine/extractors"
import { getInvestmentEventFamily } from "#/services/event-engine/investment-view"
import { EVENT_ENGINE_METRICS, getEventEngineMetricsSnapshot, incrementEventEngineMetric, resetEventEngineMetrics } from "#/services/event-engine/metrics"
import { createChinaisaIndustryFixture, createChinamoneyFdr007Fixture, createChinapvPolicyFixture, createClsInterpretationFixture, createClsOmoFixture, createCninfoAnnouncementFixture, createEastmoneyMarketMoveFixture, createHkexResumeFixtures, createPbcOmoFixture, createXueqiuHotstockFixture } from "#/services/event-engine/fixtures"

function createDatedChinamoneyFdr007Fixture(input: {
  itemId: string
  date: string
  publishedAt: number
}) {
  const raw = createChinamoneyFdr007Fixture()
  const payload = JSON.parse(raw.payload_json) as {
    id: string
    title: string
    url: string
    pubDate: string
    extra?: {
      diff?: number
      raw?: Record<string, unknown>
    }
  }
  const url = `https://www.chinamoney.com.cn/chinese/bkfrr/${input.date.replaceAll("-", "")}/1001.html`

  payload.id = input.itemId
  payload.url = url
  payload.pubDate = `${input.date} 11:30:00`
  payload.extra = {
    ...payload.extra,
    raw: {
      ...(payload.extra?.raw ?? {}),
      productCode: "FDR007",
      showDateCN: input.date,
      shibor: "1.4550",
    },
  }

  return {
    ...raw,
    raw_id: `raw_${raw.source_id}_${input.itemId}`,
    source_item_id: input.itemId,
    title: payload.title,
    url,
    published_at: input.publishedAt,
    fetched_at: input.publishedAt + 60_000,
    fingerprint: `${payload.title}|${url}`,
    payload_json: JSON.stringify(payload),
  }
}

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

  it("keeps official rate-fixing event ids date-specific while sharing the same series key per metric", () => {
    const first = createDatedChinamoneyFdr007Fixture({
      itemId: "fdr007-2026-04-11-a",
      date: "2026-04-11",
      publishedAt: Date.parse("2026-04-11T11:30:00+08:00"),
    })
    const second = createDatedChinamoneyFdr007Fixture({
      itemId: "fdr007-2026-04-12-a",
      date: "2026-04-12",
      publishedAt: Date.parse("2026-04-12T11:30:00+08:00"),
    })

    const firstPayload = JSON.parse(first.payload_json)
    const secondPayload = JSON.parse(second.payload_json)
    const firstResolved = resolveEventClassification(first.source_id, first.title)
    const secondResolved = resolveEventClassification(second.source_id, second.title)
    const firstHints = buildEventIdentityHints({
      sourceId: first.source_id,
      sourceKind: firstResolved.profile?.sourceKind,
      eventSubType: firstResolved.eventSubType,
      raw: first,
      payload: firstPayload,
    })
    const secondHints = buildEventIdentityHints({
      sourceId: second.source_id,
      sourceKind: secondResolved.profile?.sourceKind,
      eventSubType: secondResolved.eventSubType,
      raw: second,
      payload: secondPayload,
    })
    const firstIdentity = buildEventIdentity({
      eventType: firstResolved.eventType,
      eventSubType: firstResolved.eventSubType,
      sourceKind: firstResolved.profile?.sourceKind,
      title: first.title,
      primaryEntityName: firstResolved.primaryEntityName,
      publishedAt: first.published_at ?? undefined,
      identityHints: firstHints,
    })
    const secondIdentity = buildEventIdentity({
      eventType: secondResolved.eventType,
      eventSubType: secondResolved.eventSubType,
      sourceKind: secondResolved.profile?.sourceKind,
      title: second.title,
      primaryEntityName: secondResolved.primaryEntityName,
      publishedAt: second.published_at ?? undefined,
      identityHints: secondHints,
    })
    const firstSeries = derivePeriodicSeriesMetadata({
      sourceId: first.source_id,
      sourceKind: firstResolved.profile?.sourceKind,
      eventSubType: firstResolved.eventSubType,
      raw: first,
      payload: firstPayload,
    })
    const secondSeries = derivePeriodicSeriesMetadata({
      sourceId: second.source_id,
      sourceKind: secondResolved.profile?.sourceKind,
      eventSubType: secondResolved.eventSubType,
      raw: second,
      payload: secondPayload,
    })

    expect(firstResolved.eventSubType).toBe("rate_fixing")
    expect(secondResolved.eventSubType).toBe("rate_fixing")
    expect(firstIdentity.eventId).not.toBe(secondIdentity.eventId)
    expect(firstSeries.seriesKey).toBe("official_rate_fixing|FDR007")
    expect(secondSeries.seriesKey).toBe("official_rate_fixing|FDR007")
    expect(firstSeries.periodKey).toBe("2026-04-11")
    expect(secondSeries.periodKey).toBe("2026-04-12")
    expect(firstSeries.releaseCadence).toBe("daily")
    expect(secondSeries.releaseCadence).toBe("daily")
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

  it("does not materialize broad market descriptors into company follow-up entities", async () => {
    const title = "加密货币板块集体走高 Strategy涨超12%"
    const summary = "加密货币板块周五集体走高，比特币涨超3%，报77195美元；以太坊涨超3.8%，报2433.5美元。截至发稿，Coinbase(COIN.US)涨超4.5%，Robinhood(HOOD.US)涨超5%，Strategy(MSTR.US)涨超12%，Bit Digital(BTBT.US)涨近4%，CleanSpark(CLSK.US)涨近4%。"
    const resolved = resolveEventClassification("cls-telegraph", title, summary)
    const entities = await extractEntityLinks("evt_broad_market_descriptor", title, resolved.topicTags, {
      primaryEntityName: resolved.primaryEntityName,
      summary,
    })

    expect(resolved.eventType).toBe("market_move")
    expect(resolved.primaryEntityName).toContain("加密货币板块")
    expect(entities.some(entity => entity.resolver === "primary-entity-fallback")).toBe(false)
    expect(entities.some(entity => entity.entity_type === "company" && entity.entity_name === "加密货币板块集体走高")).toBe(false)
    expect(entities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity_type: "stock",
        entity_name: "Coinbase",
        code: "COIN",
        full_code: "us:coin",
      }),
      expect.objectContaining({
        entity_type: "stock",
        entity_name: "Strategy",
        code: "MSTR",
        full_code: "us:mstr",
      }),
      expect.objectContaining({
        entity_type: "stock",
        entity_name: "Bit Digital",
        code: "BTBT",
        full_code: "us:btbt",
      }),
    ]))
  })

  it("extracts explicit offshore tickers from nested company names and mixed listing-code groups", async () => {
    const hkTitle = "广南(集团)(01203.HK)拟4月28日举行董事会会议审批第一季度业绩"
    const hkResolved = resolveEventClassification("gelonghui", hkTitle)
    const hkEntities = await extractEntityLinks("evt_nested_hk_ticker", hkTitle, hkResolved.topicTags, {
      primaryEntityName: hkResolved.primaryEntityName,
    })

    expect(hkEntities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity_type: "stock",
        entity_name: "广南(集团)",
        code: "01203",
        full_code: "hk01203",
        resolver: "explicit-ticker-mention",
      }),
    ]))
    expect(hkEntities.some(entity => entity.entity_type === "stock" && entity.full_code === "sh600018")).toBe(false)

    const mixedTitle = "大摩发布26家“中国最佳商业模式”企业，平安(601318.SH/2318.HK)的答案：服务"
    const mixedResolved = resolveEventClassification("gelonghui", mixedTitle)
    const mixedEntities = await extractEntityLinks("evt_mixed_listing_codes", mixedTitle, mixedResolved.topicTags, {
      primaryEntityName: mixedResolved.primaryEntityName,
    })

    expect(mixedEntities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity_type: "stock",
        entity_name: "平安",
        code: "2318",
        full_code: "hk2318",
        resolver: "explicit-ticker-mention",
      }),
      expect.objectContaining({
        entity_type: "company",
        entity_name: "中国平安",
        code: "601318",
        full_code: "sh601318",
      }),
    ]))

    const shareClassTitle = "加科思－Ｂ(01167.HK)4月10日耗资49.5万港元回购6.84万股"
    const shareClassResolved = resolveEventClassification("gelonghui", shareClassTitle)
    const shareClassEntities = await extractEntityLinks("evt_hk_share_class", shareClassTitle, shareClassResolved.topicTags, {
      primaryEntityName: shareClassResolved.primaryEntityName,
    })

    expect(shareClassEntities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity_type: "stock",
        entity_name: "加科思－Ｂ",
        code: "01167",
        full_code: "hk01167",
        resolver: "explicit-ticker-mention",
      }),
    ]))
  })

  it("keeps xueqiu hot stock ranking on market-move semantics instead of generic news fallback", () => {
    const raw = createXueqiuHotstockFixture()
    const payload = JSON.parse(raw.payload_json)
    const resolved = resolveEventClassification(raw.source_id, raw.title, payload.extra?.info)

    expect(resolved.eventType).toBe("market_move")
    expect(resolved.eventSubType).toBe("other")
    expect(getInvestmentEventFamily({
      eventType: resolved.eventType,
      eventSubType: resolved.eventSubType,
      sourceKind: resolved.profile?.sourceKind,
    })).toBe("market_move")
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
      primaryEntityName: resolved.primaryEntityName,
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
      expectedPayload: {
        actionKind: "dividend",
        announcementStage: "proposal",
        financingPath: null,
        ownershipDirection: null,
      },
    },
    {
      label: "shareholding_change",
      raw: createCninfoAnnouncementFixture({
        itemId: "cninfo-shareholding",
        secCode: "002594",
        secName: "比亚迪",
        title: "关于控股股东减持公司股份预披露公告",
        announcementTypeName: "减持预披露",
      }),
      expectedSubType: "shareholding_change",
      expectedPayload: {
        actionKind: "shareholding_change",
        announcementStage: "pre_disclosure",
        financingPath: null,
        ownershipDirection: "decrease",
      },
    },
  ])("extracts exchange announcement facts for $label", ({ raw, expectedSubType, expectedPayload }) => {
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
    expect(JSON.parse(facts[0]?.payload_json ?? "{}")).toMatchObject({
      announcementTitle: (payload.extra?.raw as { announcementTitle?: string })?.announcementTitle ?? raw.title,
      announcementTypeName: (payload.extra?.raw as { announcementTypeName?: string })?.announcementTypeName,
      securityCode: (payload.extra?.raw as { secCode?: string })?.secCode,
      securityName: (payload.extra?.raw as { secName?: string })?.secName,
      market: "A",
      isFormalDisclosure: true,
      ...expectedPayload,
    })
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

    const marchSeries = derivePeriodicSeriesMetadata({
      sourceId: march.source_id,
      sourceKind: resolveEventClassification(march.source_id, march.title, JSON.parse(march.payload_json).extra?.info).profile?.sourceKind,
      eventSubType: resolveEventClassification(march.source_id, march.title, JSON.parse(march.payload_json).extra?.info).eventSubType,
      raw: march,
      payload: JSON.parse(march.payload_json),
    })
    const aprilSeries = derivePeriodicSeriesMetadata({
      sourceId: april.source_id,
      sourceKind: resolveEventClassification(april.source_id, april.title, JSON.parse(april.payload_json).extra?.info).profile?.sourceKind,
      eventSubType: resolveEventClassification(april.source_id, april.title, JSON.parse(april.payload_json).extra?.info).eventSubType,
      raw: april,
      payload: JSON.parse(april.payload_json),
    })

    expect(identities[0]).toBe(identities[1])
    expect(identities[0]).not.toBe(identities[2])
    expect(marchSeries.seriesKey).toBe(aprilSeries.seriesKey)
    expect(marchSeries.periodKey).toBe("2026-03")
    expect(aprilSeries.periodKey).toBe("2026-04")
    expect(marchSeries.releaseCadence).toBe("monthly")
    expect(aprilSeries.releaseCadence).toBe("monthly")
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
