# Investment Event Delivery Board

Status: Active execution board  
Last updated: 2026-04-12 (late)  
Scope: project-management view of the investment event system upgrade

## 1. Operating rule

This board exists to keep execution aligned with one architectural rule:

> the backend event engine is the single source of truth and the single source of investment semantics  
> frontend investor views and agent-facing interfaces are projections of that same truth

No task on this board is allowed to move business semantics into the frontend or into agent-specific wrappers.

## 2. Workstream status snapshot

| Workstream | Current stage | Status | What is already true | Next milestone |
| --- | --- | --- | --- | --- |
| Backend unified engine | Canonical investment projection | In progress | Canonical events, facts, evidence, impact, replay, shadow, observability, investment projection all exist | Increase semantic precision and projection quality |
| Frontend investor surface | Investor workbench v1 | In progress | `/events`, `/events/:id`, `/watchlists`, `/watchlists/:id` are live, use provider-facing investment routes, and support action-bucket scanning | Deepen workbench behaviors and high-volume workflows |
| Agent/provider interface | Provider contract v2 | In progress | Explicit provider routes exist and local MCP exposes task-oriented scan/detail tools over the same projection | Harden provider schema and reduce remaining downstream reconstruction |

## 3. Completed foundation

### Backend

- [x] Event engine phases 1-4 completed
- [x] Canonical event/fact/evidence/timeline storage
- [x] Source profiles and first-class extractors
- [x] Replay, shadow, metrics, and backfill capabilities
- [x] Canonical investment projection (`investment-view.ts`)

### Frontend

- [x] Event list page
- [x] Event detail page
- [x] Watchlist list page
- [x] Watchlist detail page
- [x] Investor-language detail sections
- [x] Action buckets: actionable / watch / noise
- [x] Related-event navigation by entity/topic/market/family
- [x] Frontend investment pages switched to explicit provider routes

### Agent/provider

- [x] Local MCP switched to investment projection
- [x] Structured content returned by event tools
- [x] Facts, evidence, and investment interpretation exposed together
- [x] Explicit provider routes added for event and watchlist investment payloads
- [x] Task-oriented MCP tools added: `event_scan`, `event_get_detail`, `watchlist_scan`

## 4. Current execution tranche

### Tranche A: projection quality

Objective:

- make the canonical investment projection more decision-useful before adding new surfaces

Tasks:

- [x] Add `actionBucket` to the canonical investment projection
- [x] Push action buckets into frontend list and detail views
- [x] Push action buckets into local MCP summaries
- [x] Tighten `whyItMatters` quality for more event families
- [x] Tighten `whatToWatchNext` quality for more event families
- [x] Tighten `riskOfMisread` quality for more event families
- [x] Add explicit `whatHappened` field to the canonical projection
- [x] Add explicit `whoIsAffected` field to the canonical projection
- [x] Make `eventFamily` a first-class filter across API, frontend, and MCP

### Tranche B: investor workbench

Objective:

- move the frontend from event browsing to decision support

Tasks:

- [x] Group event list by action bucket
- [x] Add related events to event detail
- [x] Add related events by market as a third fallback layer
- [x] Surface same-family context where useful
- [x] Add list-level summary counts by action bucket and market
- [x] Improve list scan speed for high-volume sessions
- [x] Show “what happened” and “who is affected” explicitly in event detail
- [x] Expose event-family filtering in the event scanner

### Tranche C: provider contract hardening

Objective:

- make the provider-facing MCP contract more stable and audit-friendly

Tasks:

- [x] Keep `structuredContent` aligned with the canonical projection
- [x] Include action bucket in MCP summary output
- [x] Include misread risk in MCP summary output
- [x] Separate default vs debug-only event fields more strictly
- [x] Add MCP contract tests around the projected investment object
- [x] Prepare explicit provider handoff notes for `nexus-fi-mcp`
- [x] Move related-event assembly behind a backend canonical service
- [x] Unify watchlist detail behind the investment projection
- [x] Add explicit provider routes for investment events and watchlists
- [x] Add provider-level focus filtering for actionable/watchable scans
- [x] Add task-oriented MCP scan/detail tools over the provider contract

### Tranche D: workbench convergence

Objective:

- make investor surfaces and local MCP consume the provider contract directly, with backend-owned focus semantics

Tasks:

- [x] Switch event list to `/api/investment-events/latest`
- [x] Switch event detail to `/api/investment-events/:id`
- [x] Switch watchlist detail to `/api/investment-watchlists/:id`
- [x] Move focus filtering (`all / actionable / watchable`) into provider routes
- [x] Let event and watchlist scans reuse provider focus semantics instead of client-side overfetch
- [x] Add richer watchlist workflow summaries and monitoring cues
- [x] Add provider-backed search/entity flows to the investor workbench where they improve navigation

### Tranche E: investor workbench quality

Objective:

- make the investor surface feel like a working decision console rather than a filtered event browser

Tasks:

- [x] Add watchlist-level summary cards for dominant families, markets, next checks, and misread risks
- [x] Add `/events` workbench search modes: default scan, keyword search, entity search
- [x] Keep search/entity flows on explicit provider routes instead of compatibility projection paths
- [x] Add quick navigation between scan results and watchlists where it improves monitoring flow
- [x] Add stronger “why this is actionable now” presentation for high-priority events
- [x] Add more compact high-volume mode for busy market sessions

### Tranche F: semantic precision hardening

Objective:

- tighten investment semantics so investor and agent surfaces inherit clearer subjects, cleaner families, and fewer ambiguous research/news mixes

Tasks:

- [x] Add `actionReason` as a first-class backend projection field
- [x] Add backend-owned `subjectSummary` and `publisherInstitution` instead of frontend subject reconstruction
- [x] Split `industry_report` from `industry_data` for research/report sources
- [x] Continue splitting `policy_signal` and `disclosure_signal` from broader fallback families where warranted
- [ ] Raise entity precision for issuer vs institution vs market display in more source families
- [ ] Reduce remaining generic `general_news` fallback usage for high-value sources

## 5. Definition of done for the current tranche

The current tranche is complete when:

1. frontend investor routes consume only provider-facing investment routes for event/watchlist detail and scanning
2. provider routes own focus filtering semantics for actionable and watch-worthy scans
3. local MCP task-oriented tools consume the same provider contract as the investor surface
4. legacy `/api/events/*` read routes are removed from the public consumer surface, and event-engine operations are separated under `/api/ops/events/*`
5. all of the above are covered by targeted tests and pass build validation

## 6. Validation cadence

Every completed task in the active tranche must pass:

- targeted unit tests where relevant
- replay/shadow-sensitive tests when semantics change
- `pnpm build`

If a change alters event meaning, it should also be checked against replay fixtures before the tranche is closed.
