type InvestmentViewProjectionPhase = "write-time" | "query-time" | "presentation"

interface InvestmentViewFunctionClassification {
  phase: InvestmentViewProjectionPhase
  targetOwner: "investment-event"
  targetContract: string
  decisionRefs: string[]
  migrationNote: string
}

export const INVESTMENT_VIEW_FUNCTION_CLASSIFICATION: Record<string, InvestmentViewFunctionClassification> = {
  getInvestmentEventFamily: {
    phase: "write-time",
    targetOwner: "investment-event",
    targetContract: "event_projection.event_family",
    decisionRefs: ["TD-3", "TD-9", "TD-10"],
    migrationNote: "Family classification must be materialized with the canonical event projection, not recomputed per request.",
  },
  matchesInvestmentEventFamily: {
    phase: "query-time",
    targetOwner: "investment-event",
    targetContract: "event_query_indexes.event_family",
    decisionRefs: ["TD-3", "TD-9", "TD-10"],
    migrationNote: "Sprint 3 query filters should read indexed event_family; this helper is a compatibility predicate until route filters switch.",
  },
  formatAffectedMarketLabel: {
    phase: "presentation",
    targetOwner: "investment-event",
    targetContract: "surface adapter label",
    decisionRefs: ["PD-5", "TD-4"],
    migrationNote: "Human-readable labels may remain adapter-level because they do not create investment semantics.",
  },
  getInvestmentEventFamilyLabel: {
    phase: "presentation",
    targetOwner: "investment-event",
    targetContract: "surface adapter label",
    decisionRefs: ["PD-5", "TD-4"],
    migrationNote: "Labels present backend-owned family semantics; they must not change classification.",
  },
  getInvestmentActionLabel: {
    phase: "presentation",
    targetOwner: "investment-event",
    targetContract: "surface adapter label",
    decisionRefs: ["PD-5", "TD-4"],
    migrationNote: "Labels present backend-owned action bucket semantics; they must not change action bucket assignment.",
  },
  getDirectionalViewLabel: {
    phase: "presentation",
    targetOwner: "investment-event",
    targetContract: "surface adapter label",
    decisionRefs: ["PD-5", "TD-4"],
    migrationNote: "Directional semantics remain backend-owned; label translation can stay presentation-only.",
  },
  getTradableNowLabel: {
    phase: "presentation",
    targetOwner: "investment-event",
    targetContract: "surface adapter label",
    decisionRefs: ["PD-5", "TD-4"],
    migrationNote: "Tradability semantics remain backend-owned; label translation can stay presentation-only.",
  },
  projectInvestmentEventBrief: {
    phase: "write-time",
    targetOwner: "investment-event",
    targetContract: "event_projection.brief_json + event_query_indexes",
    decisionRefs: ["PD-5", "TD-3", "TD-10"],
    migrationNote: "Brief projection computes investor semantics and must move to canonical write/projection refresh, then be read by latest/search/entity/watchlist/MCP surfaces.",
  },
  projectInvestmentEventDetail: {
    phase: "write-time",
    targetOwner: "investment-event",
    targetContract: "event_projection.detail_json",
    decisionRefs: ["PD-5", "TD-3", "TD-10"],
    migrationNote: "Detail projection combines backend-owned facts/evidence/timeline into investor contract; route-level fan-out should read projection in Sprint 4.",
  },
  getInvestmentRelatedSectionDisplayLabel: {
    phase: "presentation",
    targetOwner: "investment-event",
    targetContract: "surface adapter label",
    decisionRefs: ["TD-4", "TD-9"],
    migrationNote: "Related-events relationship selection is query-model owned; section labels can remain presentation-only.",
  },
}

export function assertInvestmentViewClassificationCoverage(exportedFunctionNames: string[]) {
  const classified = new Set(Object.keys(INVESTMENT_VIEW_FUNCTION_CLASSIFICATION))
  const exported = new Set(exportedFunctionNames)
  const missing = exportedFunctionNames.filter(name => !classified.has(name))
  const extra = Array.from(classified).filter(name => !exported.has(name))

  if (missing.length) throw new Error(`Missing investment-view classification: ${missing.join(", ")}`)
  if (extra.length) throw new Error(`Stale investment-view classification: ${extra.join(", ")}`)

  for (const [name, classification] of Object.entries(INVESTMENT_VIEW_FUNCTION_CLASSIFICATION)) {
    if (!classification.decisionRefs.length) {
      throw new Error(`Investment-view classification ${name} must include decisionRefs`)
    }
    if (!classification.migrationNote.trim()) {
      throw new Error(`Investment-view classification ${name} must include migrationNote`)
    }
  }
}
