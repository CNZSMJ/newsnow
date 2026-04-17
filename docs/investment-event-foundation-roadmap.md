# Investment Event Foundation Roadmap

Status: Active roadmap
Last updated: 2026-04-17
Scope: staged evolution of the `newsnow` events system into a professional, reliable investment-grade structured event base

## 1. Purpose

This roadmap defines how the `events` system should evolve from the current canonical event engine into a professional data foundation for real investment workflows.

This document is intentionally limited to the `events` system itself. It does not define thesis management, subscription delivery, portfolio logic, or execution systems.

## 2. Boundary

The `events` system owns:

- canonical event truth
- structured facts
- evidence linkage
- canonical entity registry and nomenclature
- entity, market, and topic linkage
- event identity, merge, lifecycle, and series relations
- event-native investment interpretation
- stable read/query surfaces
- replay, repair, backfill, metrics, and operational quality

The `events` system does not own:

- thesis state
- variable evaluation
- subscription consumers
- alerting policy
- portfolio positions
- order execution

## 3. End-State Definition

The target state is not "a better news page". It is a professional event base that can safely support discretionary investing and future downstream systems.

At the end of this roadmap, `events` should be able to:

- represent high-value event domains with facts-first structured records
- distinguish lifecycle events from periodic series events without semantic drift
- keep security, issuer, institution, market, and industry identities clean and stable
- preserve evidence and event evolution in an investor-readable way
- support investment scans by entity, market, family, direction, materiality, tradability, authority, and freshness
- survive replays, backfills, and data repairs without losing canonical consistency
- keep storage and query implementation details behind stable contracts so future database upgrades remain possible

## 4. Operating Rules

These rules apply in every phase.

### 4.1 Semantics before distribution

Do not build subscription or downstream delivery mechanics as an active workstream until the event base itself is stable enough to deserve external consumers.

### 4.2 Facts before summaries

High-value events should be represented by structured facts first. Human-readable summaries are a projection, not the primary data contract.

### 4.3 Event meaning remains objective

`events` may compute investment-native event interpretation, but it must not absorb thesis-specific, portfolio-specific, or user-private logic.

### 4.4 Repairability is part of the design

Every semantics-changing phase must leave behind a replay path, a validation path, and a repair path.

### 4.5 Storage must stay swappable

The current database shape may remain in place, but contracts, repository logic, and query semantics must not be tightly coupled to current SQLite JSON behavior.

### 4.6 Bounded LLM use only

LLM use is allowed only as bounded assistance for ambiguous, long-text, or low-structure cases. It must not replace deterministic extraction where authoritative structured sources already exist.

Any LLM-assisted path must:

- be schema-constrained
- carry confidence
- link back to source evidence
- preserve a deterministic fallback path
- degrade explicitly instead of silently fabricating canonical truth

## 5. Phase Overview

| Phase | Name | Core goal | Primary design question | Exit signal |
| --- | --- | --- | --- | --- |
| 1 | Semantic Baseline | Make event meaning correct before deeper expansion | What exactly is this event, and who does it really affect? | Priority source families classify cleanly with low generic fallback |
| 2 | Facts-First Depth | Increase structured coverage for high-value events | Can the event stand on facts instead of titles? | Priority event families expose useful structured facts by default |
| 3 | Identity and Series Model | Separate lifecycle evolution from periodic event sequences | Is this an updated event, or a new release in a series? | Merge logic and series logic stop fighting each other |
| 4 | Merge and Timeline Hardening | Make event evolution readable and low-noise | Which updates matter, and which are churn? | Duplicate noise is low and lifecycle is investor-readable |
| 5 | Query and Scan Foundation | Turn events into a real investment scan surface | Can investors and systems reliably ask for what matters now? | Query semantics are stable across list, detail, and scan modes |
| 6 | Quality Gates and SLOs | Convert quality from intuition into release criteria | How do we know the event base is trustworthy? | SLOs are defined, measured, and enforced pre-release |
| 7 | Repair, Backfill, and Operations | Make the base sustainable under continuous change | Can we evolve safely without corrupting history or runtime? | Replay, repair, and ops workflows are standard and repeatable |

## 6. Phase Design

### Phase 1: Semantic Baseline

Objective:

- make event meaning correct before making it broader or more automated

Design focus:

