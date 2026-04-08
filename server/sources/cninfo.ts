import { defineSource } from "#/utils/source"

interface CNInfoAnnouncement {
  secCode?: string
  secName?: string
  announcementId: string
  announcementTitle: string
  announcementTime: number
  adjunctUrl: string
  announcementTypeName?: string | null
}

interface CNInfoResponse {
  classifiedAnnouncements?: CNInfoAnnouncement[][]
  announcements?: CNInfoAnnouncement[]
}

const cninfoURL = "https://www.cninfo.com.cn/new/disclosure"
const cninfoHeaders = {
  Referer: "https://www.cninfo.com.cn/new/commonUrl?url=disclosure/list/notice",
  "X-Requested-With": "XMLHttpRequest",
}

function flattenAnnouncements(res: CNInfoResponse) {
  if (res.announcements?.length) return res.announcements
  return (res.classifiedAnnouncements ?? []).flat()
}

function createCNInfoSource(column: string) {
  return defineSource(async () => {
    const res = await myFetch<CNInfoResponse>(cninfoURL, {
      method: "POST",
      headers: cninfoHeaders,
      body: new URLSearchParams({
        column,
        pageNum: "1",
        pageSize: "30",
        clusterFlag: "true",
      }),
    })

    return flattenAnnouncements(res).map(item => ({
      id: item.announcementId,
      title: item.secName ? `${item.secName}：${item.announcementTitle}` : item.announcementTitle,
      url: new URL(item.adjunctUrl, "https://static.cninfo.com.cn/").toString(),
      pubDate: item.announcementTime,
      extra: {
        info: [item.secCode, item.announcementTypeName].filter(Boolean).join(" · ") || undefined,
      },
    }))
  })
}

function isHKDisclosureTitle(title: string) {
  return [
    "翌日披露报表",
    "翌日披露報表",
    "证券变动月报表",
    "證券變動月報表",
    "月报表",
    "月報表",
  ].some(keyword => title.includes(keyword))
}

const hkDisclosureSource = defineSource(async () => {
  const columns = ["hke_main_latest", "hke_gem_latest"] as const
  const responses = await Promise.all(columns.map(column => myFetch<CNInfoResponse>(cninfoURL, {
    method: "POST",
    headers: cninfoHeaders,
    body: new URLSearchParams({
      column,
      pageNum: "1",
      pageSize: "30",
      clusterFlag: "true",
    }),
  })))

  const items = responses.flatMap(flattenAnnouncements)
    .filter(item => isHKDisclosureTitle(item.announcementTitle))
    .sort((a, b) => b.announcementTime - a.announcementTime)

  return items.map(item => ({
    id: item.announcementId,
    title: item.secName ? `${item.secName}：${item.announcementTitle}` : item.announcementTitle,
    url: new URL(item.adjunctUrl, "https://static.cninfo.com.cn/").toString(),
    pubDate: item.announcementTime,
    extra: {
      info: item.secCode || undefined,
    },
  }))
})

export default defineSource({
  "cninfo-szse": createCNInfoSource("szse_latest"),
  "cninfo-sse": createCNInfoSource("sse_latest"),
  "cninfo-hk-main": createCNInfoSource("hke_main_latest"),
  "cninfo-hk-gem": createCNInfoSource("hke_gem_latest"),
  "cninfo-hk-disclosure": hkDisclosureSource,
})
