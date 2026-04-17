import type { NewsItem, SourceID } from "@shared/types"
import type { RawItemRow } from "#/types"

export function createFixtureRawRow(input: {
  sourceId: SourceID
  itemId: string
  title: string
  url: string
  publishedAt: number
  payload: NewsItem
}): RawItemRow {
  return {
    raw_id: `raw_${input.sourceId}_${input.itemId}`,
    source_id: input.sourceId,
    source_item_id: input.itemId,
    title: input.title,
    url: input.url,
    mobile_url: null,
    published_at: input.publishedAt,
    fetched_at: input.publishedAt + 60_000,
    fingerprint: `${input.title}|${input.url}`,
    payload_json: JSON.stringify(input.payload),
    status: "active",
  }
}

export function createChinamoneyFdr007Fixture() {
  const payload: NewsItem = {
    id: "fdr007-2026-04-11",
    title: "FDR007 1.4550%",
    url: "https://www.chinamoney.com.cn/chinese/bkfrr/20260411/1001.html",
    pubDate: "2026-04-11 11:30:00",
    extra: {
      diff: -5.5,
      raw: {
        productCode: "FDR007",
        showDateCN: "2026-04-11",
        shibor: "1.4550",
      },
    },
  }

  return createFixtureRawRow({
    sourceId: "chinamoney-fdr007",
    itemId: "fdr007-2026-04-11",
    title: payload.title,
    url: payload.url,
    publishedAt: Date.parse("2026-04-11T11:30:00+08:00"),
    payload,
  })
}

export function createPbcOmoFixture() {
  const payload: NewsItem = {
    id: "omo-2026-04-11",
    title: "2026年4月11日公开市场业务交易公告",
    url: "https://www.pbc.gov.cn/mock/omo-20260411.html",
    pubDate: "2026-04-11 09:20:30",
    extra: {
      hover: "为保持银行体系流动性充裕，2026年4月11日中国人民银行以固定利率、数量招标方式开展了20亿元7天期逆回购操作，操作利率为1.40%。",
      raw: {
        href: "/mock/omo-20260411.html",
        description: "为保持银行体系流动性充裕，2026年4月11日中国人民银行以固定利率、数量招标方式开展了20亿元7天期逆回购操作，操作利率为1.40%。",
      },
    },
  }

  return createFixtureRawRow({
    sourceId: "pbc-omo",
    itemId: "omo-2026-04-11",
    title: payload.title,
    url: payload.url,
    publishedAt: Date.parse("2026-04-11T09:20:30+08:00"),
    payload,
  })
}

export function createHkexResumeFixtures() {
  const base = {
    newsId: 12102395,
    sTxt: "公告及通告 - [內幕消息 / 其他-業務發展最新情況 / 其他-訴訟 ...]",
    title: "復牌進度季度更新之補...",
    webPath: "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0410/2026041001464_c.pdf",
    stock: [
      {
        sc: "00176",
        sn: "先機企業集團",
      },
    ],
  }

  const publishedAt = Date.parse("2026-04-10T21:59:00+08:00")
  return ([
    "hkexnews-latest",
    "hkexnews-results",
    "hkexnews-halt",
  ] as const).map((sourceId) => {
    const payload: NewsItem = {
      id: String(base.newsId),
      title: `${base.stock[0].sn}：${base.title}`,
      url: base.webPath,
      pubDate: "2026-04-10 21:59:00",
      extra: {
        info: `${base.stock[0].sc} · ${base.sTxt}`,
        raw: base,
      },
    }

    return createFixtureRawRow({
      sourceId,
      itemId: String(base.newsId),
      title: payload.title,
      url: payload.url,
      publishedAt,
      payload,
    })
  })
}

export function createClsOmoFixture() {
  const payload: NewsItem = {
    id: "cls-omo-2026-04-12",
    title: "央行开展20亿元7天期逆回购操作，操作利率1.40%",
    url: "https://www.cls.cn/detail/omo-20260412",
    pubDate: "2026-04-12 09:21:00",
    extra: {
      hover: "财联社4月12日电，央行公开市场开展20亿元7天期逆回购操作，操作利率1.40%。",
      raw: {
        description: "财联社4月12日电，央行公开市场开展20亿元7天期逆回购操作，操作利率1.40%。",
      },
    },
  }

  return createFixtureRawRow({
    sourceId: "cls-telegraph",
    itemId: "cls-omo-2026-04-12",
    title: payload.title,
    url: payload.url,
    publishedAt: Date.parse("2026-04-12T09:21:00+08:00"),
    payload,
  })
}

