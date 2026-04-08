import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.mofcom.gov.cn"

function createHomepageSectionSource(prefix: string) {
  return defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}/`)
    const $ = cheerio.load(html)

    return $(`a[href^='${prefix}']`).map((_, element) => {
      const $link = $(element)
      const href = $link.attr("href")
      const title = $link.attr("title")?.trim() || $link.text().trim()

      if (!href || !title) return undefined

      return {
        id: href,
        title,
        url: new URL(href, baseUrl).toString(),
      }
    }).get().filter(Boolean)
  })
}

const release = createHomepageSectionSource("/xwfb/rcxwfb/art/")
const spokesperson = createHomepageSectionSource("/xwfb/xwfyrth/art/")

export default defineSource({
  "mofcom": release,
  "mofcom-release": release,
  "mofcom-spokesperson": spokesperson,
})