- keep source semantics declarative in profiles
- establish a canonical entity registry and nomenclature layer shared by normalization, extraction, merge, query, and repair flows
- tighten family and subtype assignment for priority sources
- separate `security`, `issuer`, `institution`, `market`, and `industry` identity roles
- aggressively reduce `general_news`, `other`, and similarly weak fallback buckets for high-value sources

Why this phase comes first:

- if the system names the event incorrectly, all later fact extraction, merging, scanning, and downstream use will be contaminated

Primary modules:

- [`server/services/event-engine/profiles.ts`](../server/services/event-engine/profiles.ts)
- [`server/services/event-engine/resolver.ts`](../server/services/event-engine/resolver.ts)
- [`server/services/event-engine/entity-normalization.ts`](../server/services/event-engine/entity-normalization.ts)
- [`server/services/event-engine/investment-view.ts`](../server/services/event-engine/investment-view.ts)

Execution goals:

- audit the highest-value source families first
- turn alias, synonym, code, and cross-market mappings into a shared canonical reference rather than scattered cleanup rules
- keep entity-role cleanup in the backend, not in frontend projections
- add targeted replay cases for every major semantic cleanup
- add repair scripts when a semantics fix changes persisted identity data

Exit criteria:

- priority source families rarely fall back to generic families
- canonical naming and identity rules are shared across extraction, merge, query, and repair paths
- entity displays are correct for representative disclosure, policy, and industry samples
- new semantic fixes can be replayed and repaired without manual one-off cleanup

### Phase 2: Facts-First Depth

Objective:

- make important events structurally useful, not just textually recognizable

Design focus:

- expand extractor depth for disclosure, policy, macro, and industry domains
- prefer numeric, relationship, and status facts over prose summaries
- make extracted facts link reliably back to affected entities and evidence
- keep event-native interpretation driven by extracted facts

Why this phase is next:

- once semantic identity is stable, the next bottleneck is shallow event payloads that still depend too much on titles and summaries

Primary modules:

- [`server/services/event-engine/extractors`](../server/services/event-engine/extractors)
- [`server/services/event-engine/impact.ts`](../server/services/event-engine/impact.ts)
- [`server/services/event-engine/resolver.ts`](../server/services/event-engine/resolver.ts)

Execution goals:

- prioritize high-value disclosure classes such as shareholding changes, management changes, contracts, and regulation
- deepen industry and policy facts only where they materially improve decision usefulness
- make extractors consume the shared canonical entity registry instead of re-inventing source-local naming logic
- reject placeholder fact payloads that add storage but no investor value

Exit criteria:

- high-value event families expose meaningful structured facts by default
- extracted facts link back to canonical entities consistently across source families
- investor interpretation fields depend more on facts than on title heuristics
- event detail views stop showing large amounts of low-value fact noise

### Phase 3: Identity and Series Model

Objective:

- define the durable model boundary between evolving events and recurring event sequences

Design focus:

- keep `lifecycle events` as one event with meaningful state evolution
- model `series events` as separate events linked by shared series identity
- introduce stable relation fields such as `series_id`, `recurrence_key`, or `period_key` where needed
- keep periodic releases queryable as history, not collapsed into one endlessly updated event

Why this phase matters for investing:

- periodic data and recurring disclosures are new decision points, not mere updates
- process-driven situations such as investigations, buybacks, mergers, and policy formalization should remain one evolving event

Primary modules:

- [`server/services/event-engine/merger.ts`](../server/services/event-engine/merger.ts)
- [`server/database/events.ts`](../server/database/events.ts)
- [`server/services/event-engine/text.ts`](../server/services/event-engine/text.ts)

Execution goals:

- codify the distinction instead of leaving it to ad hoc merge heuristics
- start with the highest-value recurring domains such as financial reports, periodic industry data, and benchmark rate releases
- keep query contracts stable while evolving internal storage and relation modeling

Exit criteria:

- recurring releases stop being incorrectly merged into old events
- evolving process events stop fragmenting into low-value duplicates
- historical comparison across periods becomes straightforward

### Phase 4: Merge and Timeline Hardening

Objective:

- make event evolution low-noise, trustworthy, and readable in trading contexts

Design focus:

- improve duplicate consolidation across sources
- handle corrections, retractions, supplements, and late authoritative confirmations explicitly
- compress low-value lifecycle churn
- keep timeline states and notes understandable to investors and future systems

Why this phase cannot be skipped:

- even with correct identity and facts, a noisy event history destroys scanability and weakens trust in the event base

Primary modules:

