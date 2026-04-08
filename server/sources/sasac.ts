import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "http://www.sasac.gov.cn"

const latest = defineSource(async () => {
  const html = await myFetch<string>(`${baseUrl}/n2588025/n2588119/index.html`)
  const $ = cheerio.load(html)

  return $("li").map((_, element) => {
    const $item = $(element)
    const $link = $item.find("a[href*='content.html']").first()
    const href = $link.attr("href")
    const title = $link.attr("title")?.trim() || $link.text().trim()
    const pubDate = $item.find("span").last().text().replace(/^\[|\]$/g, "").trim()

    if (!href || !title) return undefined

    return {
      id: href,
      title,
      url: new URL(href, baseUrl).toString(),
      pubDate: pubDate || undefined,
    }
  }).get().filter(Boolean)
})

export default defineSource({
  "sasac": latest,
  "sasac-latest": latest,
})
