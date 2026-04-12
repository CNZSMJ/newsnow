import process from "node:process"
import { myFetch } from "#/utils/fetch"

interface TdxSearchItem {
  code: string
  full_code: string
  name: string
  exchange: string
  asset_type: string
  decimal?: number
  multiple?: number
  last_price?: number
}

interface TdxSearchResponse {
  code: number
  message: string
  data?: {
    count?: number
    list?: TdxSearchItem[]
  }
}

interface SecurityResolveResult {
  code: string
  fullCode: string
  name: string
  assetType: string
  exchange: string
}

const resolveCache = new Map<string, { expiresAt: number, value: SecurityResolveResult | null }>()
const CACHE_TTL = 6 * 60 * 60 * 1000
const CACHE_MAX_SIZE = 500

function getBaseUrl() {
  return (process.env.TDX_API_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "")
}

function getCacheKey(kind: string, keyword: string) {
  return `${kind}:${keyword.toLowerCase()}`
}

function sweepResolveCache(now = Date.now()) {
  for (const [key, entry] of resolveCache) {
    if (entry.expiresAt <= now) {
      resolveCache.delete(key)
    }
  }
}

function trimResolveCache(maxSize = CACHE_MAX_SIZE) {
  if (resolveCache.size <= maxSize) return
  const overflow = resolveCache.size - maxSize
  const keys = resolveCache.keys()
  for (let index = 0; index < overflow; index += 1) {
    const next = keys.next()
    if (next.done) return
    resolveCache.delete(next.value)
  }
}

async function searchSecurity(keyword: string, assetType = "stock", limit = 5) {
  const url = new URL(`${getBaseUrl()}/api/search`)
  url.searchParams.set("keyword", keyword)
  url.searchParams.set("asset_type", assetType)
  url.searchParams.set("limit", String(limit))
  const res = await myFetch<TdxSearchResponse>(url.toString())
  return res.data?.list ?? []
}

function getExactMatch(items: TdxSearchItem[], keyword: string) {
  const normalized = keyword.toLowerCase()
  return items.find(item => item.full_code.toLowerCase() === normalized
    || item.code.toLowerCase() === normalized
    || item.name.toLowerCase() === normalized)
}

async function resolveWithCache(kind: string, keyword: string, resolver: () => Promise<SecurityResolveResult | null>) {
  const now = Date.now()
  sweepResolveCache(now)
  const key = getCacheKey(kind, keyword)
  const cached = resolveCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }
  try {
    const value = await resolver()
    resolveCache.set(key, { value, expiresAt: now + CACHE_TTL })
    trimResolveCache()
    return value
  } catch (error) {
    logger.error(`tdx-api resolve failed for ${kind}:${keyword}`, error)
    resolveCache.set(key, { value: null, expiresAt: now + 60 * 1000 })
    trimResolveCache()
    return null
  }
}

export async function resolveSecurityByCode(keyword: string) {
  return resolveWithCache("code", keyword, async () => {
    const items = await searchSecurity(keyword, "stock", 5)
    const hit = getExactMatch(items, keyword) ?? items.find(item => item.code === keyword.slice(-6))
    if (!hit) return null
    return {
      code: hit.code,
      fullCode: hit.full_code,
      name: hit.name,
      assetType: hit.asset_type,
      exchange: hit.exchange,
    }
  })
}

export async function resolveSecurityByName(keyword: string) {
  return resolveWithCache("name", keyword, async () => {
    const items = await searchSecurity(keyword, "stock", 5)
    const hit = getExactMatch(items, keyword)
      ?? items.find(item => item.name === keyword)
      ?? items.find(item => item.name.includes(keyword) || keyword.includes(item.name))
    if (!hit) return null
    return {
      code: hit.code,
      fullCode: hit.full_code,
      name: hit.name,
      assetType: hit.asset_type,
      exchange: hit.exchange,
    }
  })
}
