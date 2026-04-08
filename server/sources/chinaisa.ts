import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

interface ChinaISAResponse {
  articleListHtml?: string
}

const baseUrl = "https://www.chinaisa.org.cn/gxportal/xfgl/portal/"

function createChinaISASource(columnId: string) {
  return defineSource(async () => {
    const raw = await myFetch<string | ChinaISAResponse>("https://www.chinaisa.org.cn/gxportal/xfpt/portal/getIndexArticleList", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({
        params: JSON.stringify({
          columnId,
          pattern: "yyyy-MM-dd",
        }),
      }),
    })

    const res = typeof raw === "string" ? JSON.parse(raw) as ChinaISAResponse : raw
    const html = res.articleListHtml
    if (!html) throw new Error("Cannot fetch ChinaISA list")

    const $ = cheerio.load(html)
    return $("li").map((_, element) => {
      const $item = $(element)
      const $link = $item.find("a").first()
      const href = $link.attr("href")
      const title = $link.attr("title")?.trim() || $link.text().trim()
      const pubDate = $item.find("span").text().trim()

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
  "chinaisa-stats": createChinaISASource("2e3c87064bdfc0e43d542d87fce8bcbc8fe0463d5a3da04d7e11b4c7d692194b"),
  "chinaisa-analysis": createChinaISASource("1b4316d9238e09c735365896c8e4f677a3234e8363e5622ae6e79a5900a76f56"),
})
