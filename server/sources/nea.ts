import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.nea.gov.cn"

function extractDateFromHref(href: string) {
  const match = href.match(/(20\d{2})(\d{2})(\d{2})/)
  if (!match) return undefined
  return `${match[1]}-${match[2]}-${match[3]}`
}

export default defineSource({
  "nea-release": defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}/`)
    const $ = cheerio.load(html)

    return $(".pic_news .pic_box ul.list li").map((_, element) => {
      const $item = $(element)
      const $link = $item.find("a").first()
      const href = $link.attr("href")
      const title = $link.text().trim()

      if (!href || !title) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate: extractDateFromHref(href),
      }
    }).get().filter(Boolean)
  }),
})