- [`server/services/event-engine/merger.ts`](../server/services/event-engine/merger.ts)
- [`server/database/events.ts`](../server/database/events.ts)
- [`server/services/event-engine/scheduler.ts`](../server/services/event-engine/scheduler.ts)

Execution goals:

- improve same-event merge quality for multi-source reporting
- preserve only meaningful lifecycle transitions
- make duplicate handling and canonical consolidation fully auditable

Exit criteria:

- duplicate noise is visibly reduced in representative samples
- timeline summaries are short, meaningful, and evidence-backed
- corrections and retractions do not leave canonical state ambiguous

### Phase 5: Query and Scan Foundation

Objective:

- make `events` usable as a professional scan surface instead of only a storage backend

Design focus:

- stabilize query semantics for list, detail, and scan routes
- support investor-grade filtering by entity, market, family, direction, authority, materiality, tradability, freshness, and change recency
- distinguish cleanly between latest-first, investment-priority, and recently-changed retrieval modes
- preserve storage abstraction so query implementation can evolve later

Why this phase follows model hardening:

- a scan surface is only as good as the underlying event model; adding richer filters earlier would amplify upstream noise

Primary modules:

- [`server/services/event-engine/query.ts`](../server/services/event-engine/query.ts)
- [`server/api/investment-events`](../server/api/investment-events)
- [`server/services/event-engine/ranking.ts`](../server/services/event-engine/ranking.ts)

Execution goals:

- keep provider-facing contracts stable and explicit
- make scan semantics backend-owned rather than recreated client-side
- ensure list and detail projections agree on the same canonical state

Exit criteria:

- event scans answer practical investor questions without custom post-processing
- list and detail surfaces stay consistent under the same underlying event state
- query contracts do not leak current storage implementation details

### Phase 6: Quality Gates and SLOs

Objective:

- turn event quality into measured release discipline

Design focus:

- define and publish SLOs for the event base
- measure quality continuously with replay, shadow, repair, and metrics
- require semantics-changing work to clear objective gates before rollout

Initial SLO set:

- high-value source structured coverage >= 85%
- high-value source generic fallback share <= 5%
- sampled entity mislink rate for `security / issuer / institution` <= 2%
- sampled false merge rate <= 1%
- sampled missed merge rate <= 3%
- replay pass rate = 100%
- deterministic replay consistency = 100%
- priority-source ingest-to-canonical latency P95 <= 5 minutes

Primary modules:

- [`server/services/event-engine/metrics`](../server/services/event-engine/metrics)
- replay and shadow tests in [`server/services/event-engine`](../server/services/event-engine)
- repair utilities in [`scripts`](../scripts)

Execution goals:

- keep SLOs visible in planning, not only in postmortems
- expand metrics where quality risks remain opaque
- treat SLO regression as a first-class release blocker

Exit criteria:

- SLOs are explicitly tracked and reviewed
- releases that change semantics are gated by replay and metrics
- event quality discussions rely on measured data instead of anecdotal browsing

### Phase 7: Repair, Backfill, and Operations

Objective:

- make the event base sustainable under continuous schema, semantics, and source evolution

Design focus:

- standardize replay, repair, backfill, and rollback workflows
- keep version records for semantics-changing logic
- expose runtime freshness and worker health clearly
- maintain storage and repository boundaries so future scaling work remains possible

Why this is the closing phase for the foundation:

- a professional base is not only accurate when freshly built; it must remain accurate while history accumulates and source behavior changes

Primary modules:

- [`server/database/events.ts`](../server/database/events.ts)
- [`server/services/event-engine/scheduler.ts`](../server/services/event-engine/scheduler.ts)
- repair scripts under [`scripts`](../scripts)
- execution tracking in [`docs/investment-event-delivery-board.md`](./investment-event-delivery-board.md)

Execution goals:

- make repairs idempotent and reversible where possible
- keep backfill bounded and version-aware
- document standard operating procedures for stale data, bad merges, entity cleanup, and delayed source ingestion

Exit criteria:

- historical repairs can be run safely and repeatedly
- backfill and replay paths are part of routine change management
- the event system is operationally trustworthy even before any external subscriber exists

## 7. Continuous Execution Cadence

This roadmap is intended to be continuously executable, not a one-off planning artifact.

Recommended cadence:

- one active phase theme at a time
- two-week execution blocks by default
- every block ends with:
  - code and tests
  - replay or shadow validation where semantics changed
  - repair notes if persisted data is affected
  - delivery board update
  - documented residual risks

