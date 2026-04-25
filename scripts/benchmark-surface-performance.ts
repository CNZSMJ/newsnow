import process from "node:process"
import { performance } from "node:perf_hooks"
import { resolve } from "node:path"
import { config as loadEnv } from "dotenv"
import { consola } from "consola"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import type { InvestmentEventDetail, InvestmentProviderEventListResponse, SourceID, WatchlistRecord } from "../shared/types"
import { projectDir } from "../shared/dir"
import { EventProjectionTable } from "../server/database/event-projections"
import { InvestmentQueryService } from "../server/services/investment-query/service"
import {
  type SurfaceBenchmarkSample,
  type SurfaceKind,
  type WorkerState,
  buildEventDetailFanoutBreakdown,
  buildWorkerStateComparison,
  summarizeSurfaceSamples,
  validateSurfaceCoverage,
} from "../server/services/performance/surface-baseline"

loadEnv({
  path: resolve(projectDir, ".env.server"),
})

const globalWithLogger = globalThis as typeof globalThis & { logger: typeof consola }
globalWithLogger.logger = consola.withTag("surface-benchmark")

const DEFAULT_BASE_URL = process.env.SURFACE_BASE_URL || "http://127.0.0.1:3000"
const DEFAULT_ITERATIONS = 1
const DEFAULT_NEWS_SOURCES: SourceID[] = ["wallstreetcn-quick", "cls-telegraph", "weibo"]
const DEFAULT_SEARCH_QUERY = "政策"
const DEFAULT_ENTITY_QUERY = "600519"

const HELP_TEXT = `
Usage:
  pnpm perf:surface-baseline [--base-url <url>] [--iterations <number>] [--news-source <id>] [--event-id <id>] [--watchlist-id <id>]

Options:
  --base-url <url>       Local service base URL. Default: ${DEFAULT_BASE_URL}
  --iterations <number>  Repetitions per HTTP probe. Default: ${DEFAULT_ITERATIONS}
  --news-source <id>     Primary news source for news user/agent probes. Default: ${DEFAULT_NEWS_SOURCES[0]}
  --event-id <id>        Event id for detail benchmark. If omitted, latest event is discovered.
  --watchlist-id <id>    Watchlist id for watchlist benchmark. If omitted, first watchlist is discovered.
  --help, -h             Show this help text
`.trim()

interface Args {
  baseUrl: string
  iterations: number
  newsSource: SourceID
  eventId?: string
  watchlistId?: string
  help?: boolean
}

interface HttpProbe {
  name: string
  surface: SurfaceKind
  method?: "GET" | "POST"
  path: string
  body?: unknown
  metadata?: Record<string, unknown>
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    baseUrl: DEFAULT_BASE_URL,
    iterations: DEFAULT_ITERATIONS,
    newsSource: DEFAULT_NEWS_SOURCES[0],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") {
      args.help = true
      continue
    }
    if (arg === "--base-url") {
      args.baseUrl = String(argv[index + 1] || DEFAULT_BASE_URL).replace(/\/$/, "")
      index += 1
      continue
    }
    if (arg === "--iterations") {
      const parsed = Number(argv[index + 1])
      if (Number.isFinite(parsed) && parsed > 0) {
        args.iterations = Math.min(20, Math.floor(parsed))
      }
      index += 1
      continue
    }
    if (arg === "--news-source") {
      args.newsSource = argv[index + 1] as SourceID
      index += 1
      continue
    }
    if (arg === "--event-id") {
      args.eventId = argv[index + 1]
      index += 1
      continue
    }
    if (arg === "--watchlist-id") {
      args.watchlistId = argv[index + 1]
      index += 1
    }
  }

  return args
}

