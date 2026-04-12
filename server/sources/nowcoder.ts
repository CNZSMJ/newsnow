interface Res {
  data: {
    result: {
      id: string
      title: string
      type: number
      uuid: string
    }[]
  }
}

export default defineSource(async () => {
  const timestamp = Date.now()
  const url = `https://gw-c.nowcoder.com/api/sparta/hot-search/top-hot-pc?size=20&_=${timestamp}&t=`
  const res: Res = await myFetch(url)
  return res.data.result.flatMap((k) => {
    if (k.type === 74) {
      return [{
        id: k.uuid,
        title: k.title,
        url: `https://www.nowcoder.com/feed/main/detail/${k.uuid}`,
      }]
    }

    if (k.type === 0) {
      return [{
        id: k.id,
        title: k.title,
        url: `https://www.nowcoder.com/discuss/${k.id}`,
      }]
    }

    return []
  })
})