Recommended work ordering inside each block:

1. define the semantic or data-model delta
2. add or update fixtures
3. implement backend changes
4. run replay, validation, and data repair if needed
5. update projection and query surfaces only after canonical truth is stable
6. record metrics, risks, and next tranche entry point

## 8. Execution Log

### 2026-04-17 — Phase 1 completed, Phase 2 opened

Completed in Phase 1:

- established a shared canonical entity registry and nomenclature layer across extraction, normalization, query, and repair paths
- normalized security alias handling in event extraction and persistence repair flows instead of relying on display-layer cleanup
- reduced high-value source semantic fallback by hardening `xueqiu`, `szse`, generic exchange disclosure, and industry report classification behavior
- narrowed `shareholding_change` detection so generic shareholder-meeting notices stay on disclosure semantics instead of being mislabeled as ownership changes
- added explicit degradation for known `primaryEntityName` cases so issuer/company linkage remains usable even when local TDX lookup is unavailable

Validation completed:

- `pnpm exec vitest run server/database/events.test.ts server/services/event-engine/profiles.test.ts server/services/event-engine/resolver.test.ts server/services/event-engine/investment-view.test.ts server/services/event-engine/replay.test.ts`
- `pnpm typecheck`
- `pnpm build`

Residual risks carried into Phase 2:

- structured facts are still shallow in several disclosure families even when family/subtype semantics are now correct
- fact-to-entity linkage still depends on source-specific extractor depth in more domains than desired
- phase 1 covered priority semantic gaps, not every long-tail source family

Phase 2 entry point:

- deepen facts-first extraction for disclosure classes and ensure fact payloads, not titles, drive more of the investor interpretation surface

### 2026-04-17 — Phase 2 completed, Phase 3 opened

Completed in Phase 2:

- upgraded `exchange_announcement` from a shallow announcement label into a normalized structured fact payload with disclosure metadata
- added bounded title-level structure for `financing`, `buyback`, `dividend`, and `shareholding_change` without overreaching beyond current raw metadata limits
- introduced a fact-driven `exchange_announcement` impact lane so disclosure interpretation depends less on subtype defaults and more on structured fields
- tightened investor detail fact summaries so disclosure key facts now reflect structured payload fields instead of generic fixed copy

Validation completed:

- `pnpm exec vitest run server/services/event-engine/extractors/exchange-announcement.test.ts server/services/event-engine/impact.test.ts server/services/event-engine/investment-view.test.ts server/services/event-engine/replay.test.ts`
- `pnpm typecheck`
- `pnpm build`

Residual risks carried into Phase 3:

- `management_change`, `regulation`, and `contract` still rely on lighter title-driven structure than the capital-action disclosure families
- periodic release identity and lifecycle identity are still governed by merge heuristics rather than an explicit durable series model
- high-value disclosure facts are deeper now, but recurring event families still need a clearer lifecycle-vs-series boundary

Phase 3 entry point:

- formalize the durable split between lifecycle events and series events so recurring disclosures and recurring industry releases stop competing with merge logic

### 2026-04-17 — Phase 3 completed, Phase 4 opened

Completed in Phase 3:

- added explicit periodic series metadata derivation for `official_rate_fixing`, `industry_stat_release`, `industry_report_release`, and `industry_policy_notice`
- persisted `series_key`, `period_key`, and `release_cadence` on canonical event rows without changing current duplicate-deduped `eventId` behavior
- proved the intended split in replay: same-period duplicates still collapse into one canonical event, while next-period releases keep different `eventId` values but share one durable `seriesKey`
- kept lifecycle state and series identity separate so future merge/timeline work can target lifecycle noise directly instead of overloading identity hints

Validation completed:

- `pnpm exec vitest run server/database/events.test.ts server/services/event-engine/replay.test.ts server/services/event-engine/impact.test.ts server/services/event-engine/investment-view.test.ts`
- `pnpm typecheck`
- `pnpm build`

Residual risks carried into Phase 4:

- lifecycle timeline entries are still noisier than they should be because merge confirmations and snapshot updates share the same narrow state vocabulary
- periodic series identity is now explicit, but timeline/projection layers still do not summarize recurring-series context for investors
- recurring disclosure families beyond the current first-class periodic set still rely on document identity and merge heuristics

Phase 4 entry point:

- reduce lifecycle churn, make merge provenance more explicit, and keep investor-facing timelines readable when authoritative confirmations, duplicate merges, and snapshot refreshes all occur on one canonical event

