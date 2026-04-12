import * as cheerio from "cheerio"
import type { NewsItem } from "@shared/types"
import { defineSource } from "#/utils/source"

const baseUrl = "https://gma.caict.ac.cn"
const aiKeywords = /算力|AI|人工智能|云计算|终端智能体|智能体|大模型|智算|AI WAN|绿色算力|算力中心|蓝皮书|专题报告/

function uniqueById<T extends NewsItem>(items: T[]) {
  return [...new Map(items.map(item => [String(item.id), item])).values()]
}

function isNewsItem(item: NewsItem | undefined): item is NewsItem {
  return Boolean(item)
}

function createNewsSource() {
  return defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}/plat/news`)
    const $ = cheerio.load(html)

    const items = $("div.col-lg-9 .row.p-2").map((_, element) => {
      const $item = $(element)
      const $link = $item.find("a[href^='/plat/news/']").first()
      const href = $link.attr("href")
      const title = $link.text().trim()
      const pubDate = $item.find("div.col-md-2 span").text().trim()

      if (!href || !title || !aiKeywords.test(title)) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate: pubDate || undefined,
      }
    }).get().filter(isNewsItem)

    return uniqueById(items)
  })
}

function createReportSource() {
  return defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}/plat/news/full-collection-of-blue-books-and-report-published-by-caict-in-2025`)
    const $ = cheerio.load(html)

    const items = $("table tbody tr").map((_, element) => {
      const $row = $(element)
      const $link = $row.find("a").first()
      const href = $link.attr("href")
      const title = $link.text().trim()
      const pubDate = $row.find("td").first().text().trim()

      if (!href || !title || !aiKeywords.test(title)) return undefined

      return {
        id: href,
        title,
        url: href,
        pubDate: pubDate || undefined,
      }
    }).get().filter(isNewsItem)

    return uniqueById(items)
  })
}

export default defineSource({
  "caict-ai-news": createNewsSource(),
  "caict-ai-reports": createReportSource(),
})
