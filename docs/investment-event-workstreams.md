# Investment Event Workstreams

Status: Active backlog  
Last updated: 2026-04-12  
Scope: long-running execution tracks for the investment event system

## 1. Purpose

This document turns the agreed architecture into an execution backlog.

It exists to preserve one core rule:

> the backend event engine is the single source of truth and the single source of investment semantics  
> frontend investor views and agent interfaces are projections of that same truth

The work is split into three sustained workstreams:

1. backend unified event engine  
2. frontend investor surface  
3. agent-facing interface

For active execution status, current tranche scope, and milestone tracking, see:

- [docs/investment-event-delivery-board.md](/Users/huangjiahao/workspace/newsnow/docs/investment-event-delivery-board.md)

These workstreams may progress in parallel, but they must follow one direction:

- backend semantics first
- frontend investor usability second
- agent contract hardening third

## 2. Cross-workstream constraints

These rules apply to every task below.

### 2.1 Do not fork business logic

Frontend and agent layers must not create their own event classification, direction, materiality, or tradability logic.

### 2.2 Facts and evidence remain first-class

No task is allowed to replace structured facts and evidence with text-only summaries.

### 2.3 Investor usefulness is the acceptance standard

Every change should improve one or more of the following:

- signal versus noise separation
- clarity of what happened
- clarity of who is affected
- clarity of whether the event is actionable or only watch-worthy
- clarity of what must be confirmed next

### 2.4 Engine internals are not default user contracts

Internal labels such as parser families, merge reasons, or lifecycle reason codes may exist for debug use, but they must not become the default human or agent-facing contract.

## 3. Workstream A: Backend unified event engine

Goal:

- maintain a single canonical event engine
- maintain a single canonical investment semantics layer
- produce facts, evidence, impact, and event interpretation once in the backend

### A1. Canonical investment projection

Objective:

- define and maintain one canonical investment projection for all consumers

Tasks:

- add `investment-view.ts`
- define `InvestmentEventBrief`
- define `InvestmentEventDetail`
- define `InvestmentEventFact`
- define `InvestmentEventEvidence`
- define human-readable and machine-readable entity projections

Done when:

- frontend and agent consumers can use the same projected event object
- no consumer needs to reconstruct business meaning from raw engine fields

### A2. Source profile refinement

Objective:

- reduce semantic ambiguity at source registration time

Tasks:

- continue splitting source kinds into investment-meaningful families
- keep separating:
  - industry statistics
  - industry policy
  - industry news
  - industry reports
  - rumor clarification
  - market move
  - policy signal
  - disclosure signal
- remove coarse fallback classification where a narrower semantic family is possible

Done when:

- new high-value sources enter the event engine with clear event semantics
- fewer events fall into generic buckets like `other`

### A3. Extractor strengthening

Objective:

- increase structured fact coverage and quality

Priority source families:

- `pbc-*`
- `chinamoney-*`
- `cninfo-*`
- `sse-*`
- `hkexnews-*`
- high-value industry sources
- high-value media clarification sources

Tasks:

- increase numeric fact extraction coverage
- increase event fact precision
- reduce empty or placeholder fact payloads
- map facts to affected entities and markets more reliably

Done when:

- high-value events are mostly represented by meaningful structured facts
- detail views no longer show large volumes of low-value empty fields

### A4. Impact engine refinement

Objective:

- make investment interpretation more decision-useful

Tasks:

- standardize:
  - `whyItMatters`
  - `tradableNow`
  - `whatToWatchNext`
  - `riskOfMisread`
- reduce generic summaries
- ensure summaries reflect facts, source authority, and event family

Done when:

- impact interpretation answers investor questions directly
- summaries do not leak engine internals

### A5. Entity resolution and linking

Objective:

- improve event-to-entity and event-to-theme relevance

Tasks:

- separate publisher identity from tradable entity identity
- improve security, issuer, market, industry, and institution mapping
- remove noisy placeholder entity output
- improve cross-market entity consistency

Done when:

- entity displays are investment-relevant by default
- watchlists and related-event retrieval become more accurate

### A6. Merger and lifecycle refinement

Objective:

- keep events stable and readable over time

Tasks:

- improve same-event merge logic
- compress low-value repeated lifecycle churn
- preserve meaningful event evolution
- keep timeline useful for investment review rather than engine debugging

Done when:

- timeline entries are understandable and low-noise
- repeated low-value update spam is rare

### A7. Replay, shadow, and observability

Objective:

- keep the engine verifiable under continuous change

Tasks:

- maintain replay fixtures
- expand shadow comparison coverage
- track extractor and merge quality metrics
- track directional coverage and confidence distribution
- track entity resolution success rates

Done when:

- major semantic changes can be replayed and validated before rollout
- quality regressions can be detected without manual browsing

