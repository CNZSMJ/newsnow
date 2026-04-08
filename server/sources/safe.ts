import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.safe.gov.cn"

const latest = defineSource(async () => {
  const html = await myFetch<string>(`${baseUrl}/`)
  const $ = cheerio.load(html)

  const items = $("dt a[href^='/safe/20']").map((_, element) => {
    const $link = $(element)
    const href = $link.attr("href")
    const title = $link.attr("title")?.trim() || $link.text().trim()

    if (!href || !title) return undefined

    return {
      id: href,
      title,
      url: new URL(href, baseUrl).toString(),
    }
  }).get().filter(Boolean)

  return items
})

export default defineSource({
  "safe": latest,
  "safe-latest": latest,
})
