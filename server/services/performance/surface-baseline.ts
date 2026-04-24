export const REQUIRED_SURFACES = [
  "news_user",
  "news_agent",
  "investment_user",
  "investment_agent",
] as const

export type SurfaceKind = typeof REQUIRED_SURFACES[number]
export type WorkerState = "active" | "inactive" | "unknown"

export interface SurfaceBenchmarkSample {
  name: string
  surface: SurfaceKind
  latencyMs: number
  ok: boolean
  status?: number
  error?: string
  workerState: WorkerState
  measuredAt: number
  metadata?: Record<string, unknown>
}

export interface SurfaceLatencySummary {
  count: number
  successCount: number
  failureCount: number
  avgMs: number | null
  minMs: number | null
  p50Ms: number | null
  p95Ms: number | null
  maxMs: number | null
}

export type SurfaceSummary = Partial<Record<SurfaceKind, SurfaceLatencySummary>>

export interface SurfaceCoverageValidation {
  ok: boolean
  requiredSurfaces: SurfaceKind[]
  coveredSurfaces: SurfaceKind[]
  missingSurfaces: SurfaceKind[]
}

export interface WorkerStateSummary extends SurfaceLatencySummary {
  surfaces: SurfaceKind[]
}

export type WorkerStateComparison = Partial<Record<WorkerState, WorkerStateSummary>>

export interface EventDetailFanoutBreakdownInput {
  eventId: string
  httpDetailMs: number
  mainDetailQueryMs: number
  relatedEventsMs: number
  relatedQueryCount: number
  relatedScanLimit: number
}

export interface EventDetailFanoutBreakdown extends EventDetailFanoutBreakdownInput {
  estimatedAdapterAndProjectionMs: number
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}

function summarizeLatencies(samples: Pick<SurfaceBenchmarkSample, "latencyMs" | "ok">[]): SurfaceLatencySummary {
  const successLatencies = samples
    .filter(sample => sample.ok)
    .map(sample => sample.latencyMs)
    .sort((a, b) => a - b)

  const successCount = successLatencies.length
  const failureCount = samples.length - successCount

  if (!successCount) {
    return {
      count: samples.length,
      successCount,
      failureCount,
      avgMs: null,
      minMs: null,
      p50Ms: null,
      p95Ms: null,
      maxMs: null,
    }
  }

  const percentile = (p: number) => {
    const index = Math.max(0, Math.ceil((p / 100) * successLatencies.length) - 1)
    return roundMs(successLatencies[index])
  }

  const sum = successLatencies.reduce((total, value) => total + value, 0)

  return {
    count: samples.length,
    successCount,
    failureCount,
    avgMs: roundMs(sum / successCount),
    minMs: roundMs(successLatencies[0]),
    p50Ms: percentile(50),
    p95Ms: percentile(95),
    maxMs: roundMs(successLatencies[successLatencies.length - 1]),
  }
}

export function summarizeSurfaceSamples(samples: SurfaceBenchmarkSample[]): SurfaceSummary {
  const summary: SurfaceSummary = {}

  for (const surface of REQUIRED_SURFACES) {
    const surfaceSamples = samples.filter(sample => sample.surface === surface)
    if (surfaceSamples.length) {
      summary[surface] = summarizeLatencies(surfaceSamples)
    }
  }

  return summary
}

export function validateSurfaceCoverage(samples: SurfaceBenchmarkSample[]): SurfaceCoverageValidation {
  const coveredSurfaces = REQUIRED_SURFACES.filter(surface =>
    samples.some(sample => sample.surface === surface && sample.ok),
  )
  const missingSurfaces = REQUIRED_SURFACES.filter(surface => !coveredSurfaces.includes(surface))

  return {
    ok: missingSurfaces.length === 0,
    requiredSurfaces: [...REQUIRED_SURFACES],
    coveredSurfaces,
    missingSurfaces,
  }
}

export function buildWorkerStateComparison(samples: SurfaceBenchmarkSample[]): WorkerStateComparison {
  const comparison: WorkerStateComparison = {}
  const workerStates: WorkerState[] = ["active", "inactive", "unknown"]

  for (const workerState of workerStates) {
    const stateSamples = samples.filter(sample => sample.workerState === workerState)
    if (!stateSamples.length) continue
    comparison[workerState] = {
      ...summarizeLatencies(stateSamples),
      surfaces: Array.from(new Set(stateSamples.map(sample => sample.surface))),
    }
  }

  return comparison
}

export function buildEventDetailFanoutBreakdown(input: EventDetailFanoutBreakdownInput): EventDetailFanoutBreakdown {
  return {
    ...input,
    estimatedAdapterAndProjectionMs: roundMs(Math.max(
      0,
      input.httpDetailMs - input.mainDetailQueryMs - input.relatedEventsMs,
    )),
  }
}
