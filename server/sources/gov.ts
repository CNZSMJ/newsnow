import { defineSource } from "#/utils/source"

interface GovItem {
  TITLE: string
  SUB_TITLE?: string
  URL: string
  DOCRELPUBTIME?: string
}

const latest = defineSource(async () => {
  const items = await myFetch<GovItem[]>("https://www.gov.cn/yaowen/liebiao/YAOWENLIEBIAO.json")

  return items.map(item => ({
    id: item.URL,
    title: item.TITLE,
    url: item.URL,
    pubDate: item.DOCRELPUBTIME || undefined,
  }))
})

export default defineSource({
  "gov": latest,
  "gov-latest": latest,
})