### 2026-04-17 — Phase 4 completed, Phase 5 opened

Completed in Phase 4:

- split duplicate merge provenance from lifecycle truth so canonical merges no longer overwrite a previously confirmed lifecycle state
- stopped copying duplicate-event lifecycle rows into canonical timelines, keeping canonical event history compact while preserving one explicit merge provenance row
- reduced investor-facing timeline noise by compressing maintenance-only snapshot refreshes into short maintenance updates instead of presenting them like substantive event changes
- kept substantive snapshot refreshes, authoritative confirmations, and duplicate merges separately readable in detail projections

Validation completed:

- `pnpm exec vitest run server/database/events.test.ts server/services/event-engine/investment-view.test.ts server/services/event-engine/replay.test.ts server/services/event-engine/impact.test.ts`
- `pnpm typecheck`
- `pnpm build`

Residual risks carried into Phase 5:

- scan/query surfaces still do not expose the newly durable series context as first-class filtering or grouping primitives
- read semantics for `latest`, `changed recently`, and `series history` are still implicit rather than contractually separated
- investor scans can now rely on cleaner lifecycle truth, but they still lack explicit sequence-aware retrieval for recurring releases

Phase 5 entry point:

- turn the event base into a clearer scan surface by making list/detail/query semantics explicit for latest events, recently changed events, and recurring-series history

### 2026-04-17 — Phase 5 completed, Phase 6 opened

Completed in Phase 5:

- exposed durable recurring-series metadata (`seriesKey`, `periodKey`, `releaseCadence`) on the canonical investment brief so scans and detail projections can carry sequence identity without re-deriving it downstream
- made scan semantics explicit across the query layer and provider routes with three stable retrieval modes: `investment`, `latest`, and `changed`, plus first-class `changed_since/lifecycle_after` and `series_key/period_key` filters
- aligned MCP scan tools to the same provider-facing semantics and added an investor-friendly series summary in agent projections instead of leaking raw series internals into default text output
- added database coverage proving changed-first ordering, lifecycle recency filtering, and recurring-series filtering work against canonical event storage instead of ad hoc client post-processing

Validation completed:

- `pnpm exec vitest run server/database/events.test.ts server/mcp/projection.test.ts server/mcp/investment-tools.test.ts server/services/event-engine/investment-view.test.ts`
- `pnpm typecheck`
- `pnpm build`

Residual risks carried into Phase 6:

- target SLOs are written down, but they are not yet enforced as release gates or surfaced as operator-visible quality signals
- entity precision, false-merge, missed-merge, and generic-fallback rates still rely on spot checks rather than automated threshold reporting
- replay consistency and ingest latency are measurable, but the event base still lacks one explicit quality-gate path that blocks semantics-changing rollout on regression

Phase 6 entry point:

- turn quality expectations into explicit metrics, gates, and release discipline so semantic upgrades stop depending on manual confidence alone

### 2026-04-17 — Phase 6 completed, Phase 7 opened

Completed in Phase 6:

- added a bounded event-base SLO definition layer for automated runtime gates around structured coverage, generic fallback share, and ingest latency P95, while also declaring the manual sample and replay-review gates that still require human workflow
- exposed the quality snapshot, SLO evaluation, and release-gate outcome in `/api/ops/events/status`, so operators can inspect raw metrics, blocking gates, and release readiness from one surface
- added executable gate commands (`pnpm events:check-quality` / `pnpm events:check-slos`) that print the current snapshot and exit non-zero when automated blocking SLOs regress
- tightened the quality snapshot to a recent publication window for high-value sources, so latency and fallback gates reflect live operational quality rather than historical backfill noise
- kept the gate contract auditable by separating automated runtime blockers from non-automated manual-review requirements in one shared evaluator

Validation completed:

- `pnpm exec vitest run server/services/event-engine/slo.test.ts server/database/events.test.ts server/mcp/projection.test.ts server/mcp/investment-tools.test.ts server/services/event-engine/investment-view.test.ts`
- `pnpm typecheck`
- `pnpm build`
- `pnpm events:check-quality`

Current local gate result:

- the command now executes successfully and fails only for real data reasons rather than script/runtime errors
- `highValueStructuredCoveragePct = 100` (`pass`)
- `highValueGenericFallbackSharePct = 0` (`pass`)
- `prioritySourceIngestLatencyP95Ms = 2318929` ms, about 38.6 minutes (`fail`, release-blocking)

