import { defineSource } from "#/utils/source"

const baseUrl = "https://www.chinamoney.com.cn"

interface ShiborRecord {
  termCode: string
  shibor: string
  shibIdUpDown: string
  shibIdUpDownNum: number
}

interface ShiborMARecord {
  termCode: string
  list: string[]
}

interface ShiborResponse {
  data: {
    showDateCN: string
  }
  records: ShiborRecord[]
}

interface ShiborMAResponse {
  records: ShiborMARecord[]
}

interface FdrResponse {
  data: {
    showDateCN: string
  }
  records: Array<{
    productCode: string
    value: string
    produceDate: string
  }>
}

interface LprResponse {
  data: {
    showDateCN: string
  }
  records: Array<{
    termCode: string
    shibor: string
    shibIdUpDown?: string
  }>
}

function formatDiff(diff: number) {
  const sign = diff > 0 ? "+" : ""
  return `${sign}${diff.toFixed(2)}BP`
}

const shibor = defineSource(async () => {
  const [latest, average] = await Promise.all([
    myFetch<ShiborResponse>(`${baseUrl}/r/cms/www/chinamoney/data/shibor/shibor.json`),
    myFetch<ShiborMAResponse>(`${baseUrl}/r/cms/www/chinamoney/data/shibor/shibor-mn.json`),
  ])

  const averageMap = new Map(average.records.map(record => [record.termCode, record.list]))

  return latest.records.map((record) => {
    const list = averageMap.get(record.termCode) || []
    const [today, ma5, ma10, ma20] = list

    return {
      id: `${latest.data.showDateCN}-${record.termCode}`,
      title: `${record.termCode} ${record.shibor}%`,
      url: `${baseUrl}/chinese/bkshibor/`,
      pubDate: latest.data.showDateCN,
      extra: {
        info: formatDiff(record.shibIdUpDownNum),
        diff: record.shibIdUpDownNum,
        raw: {
          termCode: record.termCode,
          shibor: record.shibor,
          shibIdUpDown: record.shibIdUpDown,
          shibIdUpDownNum: record.shibIdUpDownNum,
          averages: {
            today,
            ma5,
            ma10,
            ma20,
          },
          showDateCN: latest.data.showDateCN,
        },
        hover: [
          `发布时间：${latest.data.showDateCN}`,
          today ? `当日均值：${today}%` : undefined,
          ma5 ? `5日均值：${ma5}%` : undefined,
          ma10 ? `10日均值：${ma10}%` : undefined,
          ma20 ? `20日均值：${ma20}%` : undefined,
        ].filter(Boolean).join("\n"),
      },
    }
  })
})

const fdr007 = defineSource(async () => {
  const data = await myFetch<FdrResponse>(`${baseUrl}/r/cms/www/chinamoney/data/currency/fdr.json`)
  const priority = new Map([
    ["FDR007", 0],
    ["FDR001", 1],
    ["FDR014", 2],
  ])

  return data.records
    .toSorted((a, b) => (priority.get(a.productCode) ?? 99) - (priority.get(b.productCode) ?? 99))
    .map(record => ({
      id: `${record.produceDate}-${record.productCode}`,
      title: `${record.productCode} ${record.value}%`,
      url: `${baseUrl}/chinese/bkfrr/`,
      pubDate: data.data.showDateCN,
      extra: {
        info: data.data.showDateCN,
        raw: {
          productCode: record.productCode,
          value: record.value,
          produceDate: record.produceDate,
          showDateCN: data.data.showDateCN,
        },
        hover: record.productCode === "FDR007"
          ? "官方银银间7天回购定盘利率，基于DR007交易样本编制"
          : "官方银银间回购定盘利率",
      },
    }))
})

const fr007 = defineSource(async () => {
  const data = await myFetch<FdrResponse>(`${baseUrl}/r/cms/www/chinamoney/data/currency/frr.json`)
  const priority = new Map([
    ["FR007", 0],
    ["FR001", 1],
    ["FR014", 2],
  ])

  return data.records
    .toSorted((a, b) => (priority.get(a.productCode) ?? 99) - (priority.get(b.productCode) ?? 99))
    .map(record => ({
      id: `${record.produceDate}-${record.productCode}`,
      title: `${record.productCode} ${record.value}%`,
      url: `${baseUrl}/chinese/bkfrr/`,
      pubDate: data.data.showDateCN,
      extra: {
        info: data.data.showDateCN,
        raw: {
          productCode: record.productCode,
          value: record.value,
          produceDate: record.produceDate,
          showDateCN: data.data.showDateCN,
        },
        hover: record.productCode === "FR007"
          ? "官方7天回购定盘利率"
          : "官方回购定盘利率",
      },
    }))
})

const lpr = defineSource(async () => {
  const data = await myFetch<LprResponse>(`${baseUrl}/r/cms/www/chinamoney/data/currency/bk-lpr.json`)
  const priority = new Map([
    ["1Y", 0],
    ["5Y", 1],
  ])

  return data.records
    .toSorted((a, b) => (priority.get(a.termCode) ?? 99) - (priority.get(b.termCode) ?? 99))
    .map(record => ({
      id: `${data.data.showDateCN}-${record.termCode}`,
      title: `${record.termCode} ${record.shibor}%`,
      url: `${baseUrl}/chinese/bklpr/`,
      pubDate: data.data.showDateCN,
      extra: {
        info: data.data.showDateCN,
        raw: {
          termCode: record.termCode,
          shibor: record.shibor,
          shibIdUpDown: record.shibIdUpDown,
          showDateCN: data.data.showDateCN,
        },
        hover: "官方贷款市场报价利率",
      },
    }))
})

export default defineSource({
  "chinamoney-shibor": shibor,
  "chinamoney-fdr007": fdr007,
  "chinamoney-fr007": fr007,
  "chinamoney-lpr": lpr,
})
