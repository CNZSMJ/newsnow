import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.stats.gov.cn"

export default defineSource({
  "stats-industry": defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}/sj/zxfb/`)
    const $ = cheerio.load(html)

    return $(".list-content li").map((_, element) => {
      const $item = $(element)
      const $link = $item.find("a").first()
      const href = $link.attr("href")
      const title = $link.attr("title")?.trim() || $link.text().trim()
      const pubDate = $item.find("span").text().trim()

      if (!href || !title) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate: pubDate || undefined,
      }
    }).get().filter(Boolean)
  }),
})
