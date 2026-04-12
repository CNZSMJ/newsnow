import { describe, expect, it } from "vitest"
import { resolveEventClassification } from "#/services/event-engine/resolver"

describe("resolveEventClassification", () => {
  it("classifies exchange disclosures into earnings", () => {
    const resolved = resolveEventClassification(
      "cninfo-sse",
      "贵州茅台：2025年年度报告",
      null,
    )

    expect(resolved.eventType).toBe("announcement")
    expect(resolved.eventSubType).toBe("earnings")
    expect(resolved.profile?.sourceKind).toBe("exchange_disclosure")
  })

  it("classifies media fast monetary policy items with policy subtype", () => {
    const resolved = resolveEventClassification(
      "jin10",
      "中国央行今日开展7天逆回购操作，中标利率1.40%",
      null,
    )

    expect(resolved.eventType).toBe("policy")
    expect(resolved.eventSubType).toBe("monetary_policy")
    expect(resolved.profile?.sourceKind).toBe("media_fast_feed")
  })

  it("classifies media fast rate fixing items into macro rate fixing", () => {
    const resolved = resolveEventClassification(
      "jin10",
      "FDR007最新报1.45%，较上日下行5BP",
      null,
    )

    expect(resolved.eventType).toBe("macro")
    expect(resolved.eventSubType).toBe("rate_fixing")
  })

  it("treats teaser-style media interpretation items as analysis signals instead of earnings disclosures", () => {
    const resolved = resolveEventClassification(
      "cls-telegraph",
      "季报高增长 六氟磷酸锂+电解液+储能，一季度净利润同比实现“翻倍”！这家公司拥有3.6万吨六氟磷酸锂产能、1万吨VC产能",
      "4月4日19:41《电报解读》追踪到“储能电芯供不应求”，随即展开梳理。本文提及鹏辉能源，其4日最高涨18.35%。",
    )

    expect(resolved.eventType).toBe("news")
    expect(resolved.eventSubType).toBe("analysis_signal")
    expect(resolved.primaryEntityName).toBe("鹏辉能源")
  })

  it("keeps industry policy notices as policy events with industrial policy subtype", () => {
    const resolved = resolveEventClassification(
      "chinapv-policy",
      "关于促进光伏行业高质量发展的实施意见",
      null,
    )

    expect(resolved.eventType).toBe("policy")
    expect(resolved.eventSubType).toBe("industrial_policy")
    expect(resolved.profile?.sourceKind).toBe("industry_policy_notice")
  })

  it("treats ipo listing docs as financing instead of listing status", () => {
    const resolved = resolveEventClassification(
      "cninfo-sse",
      "联讯仪器：联讯仪器首次公开发行股票并在科创板上市发行公告",
      null,
    )

    expect(resolved.eventType).toBe("announcement")
    expect(resolved.eventSubType).toBe("financing")
  })

  it("suppresses broad source tags when title has no sector-specific signal", () => {
    const resolved = resolveEventClassification(
      "stats-industry",
      "2026年1—2月份全国固定资产投资同比增长1.8%",
      null,
    )

    expect(resolved.topicTags).toEqual([])
  })

  it("narrows broad source tags when title contains sector-specific keywords", () => {
    const resolved = resolveEventClassification(
      "stats-industry",
      "2026年一季度集成电路产量增长情况",
      null,
    )

    expect(resolved.topicTags).toContain("semiconductor")
    expect(resolved.topicTags).not.toContain("medicine")
  })

  it("extracts official policy主体 from spokesman titles", () => {
    const resolved = resolveEventClassification(
      "mofcom-spokesperson",
      "商务部新闻发言人就美贸易代表办公室宣布对华相关措施答记者问",
      null,
    )

    expect(resolved.primaryEntityName).toBe("商务部")
  })

  it("treats industry news feeds as industry news instead of industry data", () => {
    const resolved = resolveEventClassification(
      "caam-nev-news",
      "日本或将对国产电动汽车电池和半导体实行税收减免",
      null,
    )

    expect(resolved.eventType).toBe("industry")
    expect(resolved.eventSubType).toBe("industry_news")
    expect(resolved.profile?.sourceKind).toBe("industry_news_feed")
  })

  it("keeps industry report feeds separate from industry statistics", () => {
    const resolved = resolveEventClassification(
      "caict-ai-reports",
      "中国算力发展指数白皮书（2026年）发布",
      null,
    )

    expect(resolved.eventType).toBe("industry")
    expect(resolved.eventSubType).toBe("industry_data")
    expect(resolved.profile?.sourceKind).toBe("industry_report_release")
  })
})
