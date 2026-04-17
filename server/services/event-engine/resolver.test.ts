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
    expect(resolved.eventSubType).toBe("industry_report")
    expect(resolved.profile?.sourceKind).toBe("industry_report_release")
  })

  it("treats xueqiu hot stock ranking as market move feed instead of generic news", () => {
    const resolved = resolveEventClassification(
      "xueqiu-hotstock",
      "寒武纪",
      "12.5% SH",
    )

    expect(resolved.eventType).toBe("market_move")
    expect(resolved.eventSubType).toBe("other")
    expect(resolved.profile?.sourceKind).toBe("media_fast_feed")
  })

  it("treats szse news as official exchange notice instead of generic news", () => {
    const resolved = resolveEventClassification(
      "szse-news",
      "深交所发布关于优化创业板ETF申购赎回机制的通知",
      null,
    )

    expect(resolved.eventType).toBe("policy")
    expect(resolved.profile?.sourceKind).toBe("official_policy_notice")
  })

  it("keeps generic exchange disclosures on disclosure semantics instead of inventing subtype", () => {
    const resolved = resolveEventClassification(
      "cninfo-szse",
      "宁德时代：关于召开2026年第一次临时股东大会的通知",
      null,
    )

    expect(resolved.eventType).toBe("announcement")
    expect(resolved.eventSubType).toBe("other")
    expect(resolved.profile?.sourceKind).toBe("exchange_disclosure")
  })

  it("keeps explicit shareholding-change announcements classified as shareholding_change", () => {
    const resolved = resolveEventClassification(
      "cninfo-szse",
      "宁德时代：控股股东及其一致行动人减持股份预披露公告",
      null,
    )

    expect(resolved.eventType).toBe("announcement")
    expect(resolved.eventSubType).toBe("shareholding_change")
    expect(resolved.profile?.sourceKind).toBe("exchange_disclosure")
  })

  it("strips event-container suffixes from primary entity names in industry news titles", () => {
    const resolved = resolveEventClassification(
      "semi-semiconductor",
      "台积电法说会：AI需求极为强劲，供不应求将持续至至少2027年",
      "魏哲家称，对2026年台积全年营收以美元计成长超过30%充满信心。",
    )

    expect(resolved.eventType).toBe("industry")
    expect(resolved.eventSubType).toBe("industry_news")
    expect(resolved.primaryEntityName).toBe("台积电")
  })

  it("strips event-container variants such as 业绩会实录 and 电话会定调 from primary entities", () => {
    const earningsCall = resolveEventClassification(
      "wallstreetcn-quick",
      "兴业证券业绩会实录：下一步怎么做？",
      null,
    )
    const phoneCall = resolveEventClassification(
      "wallstreetcn-quick",
      "阿斯麦电话会定调：存储客户今年产能已售罄，长单托底，非EUV增长“周期性拐点确立”",
      null,
    )

    expect(earningsCall.primaryEntityName).toBe("兴业证券")
    expect(phoneCall.primaryEntityName).toBe("阿斯麦")
  })

  it("recovers issuer names from media fast release headlines and suppresses non-entity phone-call phrases", () => {
    const huaweiRelease = resolveEventClassification(
      "jin10",
      "华为新款鸿蒙电脑4月20日发布",
      "金十数据4月14日讯，4月14日，华为官宣华为MateBook 14鸿蒙版将于4月20日HUAWEI Pura系列及全场景新品发布会上正式发布，该机将搭载云晰柔光屏与波点艺术圆键盘设计。",
    )
    const ministerCall = resolveEventClassification(
      "sina-7x24",
      "伊朗外长与俄罗斯外长举行电话会谈 讨论地区局势发展 当地时间13日，伊朗外交部长阿拉格齐与俄罗斯外交部长拉夫罗夫通电话，双方就最新地区局势发展以及在巴基斯坦伊斯兰堡举行的伊美会谈交换了意见。（央视新闻）",
      null,
    )

    expect(huaweiRelease.primaryEntityName).toBe("华为")
    expect(ministerCall.primaryEntityName).toBeUndefined()
  })
})
