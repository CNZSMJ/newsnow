import process from "node:process"
import { $fetch } from "ofetch"
import sources from "../shared/sources"
import industryResearchSources from "../server/sources/industryResearch"

interface SmokeResult {
  id: string
  status: "ok" | "empty" | "error"
  count?: number
  sampleTitle?: string
  error?: string
}

const includeAll = process.argv.includes("--all")
const timeoutMs = Number(process.env.INDUSTRY_SOURCE_SMOKE_TIMEOUT_MS ?? 8000)

;(globalThis as typeof globalThis & { myFetch?: typeof $fetch }).myFetch = $fetch.create({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  },
  retry: 0,
  timeout: Math.min(timeoutMs, 10_000),
})

function enabledIndustryResearchSourceIds() {
  return new Set(
    Object.entries(sources)
      .filter(([, source]) => source.column === "industry" && !source.redirect)
      .map(([sourceId]) => sourceId),
  )
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`smoke timeout ${ms}ms`)), ms)),
  ])
}

async function checkSource(id: string): Promise<SmokeResult> {
  try {
    const getter = industryResearchSources[id as keyof typeof industryResearchSources]
    if (!getter) throw new Error(`missing industryResearch getter for ${id}`)
    const items = await withTimeout(getter(), timeoutMs)
    return {
      id,
      status: items.length > 0 ? "ok" : "empty",
      count: items.length,
      sampleTitle: items[0]?.title,
    }
  } catch (error) {
    return {
      id,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const enabledIds = enabledIndustryResearchSourceIds()
  const sourceIds = Object.keys(industryResearchSources)
    .filter(sourceId => includeAll || enabledIds.has(sourceId))
    .sort()

  const results = await Promise.all(sourceIds.map(checkSource))
  const failed = results.filter(result => result.status !== "ok")

  console.log(JSON.stringify({
    status: failed.length === 0 ? "passed" : "failed",
    mode: includeAll ? "all" : "enabled",
    checked: results.length,
    ok: results.filter(result => result.status === "ok").length,
    empty: results.filter(result => result.status === "empty").length,
    error: results.filter(result => result.status === "error").length,
    results,
  }, null, 2))

  if (!includeAll && failed.length) {
    process.exitCode = 1
  }
}

main()
