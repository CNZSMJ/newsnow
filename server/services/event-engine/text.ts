/* eslint-disable no-cond-assign */
/* eslint-disable regexp/no-useless-escape */
/* eslint-disable regexp/use-ignore-case */
/* eslint-disable unicorn/escape-case */
import * as cheerio from "cheerio"
import { type IndustryTag, allIndustryTags, industryAliases } from "@shared/industry"

export const STOCK_CODE_RE = /\b(?:sh|sz|bj)?\d{6}\b/gi
const COMPANY_HINT_RE = /(?:^|[：:【\[\(（\s])([\u4e00-\u9fa5A-Za-z*]{2,24})(?=[：:】\]\)）\s,，;；])/g
const CONTEXTUAL_COMPANY_HINT_RES = [
  /(?:本文提及|文中提及|提及|覆盖|点名|梳理指出|梳理提到|梳理显示|重点关注|关注)[“"《]?([\u4e00-\u9fa5A-Za-z*]{2,24})[”"》]?/g,
  /([\u4e00-\u9fa5A-Za-z*]{2,24})(?=[（(](?:sh|sz|bj)?\d{6}[）)])/g,
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
])
const MEDIA_INTERPRETATION_RE = /电报解读|追踪到|随即展开梳理|本文提及|文中提及|区间最高涨幅|案例展示|非未来走势预测|所属专栏/

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
      return matched[1].replace(/新闻发言人$/, "").trim()
    }
  }
  return undefined
}

function collectCompanyHints(text: string, hints: Set<string>) {
  for (const rule of CONTEXTUAL_COMPANY_HINT_RES) {
    rule.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = rule.exec(text)) !== null) {
      const value = match[1]?.trim()
      if (!value || COMPANY_HINT_STOPWORDS.has(value)) continue
      hints.add(value)
      if (hints.size >= 6) return
    }
  }

  COMPANY_HINT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = COMPANY_HINT_RE.exec(text)) !== null) {
    const value = match[1]?.trim()
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

export function isMediaInterpretationText(title: string, summary?: string | null) {
  const text = `${normalizeTitle(title)} ${normalizeTitle(summary ?? "")}`
  return MEDIA_INTERPRETATION_RE.test(text)
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
