import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.szse.cn"

const latest = defineSource(async () => {
  const html = await myFetch<string>(`${baseUrl}/index/index.html`)
  const $ = cheerio.load(html)

  return $("h3.title a[href*='aboutus/trends/news/t']").map((_, element) => {
    const $link = $(element)
    const href = $link.attr("href")
    const title = $link.text().trim()

    if (!href || !title) return undefined

    const matched = href.match(/t(\d{4})(\d{2})(\d{2})_/)
    const pubDate = matched ? `${matched[1]}-${matched[2]}-${matched[3]}` : undefined

    return {
      id: href,
      title,
      url: new URL(href, baseUrl).toString(),
      pubDate,
    }
  }).get().filter(Boolean)
})

export default defineSource({
  "szse": latest,
  "szse-news": latest,
})
