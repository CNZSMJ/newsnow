import { defineSource } from "#/utils/source"

interface HKEXItem {
  newsId: number
  sTxt: string
  title: string
  webPath: string
  relD: string
  relM: string
  relY: string
  relTime: string
  stock?: {
    sc: string
    sn: string
  }[]
}

interface HKEXResponse {
  newsInfo: HKEXItem[]
}

function formatHKEXTitle(item: HKEXItem) {
  const stock = item.stock?.[0]
  if (!stock) return item.title
  return `${stock.sn}：${item.title}`
}

function formatHKEXDate(item: HKEXItem) {
  return `${item.relY}-${item.relM}-${item.relD} ${item.relTime}`
}

function toHKEXRaw(item: HKEXItem) {
  return {
    newsId: item.newsId,
    title: item.title,
    category: item.sTxt,
    webPath: item.webPath,
    relD: item.relD,
    relM: item.relM,
    relY: item.relY,
    relTime: item.relTime,
    stock: item.stock?.map(stock => ({
      sc: stock.sc,
      sn: stock.sn,
    })),
  }
}

export default defineSource({
  "hkexnews-latest": defineSource(async () => {
    const res = await myFetch<HKEXResponse>("https://www.hkexnews.hk/ncms/script/eds/homecat0_c.json")
    return res.newsInfo.map(item => ({
      id: item.newsId,
      title: formatHKEXTitle(item),
      url: item.webPath,
      pubDate: formatHKEXDate(item),
      extra: {
        info: item.stock?.[0] ? `${item.stock[0].sc} · ${item.sTxt}` : item.sTxt,
        raw: toHKEXRaw(item),
      },
    }))
  }),
  "hkexnews-results": defineSource(async () => {
    const res = await myFetch<HKEXResponse>("https://www.hkexnews.hk/ncms/script/eds/homecat5_c.json")
    return res.newsInfo.map(item => ({
      id: item.newsId,
      title: formatHKEXTitle(item),
      url: item.webPath,
      pubDate: formatHKEXDate(item),
      extra: {
        info: item.stock?.[0] ? `${item.stock[0].sc} · ${item.sTxt}` : item.sTxt,
        raw: toHKEXRaw(item),
      },
    }))
  }),
  "hkexnews-halt": defineSource(async () => {
    const res = await myFetch<HKEXResponse>("https://www.hkexnews.hk/ncms/script/eds/homecat7_c.json")
    return res.newsInfo.map(item => ({
      id: item.newsId,
      title: formatHKEXTitle(item),
      url: item.webPath,
      pubDate: formatHKEXDate(item),
      extra: {
        info: item.stock?.[0] ? `${item.stock[0].sc} · ${item.sTxt}` : item.sTxt,
        raw: toHKEXRaw(item),
      },
    }))
  }),
})
