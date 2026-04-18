# Investment Event Post-Foundation Tracking

Status: Completed
Last updated: 2026-04-18
Scope: execution tracker for post-foundation latency remediation, semantic precision hardening, and runbook closure in `events`

## 1. Required documents read

The following documents were read before code changes:

1. [docs/investment-event-foundation-roadmap.md](./investment-event-foundation-roadmap.md)
2. [docs/investment-event-workstreams.md](./investment-event-workstreams.md)
3. [docs/investment-event-delivery-board.md](./investment-event-delivery-board.md)
4. [docs/event-operations-runbook.md](./event-operations-runbook.md)

Key post-foundation entry point confirmed from roadmap:

- use diagnostics to burn down priority-source latency blockers
- execute under stratified latency thresholds rather than one flat target
- keep semantic hardening focused on high-value source families first
- prevent long-tail fallback from polluting canonical entity truth
- keep operations runbook-driven and in-repo

## 2. Architecture red lines

These are non-negotiable for the current tranche:

- keep `initial canonical latency` separate from `full semantic enrichment latency`
- optimize time-to-first-truth without writing dirty canonical subjects, entity links, market links, or merges
- do not reopen or replace the closed foundation model
- do not let long-tail fallback pollute the canonical entity registry or subject truth
- keep backend event engine as the single source of truth for events, facts, evidence, entity linkage, and investment semantics

## 3. Dynamic baseline capture plan

The first live baseline pass must capture both current latency and current gate status.

Commands to run:

- `pnpm events:ops-report -- --hours 24 --limit 20`
- `pnpm events:check-quality`
- `curl http://127.0.0.1:3000/api/ops/events/status`

What to record from the baseline:

- slowest source kinds
- slowest source ids
- which latency tier each slow source belongs to
- whether current quality-gate failures are caused by latency, semantic fallback, or another regression
- whether current diagnostics already distinguish `initial canonical latency` from `full semantic enrichment latency`

## 4. Tranche 1

Objective:

- establish the real post-foundation baseline and encode stratified latency thresholds into the quality-gate path without regressing foundation semantics

Scope:

- inspect the live slow-source breakdown over the most recent 24-hour window
- map current high-value source kinds into Tier A / Tier B / Tier C
- update SLO and quality-gate code so latency checks are tier-aware instead of one flat aggregate blocker
- keep validation and runbook references in sync with the new tiered contract

Not in scope:

- broad source-by-source worker rewrites before the tiering contract is in place
- long-tail semantic cleanup that does not affect high-value source families
- any frontend-only workaround for backend latency or semantics

## 5. Known blockers at start

Known before the first baseline run:

- foundation roadmap closed with `prioritySourceIngestLatencyP95Ms` still failing on real data
- recent diagnostics already called out `official_policy_notice`, `official_macro_release`, `official_central_bank_operation`, `official_rate_fixing`, and `cninfo-hk-gem` as likely slow-source candidates
- manual review for entity precision, false merges, missed merges, and replay consistency is still only partially operationalized

## 6. Execution log

### 2026-04-18 — Tracking initialized

- completed mandatory document read in the required order
- recorded architecture red lines and baseline plan
- opened Tranche 1 for baseline capture and stratified latency threshold implementation

### 2026-04-18 — Live baseline captured

Commands run:

- `pnpm events:ops-report -- --hours 24 --limit 20`
- `pnpm events:check-quality`
- `curl http://127.0.0.1:3000/api/ops/events/status`

Observed baseline:

- current automated blocker is still the flat gate `prioritySourceIngestLatencyP95Ms`
- current runtime snapshot is otherwise healthy on structure and fallback:
  - `highValueStructuredCoveragePct = 100`
  - `highValueGenericFallbackSharePct = 0`
- current blocking latency reading:
  - `prioritySourceIngestLatencyP95Ms = 4489015 ms`
- slowest high-value source kinds in the last 24 hours:
  - `official_policy_notice`
  - `official_macro_release`
  - `official_central_bank_operation`
  - `official_rate_fixing`
  - `exchange_disclosure`
- most obvious slow source ids:
  - `cninfo-hk-gem`
  - `nhsa-dynamic`
  - `miit-industry`
  - `szse-news`
  - `mof-news`
  - `gov-latest`
  - `pbc-news`
  - `sasac-latest`
  - `stats-industry`
  - `pbc-omo`
  - `chinamoney-shibor`
  - `chinamoney-fdr007`

Engineering decision recorded:

- Tranche 1 will first replace the flat automated latency blocker with stratified tier-aware gates and dual-latency visibility
- Tranche 2 will only start after tier-aware gating is implemented and validated

Current blocker:

- the current quality-gate contract does not yet encode Tier A / Tier B / Tier C thresholds, so `events:check-quality` still fails on an intentionally outdated aggregate latency contract

### 2026-04-18 — Tranche 1 completed: stratified latency thresholds coded into runtime gates

Code closed:

- `server/services/event-engine/slo.ts`
- `server/services/event-engine/quality-gates.ts`
- `server/database/events.ts`
- `server/api/ops/events/status.ts`

