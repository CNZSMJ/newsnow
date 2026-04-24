export const SOURCE_BUSINESS_LINES = ["news", "investment-event"] as const
export const SOURCE_PRIORITY_CLASSES = ["backfill_catch_up", "force_refresh", "routine_fetch"] as const
export const SOURCE_FETCH_STATUSES = ["fresh", "stale", "refreshing", "failed"] as const

export type SourceBusinessLine = typeof SOURCE_BUSINESS_LINES[number]
export type SourcePriorityClass = typeof SOURCE_PRIORITY_CLASSES[number]
export type SourceFetchStatus = typeof SOURCE_FETCH_STATUSES[number]
export type SourceFallbackPolicy = "serve_stale" | "empty_result" | "fail_request"

export interface NeutralRefreshIntent {
  businessLine: SourceBusinessLine
  sourceId: string
  sourceProfile?: string
  priorityClass: SourcePriorityClass
  reason: string
  requestedAt?: number
  dedupeKey?: string
  deadlineAt?: number
  ttlMs?: number
  maxConcurrency?: number
  fallbackPolicy?: SourceFallbackPolicy
}

export interface RefreshIntentReceipt {
  accepted: boolean
  dedupeKey: string
  reason?: "invalid_intent" | "duplicate"
  message?: string
}

export interface SourceFetchState {
  sourceId: string
  status: SourceFetchStatus
  updatedAt: number
  lastStartedAt?: number
  lastSuccessfulFetchedAt?: number
  lastFailedAt?: number
  itemCount?: number
  lastError?: string
}

export interface SharedSourceRuntimeOptions {
  maxConcurrency?: number
}

const PRIORITY_RANK: Record<SourcePriorityClass, number> = {
  backfill_catch_up: 0,
  force_refresh: 1,
  routine_fetch: 2,
}

const PROFILE_RANK: Record<string, number> = {
  trade_critical: 0,
  high_value: 1,
  default: 2,
  slow: 3,
}

const FORBIDDEN_INTENT_KEYS = new Set([
  "targetBusinessLine",
  "targetScheduler",
  "scheduler",
  "hotPath",
])

function nowMs() {
  return Date.now()
}

function getDedupeKey(intent: NeutralRefreshIntent) {
  return intent.dedupeKey ?? intent.sourceId
}

function isAllowedBusinessLine(value: unknown): value is SourceBusinessLine {
  return SOURCE_BUSINESS_LINES.includes(value as SourceBusinessLine)
}

function isAllowedPriorityClass(value: unknown): value is SourcePriorityClass {
  return SOURCE_PRIORITY_CLASSES.includes(value as SourcePriorityClass)
}

function getProfileRank(profile?: string) {
  if (!profile) return PROFILE_RANK.default
  return PROFILE_RANK[profile] ?? PROFILE_RANK.default
}

function isExpired(intent: NeutralRefreshIntent, now: number) {
  if (intent.deadlineAt !== undefined) return intent.deadlineAt < now
  if (intent.ttlMs !== undefined) return (intent.requestedAt ?? now) + intent.ttlMs < now
  return false
}

function validateIntent(intent: NeutralRefreshIntent) {
  const keys = Object.keys(intent)
  const forbiddenKey = keys.find(key => FORBIDDEN_INTENT_KEYS.has(key))
  if (forbiddenKey) return `forbidden cross-business key: ${forbiddenKey}`
  if (!isAllowedBusinessLine(intent.businessLine)) return "businessLine must use a neutral business line"
  if (!isAllowedPriorityClass(intent.priorityClass)) return "priorityClass must use a neutral priority class"
  if (!intent.sourceId) return "sourceId is required"
  if (!intent.reason) return "reason is required"
  return undefined
}

export class SharedSourceRuntime {
  private readonly maxConcurrency: number
  private queue: NeutralRefreshIntent[] = []
  private queuedDedupeKeys = new Set<string>()
  private runningByDedupeKey = new Map<string, NeutralRefreshIntent>()
  private sourceStates = new Map<string, SourceFetchState>()

  constructor(options: SharedSourceRuntimeOptions = {}) {
    this.maxConcurrency = Math.max(1, options.maxConcurrency ?? 4)
  }

