import * as cheerio from "cheerio"
import type { NewsItem } from "@shared/types"
import { getSearchParams } from "./utils"
import type { RawItemRow } from "#/types"

interface Item {
  id: number
  title?: string
  brief: string
  shareurl: string
  // need *1000
  ctime: number
  // 1
  is_ad: number
}
interface TelegraphRes {
  data: {
    roll_data: Item[]
  }
}

interface Depthes {
  data: {
    top_article: Item[]
    depth_list: Item[]
  }
}

interface Hot {
  data: Item[]
}

function normalizeText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || ""
}

function trimPreview(value?: string, max = 240) {
  const normalized = normalizeText(value)
  if (!normalized) return undefined
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1).trim()}…`
}

function needsClsArticlePreview(title: string) {
  return /这家公司|另一家公司|另一家|本文提及|文中提及|机构称|电报解读|追踪到|展开梳理|受益于/.test(title)
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

async function fetchClsArticlePreview(url: string) {
  const html = await myFetch<string>(url)
  const $ = cheerio.load(html)
  const articleTitle = normalizeText($(".title-box").first().text())
  const abstract = normalizeText($(".abstract-box").first().text())
  const previewParagraphs = $(".content-box .content p")
    .map((_, element) => normalizeText($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 2)
  const previewText = normalizeText([abstract, ...previewParagraphs].filter(Boolean).join(" "))

  return {
    articleTitle: articleTitle || undefined,
    abstract: abstract || undefined,
    previewText: previewText || undefined,
  }
}

export async function hydrateClsRawItem(rawRow: RawItemRow) {
  if (!rawRow.source_id.startsWith("cls")) return rawRow
  const payload = JSON.parse(rawRow.payload_json) as NewsItem
  const mobileUrl = payload.mobileUrl || rawRow.mobile_url || `https://api3.cls.cn/share/article/${rawRow.source_item_id}?os=web&sv=8.4.6&app=CailianpressWeb`
  const title = payload.title || rawRow.title

  if (!mobileUrl || !needsClsArticlePreview(title)) return rawRow

  try {
    const preview = await fetchClsArticlePreview(mobileUrl)
    if (!preview.previewText && !preview.abstract && !preview.articleTitle) return rawRow

    const nextPayload: NewsItem = {
      ...payload,
      title: preview.articleTitle || payload.title,
      mobileUrl,
      extra: {
        ...payload.extra,
        hover: trimPreview(preview.previewText ?? preview.abstract) ?? payload.extra?.hover,
        raw: {
          ...(typeof payload.extra?.raw === "object" && payload.extra.raw ? payload.extra.raw as Record<string, unknown> : {}),
          description: preview.previewText ?? undefined,
          abstract: preview.abstract ?? undefined,
          previewText: preview.previewText ?? undefined,
        },
      },
    }

    return {
      ...rawRow,
      mobile_url: mobileUrl,
      payload_json: JSON.stringify(nextPayload),
      fetched_at: Date.now(),
    }
  } catch (error) {
    logger.warn(`failed to rehydrate CLS raw item: ${mobileUrl}`, error)
    return rawRow
  }
}

async function toClsNewsItems(items: Item[], options?: { enrichPreview?: boolean }) {
  return mapWithConcurrency(items, 4, async (item) => {
    const base = {
      id: item.id,
      title: item.title || item.brief,
      mobileUrl: item.shareurl,
      pubDate: item.ctime * 1000,
      url: `https://www.cls.cn/detail/${item.id}`,
      extra: {
        raw: {
          id: item.id,
          title: item.title || item.brief,
          brief: item.brief,
          shareUrl: item.shareurl,
        },
      },
    }

    if (!options?.enrichPreview || !needsClsArticlePreview(base.title) || !base.mobileUrl)
      return base

    try {
      const preview = await fetchClsArticlePreview(base.mobileUrl)
      return {
        ...base,
        title: preview.articleTitle || base.title,
        extra: {
          hover: trimPreview(preview.previewText ?? preview.abstract),
          raw: {
            ...base.extra.raw,
            description: preview.previewText,
            abstract: preview.abstract,
            previewText: preview.previewText,
          },
        },
      }
    } catch (error) {
      logger.warn(`failed to enrich CLS preview: ${base.mobileUrl}`, error)
      return base
    }
  })
}

const depth = defineSource(async () => {
  const apiUrl = `https://www.cls.cn/v3/depth/home/assembled/1000`
  const res: Depthes = await myFetch(apiUrl, {
    query: Object.fromEntries(await getSearchParams()),
  })
  return toClsNewsItems(res.data.depth_list.sort((m, n) => n.ctime - m.ctime), { enrichPreview: true })
})

const hot = defineSource(async () => {
  const apiUrl = `https://www.cls.cn/v2/article/hot/list`
  const res: Hot = await myFetch(apiUrl, {
    query: Object.fromEntries(await getSearchParams()),
  })
  return toClsNewsItems(res.data, { enrichPreview: true })
})

const telegraph = defineSource(async () => {
  const apiUrl = `https://www.cls.cn/nodeapi/updateTelegraphList`
  const res: TelegraphRes = await myFetch(apiUrl, {
    query: Object.fromEntries(await getSearchParams()),
  })
  return toClsNewsItems(res.data.roll_data.filter(k => !k.is_ad), { enrichPreview: true })
})

export default defineSource({
  "cls": telegraph,
  "cls-telegraph": telegraph,
  "cls-depth": depth,
  "cls-hot": hot,
})
