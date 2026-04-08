import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.csrc.gov.cn"

function createCsrcListSource(path: string) {
  return defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}${path}`)
    const $ = cheerio.load(html)

    return $("#list li").map((_, element) => {
      const $item = $(element)
      const $link = $item.find("a").first()
      const href = $link.attr("href")
      const title = $link.text().trim()
      const pubDate = $item.find(".date").text().trim()

      if (!href || !title) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate: pubDate || undefined,
      }
    }).get().filter(Boolean)
  })
}

export default defineSource({
  "csrc-policy": createCsrcListSource("/csrc/c100039/common_list.shtml"),
  "csrc-press": createCsrcListSource("/csrc/c100029/common_list.shtml"),
})
