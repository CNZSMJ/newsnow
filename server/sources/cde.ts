import * as cheerio from "cheerio"
import type { NewsItem } from "@shared/types"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.cde.org.cn"

function uniqueById<T extends NewsItem>(items: T[]) {
  return [...new Map(items.map(item => [String(item.id), item])).values()]
}

function isNewsItem(item: NewsItem | undefined): item is NewsItem {
  return Boolean(item)
}

function createRollSource() {
  return defineSource(async () => {
    const html = await myFetch<string>(baseUrl)
    const $ = cheerio.load(html)

    const items = $(".main_news_roll .news_roll_module_content").map((_, element) => {
      const $item = $(element)
      const $link = $item.find("a.text_link").first()
      const href = $link.attr("href")
      const title = $link.text().trim()
      const pubDate = $item.find(".news_roll_module_title > span").last().text().trim()

      if (!href || !title) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate: pubDate || undefined,
      }
    }).get().filter(isNewsItem)

    return uniqueById(items)
  })
}

function createTabSource(tab: "law" | "rules") {
  return defineSource(async () => {
    const html = await myFetch<string>(baseUrl)
    const $ = cheerio.load(html)

    const items = $(`.main_tabs_pane [name="${tab}"] .news_row`).map((_, element) => {
      const $item = $(element)
      const $link = $item.find(".row_title a").first()
      const href = $link.attr("href")
      const title = $link.text().trim()
      const pubDate = $item.find(".row_date").text().trim()

      if (!href || !title) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
        pubDate: pubDate || undefined,
      }
    }).get().filter(isNewsItem)

    return uniqueById(items)
  })
}

export default defineSource({
  "cde-news": createRollSource(),
  "cde-policy": createTabSource("law"),
  "cde-rules": createTabSource("rules"),
})