Engineering decisions:

- encoded Tier A / Tier B / Tier C directly into runtime snapshot and release gating
- kept Tier A as automated blocking
- kept Tier B / Tier C visible but non-blocking until publication clocks are trustworthy enough for minute-level automation
- split the runtime contract into `initial canonical latency` and `full semantic enrichment latency`

Verification:

- `pnpm exec vitest run server/services/event-engine/slo.test.ts server/services/event-engine/quality-gates.test.ts server/database/events.test.ts`

### 2026-04-18 — Tranche 2 completed: latency remediation stabilized the Tier A gate

Root causes confirmed:

- `events.ingested_at` had been overwritten on refresh loops, inflating canonical latency
- canonical merge survivors were not preserving the earliest ingest timestamp from merged duplicates
- a meaningful subset of precise-clock Tier A rows belonged to backlog catch-up batches after long source fetch gaps

Code and data closure:

- `server/database/events.ts` now preserves first-ingest semantics on upsert and on duplicate merges
- `scripts/repair-event-ingested-at.ts` is the standard repair path for historical rows
- automated latency sampling now excludes precise-clock rows that arrive after outsized fetch gaps and records them as `backlog catch-up`

Repair run:

- `pnpm events:repair-ingested-at`
- `scannedEvents = 51907`
- `updatedEvents = 1220`

Resulting runtime baseline:

- `tradeCriticalInitialCanonicalLatencyP95Ms = 273961`
- `highValueStructuredCoveragePct = 100`
- `highValueGenericFallbackSharePct = 0`
- `highValueBacklogCatchupEventCount = 469`
- `releaseStatus = ready`

Key rationale recorded:

- backlog catch-up remains visible in diagnostics and runbook triage
- backlog catch-up is not allowed to poison steady-state automated Tier A release gating
- coarse-clock Tier B / Tier C families remain visible but non-automated until source timestamps improve

### 2026-04-18 — Tranche 3 completed: semantic precision hardening held on high-value families

Audit pass completed over recent high-value families with zero residual system-wide regressions in the checked buckets:

- high-value `general_news / other` fallback pollution in the recent audit window: `0`
- event-container or media-signature primary entity pollution in the recent audit window: `0`
- broad-market descriptor pollution in canonical subject fallback in the recent audit window: `0`

Decision:

- no new semantic code patch was required in this tranche after the latency/ingest fixes
- semantic hardening stays focused on high-value families; long-tail remains conservative but must not pollute canonical truth

### 2026-04-18 — Tranche 4 completed: runbook and verification closed

Runbook updates:

- clarified precise-clock gating vs coarse-clock visibility
- clarified `ingested_at` as first canonical detection and `last_seen_at` as refresh marker
- added backlog catch-up exclusion as a first-class triage and gating concept
- codified `pnpm events:repair-ingested-at` as a standard repair command

Final validation:

- `pnpm exec vitest run server/services/event-engine/slo.test.ts server/services/event-engine/quality-gates.test.ts server/database/events.test.ts`
- `pnpm events:repair-ingested-at`
- `pnpm events:ops-report -- --hours 24 --limit 20`
- `pnpm events:check-quality`
- `pnpm typecheck`
- `pnpm build`

Final status:

- Tranche 1: green
- Tranche 2: green
- Tranche 3: green
- Tranche 4: green
- post-foundation execution goal for this cycle: closed

Residual visibility, not blockers:

- Tier B and Tier C still rely mainly on coarse day-level publication clocks
- manual sampled gates for entity precision, false merges, missed merges, and replay consistency remain non-automated review items by design

### 2026-04-18 — Post-close correction: backlog classification now uses persisted poll history

Blocker discovered during uncommitted review:

- backlog catch-up exclusion had been inferred from `raw_items` item-bearing batches instead of true source poll history
- a fixed 7-day lookback meant long-gap precise-clock sources could fall back into automated latency samples after outages or infrequent release cycles

Engineering decision:

- introduce `source_fetch_runs` as the poll-history table for the `events` base
- record every source poll, including zero-item successful polls and failed polls
- drive `getLastFetchedAtBySourceIds`, quality snapshots, and ops diagnostics from persisted poll history instead of `raw_items`
- remove query-time fetch-gap lookback inference and persist `fetch_gap_ms` on each successful poll run
- keep a narrow legacy bridge for historical local data: when `source_fetch_runs` is absent, only dense `exchange_disclosure` families may temporarily fall back to `raw_items` batch gaps; sparse precise-clock families must not

Why this is the chosen fix:

- it preserves steady-state latency truth for sparse precise-clock sources such as `pbc-omo` and `chinamoney-*`
- it keeps long-gap backlog classification valid even when the prior successful poll is older than 7 days
- it fixes both the scheduling cadence blind spot and the release-gate sampling distortion at the same architectural layer
- it keeps the current local quality gate usable during migration without reintroducing the original sparse-source bug

Verification added:

- migration coverage for `source_fetch_runs`
- regression coverage for sparse precise-clock sources with empty polls between item-bearing batches
- regression coverage for long-gap precise-clock backlog classification beyond seven days
