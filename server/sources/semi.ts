import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.semi.org.cn"

function createSemiSource(path: string) {
  return defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}${path}`)
    const $ = cheerio.load(html)

    return $(".single-travel.media").map((_, element) => {
      const $item = $(element)
      const $link = $item.find("h4 a").first()
      const href = $link.attr("href")
      const title = $link.text().trim()
      const pubDate = $item.find(".columnTime span").first().text().trim()
      const summary = $item.find(".media-body p").last().text().trim()

      if (!href || !title) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate,
        extra: summary
          ? {
              info: summary,
            }
          : undefined,
      }
    }).get().filter(Boolean)
  })
}

export default defineSource({
  "semi-semiconductor": createSemiSource("/site/semi/column/26595298402893851.html"),
  "semi-data": createSemiSource("/site/semi/column/26595298402893853.html"),
})
