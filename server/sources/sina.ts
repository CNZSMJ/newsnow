import { defineSource } from "#/utils/source"

interface SinaFeedItem {
  id: number
  rich_text: string
  create_time: string
}

interface SinaResponse {
  result?: {
    data?: {
      feed?: {
        list?: SinaFeedItem[]
      }
    }
  }
}

const latest = defineSource(async () => {
  const res = await myFetch<SinaResponse>("https://app.cj.sina.com.cn/api/news/pc?page=1&size=30&tag=0", {
    headers: {
      Referer: "https://finance.sina.com.cn/7x24/",
    },
  })

  return (res.result?.data?.feed?.list ?? []).map(item => ({
    id: item.id,
    title: item.rich_text,
    url: `https://wap.cj.sina.cn/pc/7x24/${item.id}`,
    pubDate: item.create_time,
  }))
})

export default defineSource({
  "sina": latest,
  "sina-7x24": latest,
})