export function createClsInterpretationFixture() {
  const payload: NewsItem = {
    id: "cls-analysis-2026-04-12",
    title: "季报高增长 六氟磷酸锂+电解液+储能，一季度净利润同比实现“翻倍”！这家公司拥有3.6万吨六氟磷酸锂产能、1万吨VC产能，受益于旺季到来，6F及添加剂涨价将为企业带来业绩弹性",
    url: "https://www.cls.cn/detail/2341628",
    pubDate: "2026-04-12 22:58:00",
    extra: {
      hover: "①六氟磷酸锂+电解液+储能，一季度净利润同比实现“翻倍”！这家公司拥有3.6万吨六氟磷酸锂产能、1万吨VC产能，受益于旺季到来，6F及添加剂涨价将为企业带来业绩弹性。4月4日19:41《电报解读》追踪到“储能电芯供不应求，头部企业订单已排期至明年”，随即展开梳理。本文提及鹏辉能源，其4日最高涨18.35%。",
      raw: {
        abstract: "六氟磷酸锂+电解液+储能，一季度净利润同比实现“翻倍”！这家公司拥有3.6万吨六氟磷酸锂产能、1万吨VC产能。",
        description: "4月4日19:41《电报解读》追踪到“储能电芯供不应求，头部企业订单已排期至明年”，随即展开梳理。本文提及鹏辉能源，其4日最高涨18.35%。",
        previewText: "六氟磷酸锂+电解液+储能，一季度净利润同比实现“翻倍”！这家公司拥有3.6万吨六氟磷酸锂产能、1万吨VC产能。4月4日19:41《电报解读》追踪到“储能电芯供不应求，头部企业订单已排期至明年”，随即展开梳理。本文提及鹏辉能源，其4日最高涨18.35%。",
      },
    },
  }

  return createFixtureRawRow({
    sourceId: "cls-telegraph",
    itemId: "cls-analysis-2026-04-12",
    title: payload.title,
    url: payload.url,
    publishedAt: Date.parse("2026-04-12T22:58:00+08:00"),
    payload,
  })
}

export function createEastmoneyMarketMoveFixture() {
  const payload: NewsItem = {
    id: "eastmoney-market-2026-04-12",
    title: "沪指跌超1%，超4200只个股下跌",
    url: "https://kuaixun.eastmoney.com/a/20260412-marketmove",
    pubDate: "2026-04-12 10:36:00",
    extra: {
      hover: "A股三大指数盘中走低，沪指跌超1%，超4200只个股下跌。",
      raw: {
        description: "A股三大指数盘中走低，沪指跌超1%，超4200只个股下跌。",
      },
    },
  }

  return createFixtureRawRow({
    sourceId: "eastmoney-7x24",
    itemId: "eastmoney-market-2026-04-12",
    title: payload.title,
    url: payload.url,
    publishedAt: Date.parse("2026-04-12T10:36:00+08:00"),
    payload,
  })
}

export function createXueqiuHotstockFixture() {
  const payload: NewsItem = {
    id: "SH688256",
    title: "寒武纪",
    url: "https://xueqiu.com/s/SH688256",
    extra: {
      info: "12.5% SH",
      raw: {
        code: "SH688256",
        name: "寒武纪",
        percent: 12.5,
        exchange: "SH",
      },
    },
  }

  return createFixtureRawRow({
    sourceId: "xueqiu-hotstock",
    itemId: "SH688256",
    title: payload.title,
    url: payload.url,
    publishedAt: Date.parse("2026-04-12T10:36:00+08:00"),
    payload,
  })
}

export function createCninfoAnnouncementFixture(input: {
  itemId: string
  secCode: string
  secName: string
  title: string
  announcementTypeName?: string
}) {
  const publishedAt = Date.parse("2026-04-11T20:00:00+08:00")
  const raw = {
    secCode: input.secCode,
    secName: input.secName,
    announcementId: input.itemId,
    announcementTitle: input.title,
    announcementTime: publishedAt,
    adjunctUrl: `/pdf/${input.itemId}.pdf`,
    announcementTypeName: input.announcementTypeName ?? null,
  }

  const payload: NewsItem = {
    id: input.itemId,
    title: `${input.secName}：${input.title}`,
    url: `https://static.cninfo.com.cn/pdf/${input.itemId}.pdf`,
    pubDate: "2026-04-11 20:00:00",
    extra: {
      info: [input.secCode, input.announcementTypeName].filter(Boolean).join(" · ") || undefined,
      raw,
    },
  }

  return createFixtureRawRow({
    sourceId: "cninfo-szse",
    itemId: input.itemId,
    title: payload.title,
    url: payload.url,
    publishedAt,
    payload,
  })
}

export function createChinaisaIndustryFixture(input: {
  itemId: string
  title: string
  summary?: string
  sourceId?: "chinaisa-stats" | "chinaisa-analysis"
  publishedAt?: number
}) {
  const publishedAt = input.publishedAt ?? Date.parse("2026-04-11T10:00:00+08:00")
  const payload: NewsItem = {
    id: input.itemId,
    title: input.title,
    url: `https://www.chinaisa.org.cn/article/${input.itemId}.html`,
    pubDate: new Date(publishedAt).toISOString(),
    extra: {
      info: input.summary,
    },
  }

  return createFixtureRawRow({
    sourceId: input.sourceId ?? "chinaisa-stats",
    itemId: input.itemId,
    title: payload.title,
    url: payload.url,
    publishedAt,
    payload,
  })
}

export function createChinapvPolicyFixture(input?: {
  itemId?: string
  title?: string
  summary?: string
}) {
  const publishedAt = Date.parse("2026-04-12T09:30:00+08:00")
  const payload: NewsItem = {
    id: input?.itemId ?? "chinapv-policy-1",
    title: input?.title ?? "关于促进光伏行业高质量发展的实施意见",
    url: `https://www.chinapv.org.cn/policy/${input?.itemId ?? "chinapv-policy-1"}.html`,
    pubDate: "2026-04-12",
    extra: {
      info: input?.summary ?? "推动光伏产业提质增效。",
    },
  }

  return createFixtureRawRow({
    sourceId: "chinapv-policy",
    itemId: String(payload.id),
    title: payload.title,
    url: payload.url,
    publishedAt,
    payload,
  })
}
