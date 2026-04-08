import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

interface MiitBuildResponse {
  data?: {
    html?: string
  }
}

const baseUrl = "https://www.miit.gov.cn"

const miitIndustryQuery = new URLSearchParams({
  parseType: "buildstatic",
  webId: "8d828e408d90447786ddbe128d495e9e",
  tplSetId: "209741b2109044b5b7695700b2bec37e",
  pageType: "column",
  tagId: "右侧内容",
  editType: "null",
  pageId: "028da85b0dbd4c9cb96fd5f421cd32b8",
})

export default defineSource({
  "miit-industry": defineSource(async () => {
    const res = await myFetch<MiitBuildResponse>(`${baseUrl}/api-gateway/jpaas-publish-server/front/page/build/unit?${miitIndustryQuery.toString()}`)
    const html = res.data?.html
    if (!html) throw new Error("Cannot fetch MIIT industry list")

    const $ = cheerio.load(html)
    return $("li.cf").map((_, element) => {
      const $item = $(element)
      const $link = $item.find("a.fl").first()
      const href = $link.attr("href")
      const title = $link.attr("title")?.trim() || $link.text().trim()
      const pubDate = $item.find("span.fr").text().trim()

      if (!href || !title) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate: pubDate || undefined,
      }
    }).get().filter(Boolean)
  }),
})