## 4. Workstream B: Frontend investor surface

Goal:

- make the event surface useful for real discretionary investing
- present the same backend event truth in investor language

### B1. Event list as an opportunity scanner

Objective:

- make `/events` useful for quickly identifying what matters now

Tasks:

- keep investment-first sort as the default
- support clear segmentation such as:
  - actionable
  - watch
  - noise
- improve filtering by market, industry, event family, and direction
- surface affected markets and key entities clearly

Done when:

- an investor can scan the page and isolate today's highest-value events quickly

### B2. Event detail as an investment analysis card

Objective:

- organize detail pages around investor decision questions

Tasks:

- make the top of the page answer:
  1. what happened
  2. why it matters
  3. who is affected
  4. can it be traded now
  5. what must be confirmed next
- show only meaningful fact fields by default
- show evidence in a source-credible format
- compress or hide low-value engine lifecycle detail

Done when:

- the detail page reads like an investment brief, not an engine console

### B3. Related event navigation

Objective:

- move from isolated events to investable context

Tasks:

- add related events by entity
- add related events by market
- add related events by industry/theme
- add same-family event navigation where useful

Done when:

- users can move from a single event to a relevant cluster of surrounding signals

### B4. Watchlist investor workflow

Objective:

- make watchlists serve portfolio and monitoring workflows

Tasks:

- present watchlist hits with investment ordering
- separate:
  - new catalyst
  - new risk
  - confirmation pending
- make event relevance more transparent

Done when:

- watchlist pages help decision review rather than acting as a raw alert feed

### B5. Vocabulary hardening

Objective:

- eliminate engineering-first wording from investor-facing pages

Tasks:

- replace internal labels with investor language
- hide or remap engine-only terms
- keep debug views separate from default views

Done when:

- frontend pages no longer depend on engine jargon for meaning

## 5. Workstream C: Agent-facing interface

Goal:

- give agents a stable, auditable, structured investment event contract
- keep agent outputs grounded in backend facts and evidence

### C1. Provider-facing contract in `newsnow`

Objective:

- make `newsnow` a strong event provider for upstream agent systems

Tasks:

- expose the canonical investment projection as a provider contract
- ensure facts and evidence are part of the default contract
- keep debug-only fields behind explicit debug mode

Done when:

- provider consumers can use `newsnow` without parsing engine-specific text blobs

### C2. Internal MCP projection cleanup

Objective:

- make the repository's own MCP projection align with the canonical investment contract

Tasks:

- stop relying on ad hoc summary text formatting
- align tool enums and schemas with the current event model
- expose structured investment fields
- preserve facts and evidence

Done when:

- the local MCP surface is no longer a text-heavy debug wrapper

### C3. Public MCP boundary through `nexus-fi-mcp`

Objective:

- keep the public agent boundary stable and provider-agnostic

Tasks:

- map the `newsnow` provider contract to the public `event.*` tool contract
- avoid leaking provider-specific semantics
- add public metadata and guard semantics

Done when:

- skills and workflows consume a stable `event.*` contract without provider branching

### C4. Agent scenario validation

Objective:

- verify that the contract actually supports high-value machine workflows

Priority scenarios:

- morning report synthesis
- watchlist scanning
- single-event attribution
- theme and industry monitoring

Done when:

- these scenarios can run on structured event objects without prompt-side reconstruction of event meaning

## 6. Execution order

The default execution order is:

1. Workstream A  
2. Workstream B  
3. Workstream C

Reason:

- if backend semantics are unstable, both frontend and agent layers will drift
- frontend is the fastest way to validate whether event semantics are decision-useful
- agent contract hardening should happen after the backend projection is stable

Parallel work is allowed only when it does not create duplicate business logic.

## 7. Immediate backlog

These are the highest-priority next tasks.

1. Add `investment-view.ts` and make it the canonical backend projection layer
2. Make `/api/events/latest` and `/api/events/[id]` capable of returning the investment projection
3. Continue splitting coarse source families:
   - `industry_stat`
   - `industry_policy`
   - `industry_news`
   - `industry_report`
   - `market_move`
   - `rumor_clarification`
4. Tighten fact extraction for industry and media clarification events
5. Rebuild event detail page top sections around the investor five-question model
6. Add clearer list segmentation for actionable versus watch-only events
7. Refactor local MCP event output to use the canonical investment projection
8. Expand replay fixtures for:
   - macro events
   - disclosures
   - industry events
   - media clarification events

## 8. Acceptance checklist

Every completed task should be checked against these questions:

1. Did it keep the backend as the single fact and semantics source?
2. Did it improve investor decision usefulness?
3. Did it make facts and evidence more usable?
4. Did it reduce engine terminology leakage?
5. Did it reduce downstream reconstruction burden for agents?
6. Can the change be replayed, observed, and tested?
