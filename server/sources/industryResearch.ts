import * as cheerio from "cheerio"
import type { NewsItem } from "@shared/types"
import { rss2json } from "#/utils/rss2json"
import { defineSource } from "#/utils/source"

type Keyword = string | RegExp

interface GenericPageExtractionOptions {
  html: string
  baseUrl: string
  keywords?: Keyword[]
  limit?: number
}

interface GenericSourceOptions {
  url: string
  keywords?: Keyword[]
  limit?: number
}

const semiconductorKeywords = [
  /semiconductor/i,
  /chip/i,
  /wafer/i,
  /foundry/i,
  /memory/i,
  /HBM/i,
  /DRAM/i,
  /NAND/i,
  /advanced packaging/i,
  /半导体|芯片|晶圆|存储|先进封装/,
]

const cloudInfrastructureKeywords = [
  /AI server/i,
  /cloud/i,
  /data center/i,
  /infrastructure/i,
  /server/i,
  /GPU/i,
  /accelerator/i,
  /hyperscale/i,
  /云|服务器|数据中心|智算|算力|液冷/,
]

const opticalKeywords = [
  /optical/i,
  /transceiver/i,
  /coherent/i,
  /telecom/i,
  /datacom/i,
  /routing/i,
  /switching/i,
  /broadband/i,
  /光模块|光通信|通信设备|光传输|交换机/,
]

const batteryKeywords = [
  /battery/i,
  /EV/i,
  /energy storage/i,
  /lithium/i,
  /cathode/i,
  /anode/i,
  /动力电池|储能电池|锂电|装车量|装机量/,
]

const photovoltaicKeywords = [
  /solar/i,
  /photovoltaic/i,
  /PV/i,
  /module/i,
  /polysilicon/i,
  /光伏|太阳能|组件|硅片|硅料|电池片/,
]

const roboticsKeywords = [
  /robot/i,
  /automation/i,
  /industrial control/i,
  /machine vision/i,
  /机器人|自动化|工控|机器视觉/,
]

const manufacturingKeywords = [
  /manufacturing/i,
  /industrial/i,
  /export/i,
  /import/i,
  /trade/i,
  /ICT/i,
  /制造业|工业|进出口|外贸|智能制造|信通|赛迪/,
]

function normalizeText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function matchesKeywords(value: string, keywords?: Keyword[]) {
  if (!keywords?.length) return true
  const normalized = value.toLowerCase()
  return keywords.some((keyword) => {
    if (typeof keyword === "string") {
      return normalized.includes(keyword.toLowerCase())
    }
    return keyword.test(value)
  })
}

function extractDate($container: cheerio.Cheerio<any>) {
  const datetime = normalizeText($container.find("time").first().attr("datetime"))
    || normalizeText($container.find("time").first().text())
  if (datetime) return datetime

  const text = normalizeText($container.text())
  return text.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/)?.[0]
    ?? text.match(/\d{4}年\d{1,2}月\d{1,2}日/)?.[0]
    ?? text.match(/[A-Z][a-z]+ \d{1,2}, \d{4}/)?.[0]
}

function extractSummary($container: cheerio.Cheerio<any>, title: string) {
  const summary = normalizeText($container.find("p, .summary, .desc, .description").first().text())
  if (!summary || summary === title) return undefined
  return summary.length > 240 ? `${summary.slice(0, 237)}...` : summary
}

function isUsefulTitle(title: string) {
  if (title.length < 6) return false
  if (/^>{2,}\s*more$/i.test(title)) return false
  if (/\b(?:rss feed|printfriendly|supply chain analytics platform)\b/i.test(title)) return false
  if (/^(?:home|about|contact|subscribe|login|register|privacy|terms|more|learn more|read more|what we do|market research|research|products?|services?|solutions?|platform|events?|webinars?|spot price|pricing|linkedin|twitter|x|facebook|youtube|instagram|wechat|rss)$/i.test(title)) return false
  return true
}

function isNavigationLink($link: cheerio.Cheerio<any>) {
  return Boolean($link.closest("nav, header, footer, aside, [role='navigation'], .nav, .navbar, .menu, .site-header, .site-footer").length)
}

function isNewsItem(item: NewsItem | undefined): item is NewsItem {
  return Boolean(item)
}

export function extractGenericIndustryPageItems(options: GenericPageExtractionOptions): NewsItem[] {
  const $ = cheerio.load(options.html)
  const seen = new Set<string>()
  const items: NewsItem[] = []

  $("a[href]").each((_, element) => {
    if (items.length >= (options.limit ?? 30)) return false

    const $link = $(element)
    if (isNavigationLink($link)) return

    const href = normalizeText($link.attr("href"))
    if (!href || href.startsWith("#") || /^(?:javascript|mailto|tel):/i.test(href)) return

    const title = normalizeText($link.attr("title") || $link.attr("aria-label") || $link.text())
    if (!isUsefulTitle(title)) return

    let url: string
    try {
      url = new URL(href, options.baseUrl).toString()
    } catch {
      return
    }

    if (seen.has(url)) return

    const $specificContainer = $link.closest("article, li, .news-item, .post, .card, .item, .media, .views-row, .list-item")
    const $container = $specificContainer.length ? $specificContainer : $link.closest("div")
    if (!$specificContainer.length && normalizeText($container.text()).length > 1500) return

    const context = normalizeText(`${title} ${$container.text()}`)
    if (!matchesKeywords(context, options.keywords)) return

    seen.add(url)
    const summary = extractSummary($container, title)
    items.push({
      id: url,
      title,
      url,
      pubDate: extractDate($container),
      extra: summary
        ? {
            info: summary,
          }
        : undefined,
    })
  })

  return items
}