Residual risks carried into Phase 7:

- the first automated gate set is intentionally narrow and does not yet cover entity precision, merge precision, replay consistency, or shadow drift
- the repo now knows it is blocked by priority-source latency, but it still lacks a standard operational playbook for diagnosing slow source families, replay side effects, and backlog flushes
- manual-review gates for sampled entity and merge quality are declared, but the process for recording and repeating those reviews is still missing

Phase 7 entry point:

- turn the new gate outputs into routine operational workflows for latency triage, replay/backfill control, repair execution, and manual quality review

### 2026-04-17 — Phase 7 completed, foundation roadmap closed

Completed in Phase 7:

- exposed operational latency diagnostics from the canonical event store, including high-value source-kind and source-id breakdowns over the live ingest window
- wired those diagnostics into `/api/ops/events/status`, so operators can inspect worker health, quality gates, and slow source families from one operational surface
- added a repo-runnable triage command, `pnpm events:ops-report`, that prints the current slow source-family breakdown without requiring ad hoc database inspection
- added database coverage proving the triage layer can identify stale high-value source kinds and individual slow sources from canonical event persistence

Validation completed:

- `pnpm exec vitest run server/database/events.test.ts server/services/event-engine/slo.test.ts server/services/event-engine/quality-gates.test.ts`
- `pnpm typecheck`
- `pnpm build`
- `pnpm events:ops-report -- --hours 24 --limit 5`

Current local operational readout after Phase 7:

- the event base now exposes a standard latency-triage surface instead of only one failing aggregate gate
- the latest local `events:ops-report` run shows `official_policy_notice`, `official_macro_release`, `official_central_bank_operation`, and `official_rate_fixing` as the slowest high-value source kinds in the recent 24-hour window
- the same run shows `cninfo-hk-gem` and several `official_policy_notice` sources as concrete slow-source candidates for the next remediation tranche

Residual post-foundation risks:

- priority-source ingest latency P95 is still above target on real local data, so the quality gate remains operationally visible even though it is now diagnosable
- manual review gates for entity precision, false merges, missed merges, and replay consistency still require explicit operator workflow outside runtime automation
- the event base is now operationally inspectable, but the next tranche still needs actual source-by-source latency reduction and repeatable repair/runbook discipline

Post-foundation entry point:

- use the new diagnostics to burn down priority-source latency blockers, formalize repair/backfill runbooks, and continue semantic precision hardening without reopening the foundation model
- execute the next tranche under stratified latency thresholds instead of one flat aggregate target
- keep semantic hardening focused on high-value source families first, while preventing long-tail fallback from polluting canonical entity truth
- keep operational workflow in-repo under [`docs/event-operations-runbook.md`](./event-operations-runbook.md)

### Post-foundation execution rules

#### 1. Stratified latency thresholds

The next tranche should not use one flat latency target for every source family.

Use:

- Tier A `Trade-critical`: exchange disclosures, intraday market flashes, central-bank operations, rate fixings; target `initial canonical event P95 <= 5 minutes`
- Tier B `High-value non-intraday`: key macro releases and important policy notices; target `initial canonical event P95 <= 10-15 minutes`
- Tier C `Long-form / heavy parsing`: long policy documents and complex deep-parsing sources; target `initial canonical event P95 <= 30 minutes`

Latency should be measured in two stages:

- `initial canonical latency`
- `full semantic enrichment latency`

The event base should optimize time-to-first-truth before time-to-full-depth.

#### 2. High-value semantic hardening first

The next tranche should prioritize high-value source families for semantic precision work.

Long-tail sources may remain conservative, but they must not:

- write incorrect canonical subjects
- write incorrect entity links
- write incorrect market links
- poison the canonical entity registry through aggressive fallback

#### 3. Runbook-driven operations

Post-foundation operation should be runbook-driven, not ad hoc.

The default workflow for latency triage, repair, backfill, and manual review lives in:

- [docs/event-operations-runbook.md](./event-operations-runbook.md)

## 9. Deferred Work

The following work is explicitly deferred until the event base is stable enough:

- event subscription delivery
- thesis-system integration
- external consumer webhooks or feeds
- user-level alert policy
- complex document expansion for PDF, tables, OCR, and multimodal layout parsing

Any future document-expansion work must still land back into the same canonical event, fact, and evidence contracts. It should extend extraction depth, not create a second event model.

Those future systems should consume the event base after it is trustworthy. They should not shape the current foundation roadmap.
