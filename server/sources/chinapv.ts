import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.chinapv.org.cn"

export default defineSource({
  "chinapv-policy": defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}/StaticPage/association_list28_1.html`)
    const $ = cheerio.load(html)

    return $("#list .list > ul > li").map((_, element) => {
      const $item = $(element)
      const $link = $item.find(".text > a").first()
      const href = $link.attr("href") || $item.find(".img a").attr("href")
      const title = $item.find(".h1").text().trim()
      const pubDate = $item.find(".sj").text().match(/\d{4}-\d{2}-\d{2}/)?.[0]
      const summary = $item.find(".p").text().trim()

      if (!href || !title) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate,
        extra: {
          info: summary || undefined,
        },
      }
    }).get().filter(Boolean)
  }),
})
