import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "http://www.caam.org.cn"

const nevKeywords = /新能源汽车|电动汽车|智能汽车|车联网|智驾|自动驾驶|充电|电池|氢能|汽车芯片|商用车|乘用车|零部件/

function createCaamSource(path: string, selector: string, filter: (title: string, href: string) => boolean) {
  return defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}${path}`)
    const $ = cheerio.load(html)
    const items = $(selector).map((_, element) => {
      const $item = $(element)
      const $link = $item.is("a") ? $item : $item.find("a").first()
      const href = $link.attr("href")
      const title = (
        $link.find(".cont").first().text()
        || $link.find(".tit").first().text()
        || $link.attr("title")
        || $link.text()
      ).trim()
      const pubDate = $item.find(".time, .span-2, .date").first().text().trim()

      if (!href || !title || !href.includes("/con_") || !filter(title, href)) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate: pubDate || undefined,
      }
    }).get().filter(Boolean)

    return [...new Map(items.map(item => [item.id, item])).values()]
  })
}

export default defineSource({
  "caam-nev-stats": createCaamSource(
    "/tjsj",
    "a",
    title => title.includes("新能源汽车"),
  ),
  "caam-nev-policy": createCaamSource(
    "/hyzc",
    "a",
    (title, href) => nevKeywords.test(title) || /\/chn\/9\/cate_(98|99|100|101|102|103)\//.test(href),
  ),
  "caam-nev-news": createCaamSource(
    "/chn/5/cate_39/index.html",
    "a",
    title => nevKeywords.test(title),
  ),
})
