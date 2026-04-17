/* eslint-disable no-cond-assign */
/* eslint-disable regexp/no-useless-escape */
/* eslint-disable regexp/use-ignore-case */
/* eslint-disable unicorn/escape-case */
import * as cheerio from "cheerio"
import { type IndustryTag, allIndustryTags, industryAliases } from "@shared/industry"

export const STOCK_CODE_RE = /\b(?:sh|sz|bj)?\d{6}\b/gi
const COMPANY_HINT_RE = /(?:^|[：:【\[\(（\s])([\u4e00-\u9fa5A-Za-z*]{2,24})(?=[：:】\]\)）\s,，;；])/g
const EXPLICIT_TICKER_MENTION_RE = /([\u4e00-\u9fa5A-Za-zＡ-Ｚａ-ｚ０-９][\u4e00-\u9fa5A-Za-zＡ-Ｚａ-ｚ０-９&.'’·\-－—–（）()\s]{1,64}?)\(((?:[A-Z0-9]{1,10}\.(?:US|HK|SH|SZ|BJ))(?:\/[A-Z0-9]{1,10}\.(?:US|HK|SH|SZ|BJ))*)\)/g
const EXPLICIT_TICKER_CODE_RE = /^([A-Z0-9]{1,10})\.(US|HK|SH|SZ|BJ)$/
const CONTEXTUAL_COMPANY_HINT_RES = [
  /(?:本文提及|文中提及|提及|覆盖|点名|梳理指出|梳理提到|梳理显示|重点关注|关注)[“"《]?([\u4e00-\u9fa5A-Za-z*]{2,24})[”"》]?/g,
  /([\u4e00-\u9fa5A-Za-z*]{2,24})(?=[（(](?:sh|sz|bj)?\d{6}[）)])/g,
  /([\u4e00-\u9fa5A-Za-zＡ-Ｚａ-ｚ]{2,24})(?=官宣)/g,
]
const COMPANY_HINT_STOPWORDS = new Set([
  "这家公司",
  "另一家公司",
  "该公司",
  "公司",
  "企业",
  "上市公司",
  "个股",
  "标的",
  "本文",
  "机构",
  "行业",
  "案例展示",
  "未来走势预测",
  "电报解读",
  "快讯",
  "公告",
  "财联社",
  "央视新闻",
  "新华社",
  "新华网",
  "中新网",
  "中国新闻网",
  "新浪财经",
  "金十数据",
  "第一财经",
  "界面新闻",
  "澎湃新闻",
  "证券时报",
  "证券日报",
  "上证报",
  "上海证券报",
])
const MEDIA_INTERPRETATION_RE = /电报解读|追踪到|随即展开梳理|本文提及|文中提及|区间最高涨幅|案例展示|非未来走势预测|所属专栏/
const BROAD_MARKET_DESCRIPTOR_RE = /(板块|概念|题材|指数|期指|市场|收益率|运价指数|油价|金价|币价|汇率|期货|现货|数字货币|加密货币|比特币|以太坊)/
const MARKET_MOVE_VERB_RE = /(集体走高|集体走低|走高|走低|涨超|跌超|涨逾|跌逾|拉升|跳水|回落|反弹|上行|下行|续涨|续跌|下挫|攀升|刷新)/
const ENTITY_EVENT_CONTAINER_SUFFIX_RE = /(?:法说会纪要|法說會紀要|法说会后|法說會後|法说会|法說會|业绩说明会|業績說明會|说明会|說明會|业绩发布会|業績發布會|业绩会|業績會|电话会议纪要|電話會議紀要|电话会议|電話會議|电话会|電話會|交流纪要|交流会|沟通会|投资者日|投资者交流会|分享会|发布会|發布會)$/
const ENTITY_EVENT_CONTAINER_MARKERS = [
  "法说会",
  "法說會",
  "业绩说明会",
  "業績說明會",
  "说明会",
  "說明會",
  "业绩发布会",
  "業績發布會",
  "业绩会",
  "業績會",
  "电话会议",
  "電話會議",
  "电话会",
  "電話會",
  "交流会",
  "沟通会",
  "投资者日",
  "发布会",
  "發布會",
] as const
const EXECUTIVE_EVENT_CONTAINER_RE = /^([\u4e00-\u9fa5A-Za-zＡ-Ｚａ-ｚ·\-－—&\s]{2,24})(?:首席执行官|首席财务官|董事长|总裁|CEO|CFO|COO|董事会秘书|新闻发言人).*(?:电话会议|電話會議|电话会|電話會|业绩会|業績會|业绩说明会|業績說明會|法说会|法說會)/
const NON_ENTITY_ACTION_PHRASE_RE = /(举行电话会谈|举行会谈|电话会谈|电话会议发言|電話會議發言|通电话|会谈|討論|讨论|交换意见|交換意見|正式发布|正式發布|发布会上正式发布|發布會上正式發布|发布会上|發布會上|实录|實錄|定调|定調|发言|發言|表示|表態|将在|將在|将于|將於|官宣)/
const MULTI_PARTY_EVENT_PHRASE_RE = /.+[与和及、].+(?:会谈|會談|通电话|通話|交流|讨论|討論)/

export interface ExplicitSecurityMention {
  label: string
  code: string
  fullCode: string
  market: "US" | "HK"
}

export function stripHtml(value: string) {
  const $ = cheerio.load(`<div>${value}</div>`)
  return $("div").text().replace(/\s+/g, " ").trim()
}

export function normalizeUrl(value: string) {
  try {
    const url = new URL(value)
    url.hash = ""
    return url.toString()
  } catch {
    return value.trim()
  }
}

export function normalizeTitle(value: string) {
  return stripHtml(value)
    .replace(/[【】\[\]]/g, " ")
    .replace(/财联社\d{1,2}月\d{1,2}日电/g, " ")
    .replace(/^(快讯|电报|公告|要闻)[：:]/, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeTitleForClustering(value: string, primaryEntityName?: string) {
  let text = normalizeTitle(value)
    .replace(STOCK_CODE_RE, " ")
    .replace(/(股份)?有限公司/g, " ")
    .replace(/\b[A-Z]{2,10}\b/g, " ")
    .replace(/\d{4}年/g, " ")
    .replace(/\d{1,2}月\d{1,2}日/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (primaryEntityName) {
    const escaped = primaryEntityName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    text = text.replace(new RegExp(`^${escaped}\\s*[：:]?\\s*`, "i"), "")
      .replace(new RegExp(`关于${escaped}`, "i"), "关于主体")
      .trim()
  }

  return text || normalizeTitle(value)
}

export function parsePublishedAt(value?: number | string) {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value === "number") {
    return value > 10_000_000_000 ? value : value * 1000
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

export function getPrimaryEntityName(title: string) {
  const trimmed = normalizeTitle(title)
  const rules = [
    /^([\u4e00-\u9fa5A-Za-z*]{2,24})(?:新闻发言人)?就/,
    /^([\u4e00-\u9fa5A-Za-z*]{2,24})答记者问/,
    /^([\u4e00-\u9fa5A-Za-z*]{2,24})\s*[：:]/,
    /^([\u4e00-\u9fa5A-Za-z*]{2,24})关于/,
    /关于([\u4e00-\u9fa5A-Za-z*]{2,24})的/,
  ]
  for (const rule of rules) {
    const matched = trimmed.match(rule)
    if (matched?.[1]) {
      const candidate = normalizePrimaryEntityCandidate(matched[1].replace(/新闻发言人$/, "").trim())
      if (candidate) return candidate
    }
  }
  return undefined
}

export function normalizePrimaryEntityCandidate(value?: string | null) {
  let normalized = normalizeTitle(value ?? "")
  if (!normalized) return undefined

  const executiveMatch = normalized.match(EXECUTIVE_EVENT_CONTAINER_RE)
  if (executiveMatch?.[1]?.trim()) {
    normalized = executiveMatch[1].trim()
  }

  while (ENTITY_EVENT_CONTAINER_SUFFIX_RE.test(normalized)) {
    normalized = normalized.replace(ENTITY_EVENT_CONTAINER_SUFFIX_RE, "").trim()
  }

  for (const marker of ENTITY_EVENT_CONTAINER_MARKERS) {
    const markerIndex = normalized.indexOf(marker)
    if (markerIndex <= 0) continue
    const prefix = normalized.slice(0, markerIndex).trim()
    if (prefix.length < 2 || prefix.length > 24) continue
    if (/[与和及、]/.test(prefix)) continue
    if (/(举行|会谈|将至|将于|正式|发布|發布|系列|新品|全场景|定调|实录|表示|发言|在媒体|在电话|在業績|在业绩)$/.test(prefix)) continue
    normalized = prefix
    break
  }

  if (MULTI_PARTY_EVENT_PHRASE_RE.test(normalized)) return undefined
  if (NON_ENTITY_ACTION_PHRASE_RE.test(normalized)) return undefined

  normalized = normalized.replace(/[：:]\s*$/, "").trim()
  return normalized || undefined
}

function collectCompanyHints(text: string, hints: Set<string>) {
  for (const rule of CONTEXTUAL_COMPANY_HINT_RES) {
    rule.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = rule.exec(text)) !== null) {
      const value = normalizePrimaryEntityCandidate(match[1]?.trim())
      if (!value || COMPANY_HINT_STOPWORDS.has(value)) continue
      hints.add(value)
      if (hints.size >= 6) return
    }
  }

  COMPANY_HINT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = COMPANY_HINT_RE.exec(text)) !== null) {
    const value = normalizePrimaryEntityCandidate(match[1]?.trim())
    if (!value || value.length < 2) continue
    if (COMPANY_HINT_STOPWORDS.has(value)) continue
    if (["关于", "公司", "公告", "董事会", "监事会", "股份", "有限责任公司", "有限公司"].includes(value)) continue
    hints.add(value)
    if (hints.size >= 6) return
  }
}

export function extractCompanyHints(text: string) {
  const hints = new Set<string>()
  const primary = getPrimaryEntityName(text)
  if (primary) hints.add(primary)
  collectCompanyHints(text, hints)
  return [...hints]
}

function normalizeExplicitSecurityLabel(value: string) {
  return value
    .replace(/[“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function extractExplicitSecurityMentions(text: string): ExplicitSecurityMention[] {
  const mentions = new Map<string, ExplicitSecurityMention>()
  EXPLICIT_TICKER_MENTION_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = EXPLICIT_TICKER_MENTION_RE.exec(text)) !== null) {
    const label = normalizeExplicitSecurityLabel(match[1] ?? "")
    const groupedCodes = (match[2] ?? "").split("/").map(part => part.trim().toUpperCase()).filter(Boolean)
    if (!label || !groupedCodes.length) continue

    for (const groupedCode of groupedCodes) {
      const codeMatch = groupedCode.match(EXPLICIT_TICKER_CODE_RE)
      const ticker = codeMatch?.[1]?.trim().toUpperCase()
      const market = codeMatch?.[2]?.trim().toUpperCase() as ExplicitSecurityMention["market"] | "SH" | "SZ" | "BJ" | undefined
      if (!ticker || (market !== "US" && market !== "HK")) continue

      const fullCode = market === "US" ? `us:${ticker.toLowerCase()}` : `hk${ticker.toLowerCase()}`
      if (!mentions.has(fullCode)) {
        mentions.set(fullCode, {
          label,
          code: ticker,
          fullCode,
          market,
        })
      }
    }
  }

  return Array.from(mentions.values())
}

export function isMediaInterpretationText(title: string, summary?: string | null) {
  const text = `${normalizeTitle(title)} ${normalizeTitle(summary ?? "")}`
  return MEDIA_INTERPRETATION_RE.test(text)
}

export function isBroadMarketDescriptor(value: string) {
  const text = normalizeTitle(value)
  if (!text) return false

  if (BROAD_MARKET_DESCRIPTOR_RE.test(text)) return true
  if (/^(A股|港股|美股|欧股|债市|汇市|商品|原油|黄金|数字货币|加密货币|比特币|以太坊)/i.test(text)) return true
  if (MARKET_MOVE_VERB_RE.test(text) && text.length >= 6) return true

  return false
}

const INDUSTRY_KEYWORDS: Record<IndustryTag, string[]> = industryAliases

export function inferIndustryTagsFromText(title: string, summary?: string | null) {
  const text = `${normalizeTitle(title)} ${normalizeTitle(summary ?? "")}`.toLowerCase()
  const matched: IndustryTag[] = []
  for (const tag of allIndustryTags) {
    const keywords = INDUSTRY_KEYWORDS[tag]
    if (keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
      matched.push(tag)
    }
  }
  return matched
}

function padMonth(value: string) {
  return value.padStart(2, "0")
}

export function extractPeriodKey(value: string) {
  const text = normalizeTitle(value)
  let match = text.match(/(\d{4})年(\d{1,2})月/)
  if (match) return `${match[1]}-${padMonth(match[2])}`

  match = text.match(/(\d{4})年第?([一二三四1-4])季度/)
  if (match) {
    const quarter = { 一: "1", 二: "2", 三: "3", 四: "4" }[match[2]] ?? match[2]
    return `${match[1]}Q${quarter}`
  }

  match = text.match(/(\d{4})年(上半年|下半年)/)
  if (match) return `${match[1]}${match[2] === "上半年" ? "H1" : "H2"}`

  match = text.match(/(\d{4})年/)
  if (match) return match[1]

  return undefined
}

export function inferReleaseCadence(value: string) {
  const text = normalizeTitle(value)
  if (/周报|周度|每周|当周/.test(text)) return "weekly"
  if (/月报|月度|月份|月运行|月统计/.test(text)) return "monthly"
  if (/季度|季报|一季度|二季度|三季度|四季度|Q[1-4]/.test(text)) return "quarterly"
  if (/上半年|下半年|半年度/.test(text)) return "semiannual"
  if (/年度数据|年度|年报|全年/.test(text)) return "annual"
  if (/日报|日度|每日|当日/.test(text)) return "daily"
  return "event"
}

export function normalizeReleaseTitle(value: string) {
  return normalizeTitleForClustering(value)
    .replace(/\d{4}年/g, " ")
    .replace(/\d{1,2}月/g, " ")
    .replace(/第?[一二三四1-4]季度/g, " ")
    .replace(/Q[1-4]/gi, " ")
    .replace(/上半年|下半年|半年度/g, " ")
    .replace(/年度|全年/g, " ")
    .replace(/\d{4}-\d{2}-\d{2}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
