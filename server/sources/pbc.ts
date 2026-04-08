import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.pbc.gov.cn"

const news = defineSource(async () => {
  const html = await myFetch<string>(`${baseUrl}/goutongjiaoliu/113456/113469/index.html`)
  const $ = cheerio.load(html)

  return $("td[align='left']").map((_, element) => {
    const $item = $(element)
    const $link = $item.find("a[istitle='true']").first()
    const href = $link.attr("href")
    const title = $link.attr("title")?.trim() || $link.text().trim()
    const pubDate = $item.find(".hui12").first().text().trim()

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
  "pbc": news,
  "pbc-news": news,
})
