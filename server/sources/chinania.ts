import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.chinania.org.cn"

function createChinaNiaSource(path: string, selector: string) {
  return defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}${path}`)
    const $ = cheerio.load(html)

    return $(selector).map((_, element) => {
      const $item = $(element)
      const $link = $item.find("a").first()
      const href = $link.attr("href")
      const texts = $item.find("p").map((__, p) => $(p).text().trim()).get().filter(Boolean)
      const title = texts[0] || $link.text().trim()
      const pubDate = texts.find(text => /^\d{4}-\d{2}-\d{2}$/.test(text))

      if (!href || !title) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate,
      }
    }).get().filter(Boolean)
  })
}

export default defineSource({
  "chinania-stats": createChinaNiaSource("/html/hangyetongji/jqzs/", ".notice_list_ul > li"),
  "chinania-policy": createChinaNiaSource("/html/zcfg/zhengcefagui/", ".notice_list_ul > li"),
  "chinania-news": createChinaNiaSource("/html/hangyexinwen/guoneixinwen/", ".notice_list_ul > li"),
})
