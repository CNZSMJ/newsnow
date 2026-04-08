import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.nhsa.gov.cn"

export default defineSource({
  "nhsa-dynamic": defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}/col/col14/index.html`)
    const records = [...html.matchAll(/<record><!\[CDATA\[(.*?)\]\]><\/record>/gs)]

    return records.flatMap(([, snippet]) => {
      const $ = cheerio.load(snippet)
      const $link = $("a").first()
      const href = $link.attr("href")
      const title = $link.attr("title")?.trim() || $link.text().trim()
      const pubDate = $("span").text().trim()

      if (!href || !title) return []

      return [{
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate: pubDate || undefined,
      }]
    })
  }),
})
