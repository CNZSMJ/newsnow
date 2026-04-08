import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.mof.gov.cn"

const latest = defineSource(async () => {
  const html = await myFetch<string>(`${baseUrl}/zhengwuxinxi/caizhengxinwen/`)
  const $ = cheerio.load(html)

  return $(".xwfb_listbox li").map((_, element) => {
    const $item = $(element)
    const $link = $item.find("a").first()
    const href = $link.attr("href")
    const title = $link.attr("title")?.trim() || $link.text().trim()
    const pubDate = $item.find("span").first().text().trim()

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
  "mof": latest,
  "mof-news": latest,
})
