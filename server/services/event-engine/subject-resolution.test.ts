import { describe, expect, it } from "vitest"
import { resolveEventSubjects } from "#/services/event-engine/subject-resolution"

describe("subject resolution", () => {
  it("keeps high-confidence unmapped roles alive as provisional institutions instead of dropping them", async () => {
    const result = await resolveEventSubjects({
      eventId: "evt_openai_agent_platform",
      title: "OpenAI 推出企业版智能体平台",
      summary: "高价值未映射主体样本",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "media_fast_feed",
      topicTags: [],
      affectedMarkets: ["global_macro"],
    }, {
      roleExtractor: {
        extract: async () => ({
          provider: "llm",
          confidence: 0.94,
          slots: {
            eventPhrases: ["推出企业版智能体平台"],
            explicitCompanies: ["OpenAI"],
            explicitTickers: [],
            institutions: ["OpenAI"],
            industries: [],
            markets: [],
            nonEntityPhrases: [],
            causalDrivers: [],
          },
        }),
      },
      registryResolver: {
        resolveByName: async () => null,
        resolveByCode: async () => null,
      },
    })

    expect(result.primaryEntityName).toBe("OpenAI")
    expect(result.audit.usedFallback).toBe(false)
    expect(result.entityLinks).toEqual([
      expect.objectContaining({
        entity_type: "institution",
        entity_name: "OpenAI",
        resolver: "llm-provisional-institution",
      }),
    ])
    expect(result.entityLinks.some(link => link.entity_type === "company" || link.entity_type === "stock")).toBe(false)
  })

  it("falls back deterministically when role extraction times out and still grounds explicit issuers through the registry", async () => {
    const result = await resolveEventSubjects({
      eventId: "evt_catl_buyback",
      title: "宁德时代：关于回购股份方案的公告",
      summary: "回购方案公告",
      eventType: "announcement",
      eventSubType: "buyback",
      sourceKind: "exchange_disclosure",
      topicTags: [],
      affectedMarkets: ["A"],
    }, {
      extractionTimeoutMs: 1,
      roleExtractor: {
        extract: async () => new Promise(() => {}),
      },
      registryResolver: {
        resolveByName: async (value) => value === "宁德时代"
          ? {
              code: "300750",
              fullCode: "sz300750",
              name: "宁德时代",
              exchange: "SZ",
              assetType: "stock",
            }
          : null,
        resolveByCode: async () => null,
      },
    })

    expect(result.audit.usedFallback).toBe(true)
    expect(result.audit.timedOut).toBe(true)
    expect(result.primaryEntityName).toBe("宁德时代")
    expect(result.entityLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity_type: "stock",
        entity_name: "宁德时代",
        code: "300750",
        full_code: "sz300750",
        resolver: "registry-company",
      }),
      expect.objectContaining({
        entity_type: "company",
        entity_name: "宁德时代",
        code: "300750",
        full_code: "sz300750",
        resolver: "registry-company",
      }),
    ]))
  })

  it("does not promote unresolved deterministic title phrases into provisional institutions", async () => {
    const result = await resolveEventSubjects({
      eventId: "evt_fiber_price_spike",
      title: "国产光纤全球爆单 部分产品价格暴涨650%",
      summary: "行业热度提升但未出现明确发行人或机构主体",
      eventType: "macro",
      eventSubType: "macro_data",
      sourceKind: "media_fast_feed",
      topicTags: [],
      affectedMarkets: ["A"],
      primaryEntityNameHint: "国产光纤全球爆单",
    }, {
      registryResolver: {
        resolveByName: async () => null,
        resolveByCode: async () => null,
      },
    })

    expect(result.primaryEntityName).toBeUndefined()
    expect(result.entityLinks.some(link => link.entity_type === "institution")).toBe(false)
    expect(result.entityLinks.some(link => link.entity_name.includes("光纤行"))).toBe(false)
  })

  it("does not fall back to the heuristic primary hint when no resolved subject survives arbitration", async () => {
    const result = await resolveEventSubjects({
      eventId: "evt_hype_phrase",
      title: "全球爆单引发市场关注",
      summary: "纯概括短语，没有明确公司或机构",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "media_fast_feed",
      topicTags: [],
      affectedMarkets: ["global_macro"],
      primaryEntityNameHint: "全球爆单",
    }, {
      registryResolver: {
        resolveByName: async () => null,
        resolveByCode: async () => null,
      },
    })

    expect(result.primaryEntityName).toBeUndefined()
    expect(result.entityLinks).toEqual([])
  })

  it("promotes llm-derived investable industry clues into follow-up subjects when no issuer is explicit", async () => {
    const result = await resolveEventSubjects({
      eventId: "evt_fiber_watch_targets",
      title: "国产光纤全球爆单 部分产品价格暴涨650%",
      summary: "行业价格与订单同时走强，但未点名具体上市公司。",
      eventType: "macro",
      eventSubType: "macro_data",
      sourceKind: "media_fast_feed",
      topicTags: [],
      affectedMarkets: ["A"],
      primaryEntityNameHint: "国产光纤全球爆单",
    }, {
      roleExtractor: {
        extract: async () => ({
          provider: "llm",
          confidence: 0.88,
          slots: {
            eventPhrases: ["光纤行业量价齐升"],
            explicitCompanies: [],
            explicitTickers: [],
            institutions: [],
            industries: ["光纤"],
            markets: ["A股"],
            nonEntityPhrases: ["国产光纤全球爆单"],
            causalDrivers: ["订单增长", "价格上涨"],
          },
        }),
      },
      registryResolver: {
        resolveByName: async () => null,
        resolveByCode: async () => null,
      },
    })

    expect(result.primaryEntityName).toBe("光纤")
    expect(result.entityLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity_type: "industry",
        entity_name: "光纤",
        resolver: "llm-industry",
      }),
    ]))
    expect(result.entityLinks.some(link => link.entity_type === "company" || link.entity_type === "stock")).toBe(false)
  })

  it("keeps sanitized container-title issuers alive as deterministic provisional institutions", async () => {
    const result = await resolveEventSubjects({
      eventId: "evt_tsmc_briefing",
      title: "台积电法说会：AI需求极为强劲，供不应求将持续至至少2027年",
      summary: "魏哲家称，对2026年台积全年营收以美元计成长超过30%充满信心。",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "media_analysis",
      topicTags: ["ai-computing"],
      affectedMarkets: ["A", "HK"],
      primaryEntityNameHint: "台积电",
    }, {
      registryResolver: {
        resolveByName: async () => null,
        resolveByCode: async () => null,
      },
    })

    expect(result.primaryEntityName).toBe("台积电")
    expect(result.entityLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity_type: "institution",
        entity_name: "台积电",
        resolver: "deterministic-provisional-institution",
      }),
    ]))
  })
})
