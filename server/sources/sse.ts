import { defineSource } from "#/utils/source"

interface SSEItem {
  discloseId: string
  discloseDate: string
  bulletinTitle: string
  bulletinUrl: string
  securityCode: string
  securityAbbr: string
}

interface SSEResponse {
  publishData: SSEItem[]
}

export default defineSource({
  "sse-latest": defineSource(async () => {
    const res = await myFetch<SSEResponse>("https://www.sse.com.cn/disclosure/listedinfo/announcement/json/stock_bulletin_publish_order.json")
    return res.publishData.map(item => ({
      id: item.discloseId,
      title: `${item.securityAbbr}：${item.bulletinTitle}`,
      url: new URL(item.bulletinUrl, "https://www.sse.com.cn").toString(),
      pubDate: item.discloseDate,
      extra: {
        info: item.securityCode,
      },
    }))
  }),
})
