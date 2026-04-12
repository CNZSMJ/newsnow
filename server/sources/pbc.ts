import * as cheerio from "cheerio"
import { defineSource } from "#/utils/source"

const baseUrl = "https://www.pbc.gov.cn"

async function fetchPbcArticleMeta(url: string) {
  const html = await myFetch<string>(url)
  const $ = cheerio.load(html)

  return {
    articleTitle: $("meta[name='ArticleTitle']").attr("content")?.trim(),
    createDate: $("meta[name='createDate']").attr("content")?.trim(),
    description: $("meta[name='Description']").attr("content")?.trim(),
    keywords: $("meta[name='Keywords']").attr("content")?.trim(),
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = []
  results.length = items.length
  let cursor = 0

  async function runWorker() {
    while (cursor < items.length) {
      const currentIndex = cursor
      cursor += 1
      results[currentIndex] = await mapper(items[currentIndex]!, currentIndex)
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  return results
}

function createPbcListSource(path: string, options?: {
  enrichDetail?: boolean
}) {
  return defineSource(async () => {
    const html = await myFetch<string>(`${baseUrl}${path}`)
    const $ = cheerio.load(html)
    const items = $("a[istitle='true']").map((_, element) => {
      const $link = $(element)
      const href = $link.attr("href")
      const title = $link.attr("title")?.trim() || $link.text().trim()
      const pubDate = $link.parent().siblings(".hui12").first().text().trim()

      if (!href || !title) return undefined

      return {
        href,
        title,
        pubDate: pubDate || undefined,
        url: new URL(href, baseUrl).toString(),
      }
    }).get().filter(Boolean)

    if (!options?.enrichDetail) {
      return items.map(item => ({
        id: item.href,
        title: item.title,
        url: item.url,
        pubDate: item.pubDate,
        extra: {
          raw: {
            path,
            href: item.href,
            title: item.title,
            pubDate: item.pubDate,
          },
        },
      }))
    }

    return mapWithConcurrency(items, 4, async (item) => {
      try {
        const detail = await fetchPbcArticleMeta(item.url)
        const hover = detail.description || detail.keywords

        return {
          id: item.href,
          title: detail.articleTitle || item.title,
          url: item.url,
          pubDate: detail.createDate || item.pubDate,
          extra: {
            hover,
            raw: {
              path,
              href: item.href,
              title: detail.articleTitle || item.title,
              pubDate: detail.createDate || item.pubDate,
              description: detail.description,
              keywords: detail.keywords,
            },
          },
        }
      } catch (error) {
        logger.warn(`failed to enrich PBC detail: ${item.url}`, error)
        return {
          id: item.href,
          title: item.title,
          url: item.url,
          pubDate: item.pubDate,
          extra: {
            raw: {
              path,
              href: item.href,
              title: item.title,
              pubDate: item.pubDate,
            },
          },
        }
      }
    })
  })
}

const news = createPbcListSource("/goutongjiaoliu/113456/113469/index.html")
const omo = createPbcListSource("/zhengcehuobisi/125207/125213/125431/125475/index.html", {
  enrichDetail: true,
})
const mlf = createPbcListSource("/zhengcehuobisi/125207/125213/125437/125446/125873/index.html", {
  enrichDetail: true,
})

export default defineSource({
  "pbc": news,
  "pbc-news": news,
  "pbc-omo": omo,
  "pbc-mlf": mlf,
})