  submitRefreshIntent(intent: NeutralRefreshIntent): RefreshIntentReceipt {
    const normalized: NeutralRefreshIntent = {
      ...intent,
      requestedAt: intent.requestedAt ?? nowMs(),
      fallbackPolicy: intent.fallbackPolicy ?? "serve_stale",
    }
    const dedupeKey = getDedupeKey(normalized)
    const invalidReason = validateIntent(normalized)
    if (invalidReason) {
      return {
        accepted: false,
        dedupeKey,
        reason: "invalid_intent",
        message: invalidReason,
      }
    }
    if (this.queuedDedupeKeys.has(dedupeKey) || this.runningByDedupeKey.has(dedupeKey)) {
      return {
        accepted: false,
        dedupeKey,
        reason: "duplicate",
      }
    }

    this.queue.push(normalized)
    this.queuedDedupeKeys.add(dedupeKey)
    if (!this.sourceStates.has(normalized.sourceId)) {
      this.sourceStates.set(normalized.sourceId, {
        sourceId: normalized.sourceId,
        status: "stale",
        updatedAt: normalized.requestedAt ?? nowMs(),
      })
    }

    return {
      accepted: true,
      dedupeKey,
    }
  }

  takeNextBatch(now = nowMs()) {
    this.dropExpiredIntents(now)
    const availableSlots = this.maxConcurrency - this.runningByDedupeKey.size
    if (availableSlots <= 0) return []

    const sorted = [...this.queue].sort((a, b) => {
      const priorityDiff = PRIORITY_RANK[a.priorityClass] - PRIORITY_RANK[b.priorityClass]
      if (priorityDiff !== 0) return priorityDiff
      const profileDiff = getProfileRank(a.sourceProfile) - getProfileRank(b.sourceProfile)
      if (profileDiff !== 0) return profileDiff
      return (a.requestedAt ?? 0) - (b.requestedAt ?? 0)
    })
    const selected = sorted.slice(0, availableSlots)
    const selectedKeys = new Set(selected.map(getDedupeKey))

    this.queue = this.queue.filter(intent => !selectedKeys.has(getDedupeKey(intent)))
    for (const selectedIntent of selected) {
      const dedupeKey = getDedupeKey(selectedIntent)
      this.queuedDedupeKeys.delete(dedupeKey)
      this.runningByDedupeKey.set(dedupeKey, selectedIntent)
      this.sourceStates.set(selectedIntent.sourceId, {
        ...this.getSourceFetchState(selectedIntent.sourceId),
        sourceId: selectedIntent.sourceId,
        status: "refreshing",
        lastStartedAt: now,
        updatedAt: now,
      })
    }

    return selected
  }

  recordFetchSuccess(input: {
    sourceId: string
    fetchedAt?: number
    itemCount: number
  }) {
    const fetchedAt = input.fetchedAt ?? nowMs()
    this.clearRunningSource(input.sourceId)
    this.sourceStates.set(input.sourceId, {
      ...this.getSourceFetchState(input.sourceId),
      sourceId: input.sourceId,
      status: "fresh",
      lastSuccessfulFetchedAt: fetchedAt,
      itemCount: input.itemCount,
      lastError: undefined,
      updatedAt: fetchedAt,
    })
  }

  recordFetchFailure(input: {
    sourceId: string
    fetchedAt?: number
    error: string
  }) {
    const fetchedAt = input.fetchedAt ?? nowMs()
    this.clearRunningSource(input.sourceId)
    this.sourceStates.set(input.sourceId, {
      ...this.getSourceFetchState(input.sourceId),
      sourceId: input.sourceId,
      status: "failed",
      lastFailedAt: fetchedAt,
      lastError: input.error,
      updatedAt: fetchedAt,
    })
  }

  markSourceStale(sourceId: string, updatedAt = nowMs()) {
    this.sourceStates.set(sourceId, {
      ...this.getSourceFetchState(sourceId),
      sourceId,
      status: "stale",
      updatedAt,
    })
  }

  getSourceFetchState(sourceId: string): SourceFetchState {
    return this.sourceStates.get(sourceId) ?? {
      sourceId,
      status: "stale",
      updatedAt: 0,
    }
  }

  getQueueDepth() {
    return this.queue.length
  }

  getRunningCount() {
    return this.runningByDedupeKey.size
  }

  private dropExpiredIntents(now: number) {
    const expiredKeys = new Set(
      this.queue
        .filter(intent => isExpired(intent, now))
        .map(getDedupeKey),
    )
    if (!expiredKeys.size) return
    this.queue = this.queue.filter(intent => !expiredKeys.has(getDedupeKey(intent)))
    for (const key of expiredKeys) this.queuedDedupeKeys.delete(key)
  }

  private clearRunningSource(sourceId: string) {
    for (const [dedupeKey, intent] of this.runningByDedupeKey.entries()) {
      if (intent.sourceId === sourceId) {
        this.runningByDedupeKey.delete(dedupeKey)
      }
    }
  }
}