function buildUrl(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${baseUrl}${normalizedPath}`
}

async function readJson<T>(baseUrl: string, path: string, init?: RequestInit) {
  const response = await fetch(buildUrl(baseUrl, path), init)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return await response.json() as T
}

async function getWorkerState(baseUrl: string): Promise<WorkerState> {
  try {
    const status = await readJson<{ worker?: { running?: boolean } }>(baseUrl, "/api/ops/events/status?diagnosticLimit=1")
    if (status.worker?.running) return "active"
    return "inactive"
  } catch {
    return "unknown"
  }
}

async function discoverEventId(baseUrl: string) {
  try {
    const response = await readJson<InvestmentProviderEventListResponse>(baseUrl, "/api/investment-events/latest?limit=1&sort=latest")
    return response.items[0]?.eventId
  } catch {
    return undefined
  }
}

async function discoverWatchlistId(baseUrl: string) {
  try {
    const response = await readJson<{ items?: WatchlistRecord[] }>(baseUrl, "/api/watchlists")
    return response.items?.[0]?.watchlistId
  } catch {
    return undefined
  }
}

async function measureProbe(baseUrl: string, probe: HttpProbe, workerState: WorkerState): Promise<SurfaceBenchmarkSample> {
  const measuredAt = Date.now()
  const startedAt = performance.now()

  try {
    const response = await fetch(buildUrl(baseUrl, probe.path), {
      method: probe.method ?? "GET",
      headers: probe.body ? { "content-type": "application/json" } : undefined,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
    })
    const text = await response.text()
    const latencyMs = performance.now() - startedAt

    return {
      name: probe.name,
      surface: probe.surface,
      latencyMs,
      ok: response.ok,
      status: response.status,
      workerState,
      measuredAt,
      metadata: {
        ...probe.metadata,
        responseBytes: text.length,
      },
    }
  } catch (error) {
    return {
      name: probe.name,
      surface: probe.surface,
      latencyMs: performance.now() - startedAt,
      ok: false,
      workerState,
      measuredAt,
      error: error instanceof Error ? error.message : String(error),
      metadata: probe.metadata,
    }
  }
}

function getRelatedEventsQueryShape(detail: InvestmentEventDetail) {
  const primaryEntity = detail.primarySubject ?? detail.affectedEntities[0]
  const hasTopic = Boolean(detail.relatedTopics[0])
  const hasMarket = Boolean(detail.affectedMarkets[0])
  const hasFamily = Boolean(detail.eventFamily)
  const hasRelatedIndex = true

  return {
    queryCount: [hasRelatedIndex, primaryEntity, hasTopic, hasMarket, hasFamily].filter(Boolean).length,
    scanLimit: [hasRelatedIndex, primaryEntity, hasTopic, hasMarket, hasFamily].filter(Boolean).length * 6,
  }
}

async function measureEventDetailFanout(eventId: string | undefined, httpDetailMs: number | undefined) {
  if (!eventId || httpDetailMs === undefined) return undefined

  const dataDir = resolve(projectDir, process.env.DATA_DIR || ".data")
  const db = createDatabase(sqliteConnector({
    cwd: dataDir,
    path: "db.sqlite3",
  }))
  const projectionTable = new EventProjectionTable(db as never)
  const investmentQueryService = new InvestmentQueryService(projectionTable)

  const mainStartedAt = performance.now()
  const detail = await investmentQueryService.getEventDetail(eventId, {
    includeRelatedEvents: false,
  })
  const mainDetailQueryMs = performance.now() - mainStartedAt
  if (!detail) return undefined

  const shape = getRelatedEventsQueryShape(detail)
  const relatedStartedAt = performance.now()
  await investmentQueryService.getRelatedEvents(detail)
  const relatedEventsMs = performance.now() - relatedStartedAt

  return buildEventDetailFanoutBreakdown({
    eventId,
    httpDetailMs,
    mainDetailQueryMs,
    relatedEventsMs,
    relatedQueryCount: shape.queryCount,
    relatedScanLimit: shape.scanLimit,
  })
}

function buildProbes(args: Args, eventId?: string, watchlistId?: string): HttpProbe[] {
  const probes: HttpProbe[] = [
    {
      name: "news_user_single_source",
      surface: "news_user",
      path: `/api/s?id=${encodeURIComponent(args.newsSource)}`,
      metadata: { decisionRefs: ["PD-4", "TD-2"], currentHotPath: "news_http" },
    },
    {
      name: "news_user_entire_batch",
      surface: "news_user",
      method: "POST",
      path: "/api/s/entire",
      body: { sources: DEFAULT_NEWS_SOURCES },
      metadata: { decisionRefs: ["PD-4", "TD-10"], currentHotPath: "news_batch_http" },
    },
    {
      name: "news_agent_news_query_service_probe",
      surface: "news_agent",
      path: `/api/s?id=${encodeURIComponent(args.newsSource)}`,
      metadata: { decisionRefs: ["PD-4", "TD-4"], currentHotPath: "get_hotest_latest_news -> NewsQueryService", probeTransport: "http_adapter_equivalent" },
    },
    {
      name: "investment_user_latest",
      surface: "investment_user",
      path: "/api/investment-events/latest?limit=10&sort=investment",
      metadata: { decisionRefs: ["PD-4", "TD-3"], currentHotPath: "provider_http" },
    },
    {
      name: "investment_user_search",
      surface: "investment_user",
      path: `/api/investment-events/search?q=${encodeURIComponent(DEFAULT_SEARCH_QUERY)}&limit=10&sort=investment`,
      metadata: { decisionRefs: ["PD-4", "TD-3"], currentHotPath: "provider_http" },
    },
    {
      name: "investment_user_entity",
      surface: "investment_user",
      path: `/api/investment-events/entity?entity=${encodeURIComponent(DEFAULT_ENTITY_QUERY)}&limit=10&sort=investment`,
      metadata: { decisionRefs: ["PD-4", "TD-3"], currentHotPath: "provider_http" },
    },
    {
      name: "investment_agent_event_scan_hot_path",
      surface: "investment_agent",
      path: "/api/investment-events/latest?limit=10&sort=investment&focus=all",
      metadata: { decisionRefs: ["PD-4", "TD-4"], currentHotPath: "event_scan -> provider_http" },
    },
  ]

  if (eventId) {
    probes.push(
      {
        name: "investment_user_event_detail",
        surface: "investment_user",
        path: `/api/investment-events/${encodeURIComponent(eventId)}`,
        metadata: { decisionRefs: ["TD-9"], currentHotPath: "event_detail_http", eventId },
      },
      {
        name: "investment_agent_event_detail_hot_path",
        surface: "investment_agent",
        path: `/api/investment-events/${encodeURIComponent(eventId)}`,
        metadata: { decisionRefs: ["TD-9", "TD-4"], currentHotPath: "event_get_detail -> provider_http", eventId },
      },
    )
  }

  if (watchlistId) {
    probes.push(
      {
        name: "investment_user_watchlist_detail",
        surface: "investment_user",
        path: `/api/investment-watchlists/${encodeURIComponent(watchlistId)}?limit=10&sort=investment`,
        metadata: { decisionRefs: ["TD-9"], currentHotPath: "watchlist_detail_http", watchlistId },
      },
      {
        name: "investment_agent_watchlist_events_hot_path",
        surface: "investment_agent",
        path: `/api/investment-watchlists/${encodeURIComponent(watchlistId)}/events?limit=10&sort=investment`,
        metadata: { decisionRefs: ["TD-9", "TD-4"], currentHotPath: "watchlist_get_events -> provider_http", watchlistId },
      },
    )
  }

  return probes
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP_TEXT)
    return
  }

  const eventId = args.eventId ?? await discoverEventId(args.baseUrl)
  const watchlistId = args.watchlistId ?? await discoverWatchlistId(args.baseUrl)
  const probes = buildProbes(args, eventId, watchlistId)
  const samples: SurfaceBenchmarkSample[] = []

  for (let iteration = 0; iteration < args.iterations; iteration += 1) {
    const workerState = await getWorkerState(args.baseUrl)
    for (const probe of probes) {
      samples.push(await measureProbe(args.baseUrl, probe, workerState))
    }
  }

  const detailHttpSample = samples.find(sample => sample.name === "investment_user_event_detail" && sample.ok)
  const eventDetailFanout = await measureEventDetailFanout(eventId, detailHttpSample?.latencyMs)
  const coverage = validateSurfaceCoverage(samples)
  const allSamplesOk = samples.every(sample => sample.ok)

  const result = {
    status: coverage.ok && allSamplesOk ? "success" : "failed",
    updatedTime: Date.now(),
    command: "pnpm perf:surface-baseline",
    baseUrl: args.baseUrl,
    iterations: args.iterations,
    discovered: {
      eventId: eventId ?? null,
      watchlistId: watchlistId ?? null,
    },
    coverage,
    summary: summarizeSurfaceSamples(samples),
    workerStateComparison: buildWorkerStateComparison(samples),
    eventDetailFanout,
    samples,
  }

  console.log(JSON.stringify(result, null, 2))

  if (!coverage.ok || !allSamplesOk) {
    process.exitCode = 1
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
