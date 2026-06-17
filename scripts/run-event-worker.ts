import process from "node:process"
import { resolve } from "node:path"
import { config as loadEnv } from "dotenv"
import { consola } from "consola"
import type { SourceID } from "@shared/types"
import { projectDir } from "../shared/dir"
import { ingestEventSources } from "../server/services/event-engine/scheduler"

loadEnv({
  path: resolve(projectDir, ".env.server"),
});

(globalThis as typeof globalThis & { logger: typeof consola }).logger = consola.withTag("event-worker")

const DEFAULT_PREFLIGHT_SOURCES = [
  "mktnews-flash",
  "wallstreetcn-quick",
  "wallstreetcn-news",
  "wallstreetcn-hot",
  "cls-depth",
  "cls-hot",
  "xueqiu-hotstock",
  "gelonghui",
  "fastbull-express",
  "fastbull-news",
  "eastmoney-7x24",
  "sina-7x24",
  "jin10",
] as SourceID[]

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.floor(parsed)
}

function parseSources(value: string | undefined) {
  if (!value?.trim()) return DEFAULT_PREFLIGHT_SOURCES
  return value.split(",").map(item => item.trim()).filter(Boolean) as SourceID[]
}

function parseArgs(argv: string[]) {
  const options = {
    intervalMs: parsePositiveInteger(process.env.EVENT_WORKER_INTERVAL_MS, 10 * 60 * 1000),
    once: process.env.EVENT_WORKER_ONCE === "true",
    force: process.env.EVENT_WORKER_FORCE === "true",
    sources: parseSources(process.env.EVENT_WORKER_SOURCES),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--once") {
      options.once = true
      continue
    }
    if (arg === "--force") {
      options.force = true
      continue
    }
    if (arg === "--interval-ms") {
      options.intervalMs = parsePositiveInteger(argv[index + 1], options.intervalMs)
      index += 1
      continue
    }
    if (arg === "--sources") {
      options.sources = parseSources(argv[index + 1])
      index += 1
    }
  }

  return options
}

async function runOnce(options: ReturnType<typeof parseArgs>) {
  const startedAt = Date.now()
  logger.info(`event worker tick started, sources=${options.sources.join(",")}`)
  const result = await ingestEventSources({
    sourceIds: options.sources,
    force: options.force,
  })
  logger.info(JSON.stringify({
    status: "success",
    durationMs: Date.now() - startedAt,
    ingestedSources: result.ingestedSources,
    replayedRawItems: result.replayedRawItems,
    removedEvents: result.removedEvents,
  }))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  logger.info(`event worker started, intervalMs=${options.intervalMs}, once=${options.once}, force=${options.force}`)

  do {
    try {
      await runOnce(options)
    } catch (error) {
      logger.error("event worker tick failed", error)
    }
    if (options.once) return
    await new Promise(resolve => setTimeout(resolve, options.intervalMs))
  } while (true)
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