function createGenericPageSource(options: GenericSourceOptions) {
  return defineSource(async () => {
    const html = await myFetch<string>(options.url)
    return extractGenericIndustryPageItems({
      html,
      baseUrl: options.url,
      keywords: options.keywords,
      limit: options.limit,
    })
  })
}

function createRssIndustrySource(url: string, options?: { keywords?: Keyword[], limit?: number }) {
  return defineSource(async () => {
    const data = await rss2json(url)
    const items = data?.items ?? []
    return items
      .map((item): NewsItem | undefined => {
        if (!item.link || !item.title) return undefined
        return {
          id: item.link,
          title: item.title,
          url: item.link,
          pubDate: item.created,
          extra: item.description
            ? {
                info: normalizeText(item.description),
              }
            : undefined,
        }
      })
      .filter(isNewsItem)
      .filter(item => matchesKeywords(`${item.title} ${item.extra?.info ?? ""}`, options?.keywords))
      .slice(0, options?.limit ?? 30)
  })
}

export default defineSource({
  "gartner-newsroom": createGenericPageSource({
    url: "https://www.gartner.com/en/newsroom",
    keywords: [...semiconductorKeywords, ...cloudInfrastructureKeywords],
  }),
  "omdia-semiconductor": createGenericPageSource({
    url: "https://omdia.tech.informa.com/pr",
    keywords: semiconductorKeywords,
  }),
  "omdia-cloud-infrastructure": createGenericPageSource({
    url: "https://omdia.tech.informa.com/pr",
    keywords: cloudInfrastructureKeywords,
  }),
  "omdia-optical-communications": createGenericPageSource({
    url: "https://omdia.tech.informa.com/pr",
    keywords: opticalKeywords,
  }),
  "trendforce-semiconductor": createRssIndustrySource("https://www.trendforce.com/feed/Semiconductors.html", {
    keywords: [...semiconductorKeywords, ...cloudInfrastructureKeywords],
  }),
  "techinsights-semiconductor": createGenericPageSource({
    url: "https://www.techinsights.com/technical-capabilities/overview/markets-served/semiconductors",
    keywords: [...semiconductorKeywords, ...cloudInfrastructureKeywords],
  }),
  "yole-semiconductor": createGenericPageSource({
    url: "https://www.yolegroup.com/press-releases/",
    keywords: semiconductorKeywords,
  }),
  "wsts-press": createGenericPageSource({
    url: "https://www.wsts.org/",
    keywords: semiconductorKeywords,
  }),
  "idc-cloud-infrastructure": createRssIndustrySource("https://www.idc.com/rss/idcpressreleases.xml", {
    keywords: cloudInfrastructureKeywords,
  }),
  "canalys-cloud-infrastructure": createGenericPageSource({
    url: "https://www.canalys.com/newsroom",
    keywords: cloudInfrastructureKeywords,
  }),
  "lightcounting-newsletter": createGenericPageSource({
    url: "https://www.lightcounting.com/newsletter",
    keywords: [...opticalKeywords, ...cloudInfrastructureKeywords],
  }),
  "delloro-telecom": createGenericPageSource({
    url: "https://www.delloro.com/news/",
    keywords: [...opticalKeywords, ...cloudInfrastructureKeywords],
  }),
  "cignal-ai-optical": createGenericPageSource({
    url: "https://www.cignal.ai/news/",
    keywords: opticalKeywords,
  }),
  "sne-research-battery": createGenericPageSource({
    url: "https://sneresearch.com/en/insight/release/",
    keywords: batteryKeywords,
  }),
  "cabia-battery": createGenericPageSource({
    url: "https://batteryalliancechina.org/about",
    keywords: batteryKeywords,
  }),
  "ggii-battery": createGenericPageSource({
    url: "https://www.gg-ii.com/",
    keywords: batteryKeywords,
  }),
  "ggii-robotics": createGenericPageSource({
    url: "https://www.gg-ii.com/",
    keywords: roboticsKeywords,
  }),
  "evtank-battery": createGenericPageSource({
    url: "http://www.evtank.cn/",
    keywords: batteryKeywords,
  }),
  "chinapv-news": createGenericPageSource({
    url: "https://www.chinapv.org.cn/",
    keywords: photovoltaicKeywords,
  }),
  "infolink-solar": createGenericPageSource({
    url: "https://www.infolink-group.com/energy-article",
    keywords: photovoltaicKeywords,
  }),
  "woodmac-renewables": createGenericPageSource({
    url: "https://www.woodmac.com/news/",
    keywords: [...photovoltaicKeywords, ...batteryKeywords],
  }),
  "bnef-energy-transition": createGenericPageSource({
    url: "https://about.bnef.com/insights/",
    keywords: [...photovoltaicKeywords, ...batteryKeywords],
  }),
  "ifr-robotics": createGenericPageSource({
    url: "https://ifr.org/ifr-press-releases/",
    keywords: roboticsKeywords,
  }),
  "mir-automation": createGenericPageSource({
    url: "https://www.mirdatabank.com/news",
    keywords: roboticsKeywords,
  }),
  "customs-manufacturing": createGenericPageSource({
    url: "https://english.customs.gov.cn/Statistics/Statistics?ColumnId=1",
    keywords: manufacturingKeywords,
  }),
  "ccid-consulting": createGenericPageSource({
    url: "https://www.ccidconsulting.com/en/",
    keywords: [...manufacturingKeywords, ...semiconductorKeywords, ...cloudInfrastructureKeywords, ...roboticsKeywords],
  }),
  "caict-reports": createGenericPageSource({
    url: "https://gma.caict.ac.cn/plat/news/full-collection-of-blue-books-and-report-published-by-caict-in-2025",
    keywords: [...manufacturingKeywords, ...cloudInfrastructureKeywords, ...opticalKeywords],
  }),
})
