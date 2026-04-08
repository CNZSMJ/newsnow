import { defineSource } from "#/utils/source"
import { parseJSONP } from "#/utils/jsonp"

interface EastmoneyNews {
  code: string
  title: string
  summary?: string
  showTime?: string
}

interface EastmoneyResponse {
  code: string
  data?: {
    fastNewsList?: EastmoneyNews[]
  }
}

const latest = defineSource(async () => {
  const raw = await myFetch<string>("https://np-weblist.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102&sortEnd=&pageSize=30&req_trace=1&callback=cb", {
    headers: {
      Referer: "https://kuaixun.eastmoney.com/",
    },
  })

  const res = parseJSONP<EastmoneyResponse>(raw)
  return (res.data?.fastNewsList ?? []).map(item => ({
    id: item.code,
    title: item.title,
    url: `https://finance.eastmoney.com/a/${item.code}.html`,
    pubDate: item.showTime || undefined,
    extra: {
      hover: item.summary || undefined,
    },
  }))
})

export default defineSource({
  "eastmoney": latest,
  "eastmoney-7x24": latest,
})
