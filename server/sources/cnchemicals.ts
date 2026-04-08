import * as cheerio from "cheerio"
import vm from "node:vm"
import { defineSource } from "#/utils/source"

const home = "https://www.cnchemicals.com/news"
const baseUrl = "https://www.cnchemicals.com"

type CcmNewsItem = {
  prNewsId?: number
  newsTitle?: string
  newsTitleEn?: string
  publishTime?: string
}

function extractNuxtData(html: string) {
  const match = html.match(/<script>window\.__NUXT__=(\(function\(.*?\}\(.*?\)\));<\/script>/s)
  if (!match) throw new Error("CCM nuxt payload not found")

  const sandbox = { window: {} as { __NUXT__?: any } }
  vm.createContext(sandbox)
  vm.runInContext(`window.__NUXT__=${match[1]}`, sandbox, { timeout: 5000 })

  return sandbox.window.__NUXT__?.data?.[0]
}

export default defineSource({
  "cnchemicals-industry": defineSource(async () => {
    const html = await myFetch<string>(home)
    const data = extractNuxtData(html)
    const newsList = new Map(
      ((data?.newsList || []) as CcmNewsItem[]).map(item => [String(item.prNewsId), item]),
    )
    const $ = cheerio.load(html)

    return $(".news-list .news-item").map((_, element) => {
      const $item = $(element)
      const $link = $item.find("a.news-title").first()
      const href = $link.attr("href")
      const title = $link.attr("title")?.trim() || $link.text().trim()
      const desc = $item.find(".news-desc").text().trim()
      const id = href?.match(/_(\d+)$/)?.[1]
      const pubDate = id ? newsList.get(id)?.publishTime?.slice(0, 10) : undefined

      if (!href || !id || !title) return undefined

      return {
        id,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate,
        extra: desc
          ? {
              info: desc,
            }
          : undefined,
      }
    }).get().filter(Boolean)
  }),
})
