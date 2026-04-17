# Event Operations Runbook

Status: Active
Last updated: 2026-04-18
Scope: post-foundation operational workflow for latency remediation, repair, backfill, and manual review in the `events` system

Related docs:

- [docs/investment-event-foundation-roadmap.md](./investment-event-foundation-roadmap.md)
- [docs/investment-event-delivery-board.md](./investment-event-delivery-board.md)

## 1. Purpose

This runbook defines the default operator workflow for the post-foundation `events` tranche.

Its job is to make slow-source triage, semantic repair, backfill, and manual review repeatable inside the repo instead of relying on ad hoc shell history or one-off debugging.

## 2. Operating rules

### 2.1 Canonical truth stays in the backend

All triage, repair, and backfill work must preserve the backend event engine as the single source of truth for canonical events, facts, evidence, entity linkage, and investment semantics.

### 2.2 Trade-critical latency comes first

Latency remediation should prioritize source families that directly affect live or near-open investment decisions before low-frequency and long-form sources.

### 2.3 Long-tail sources may be conservative, not wrong

Long-tail sources may stay on generic fallback longer than high-value families, but they must not write incorrect canonical subjects, entity links, or market links into the event base.

### 2.4 Runbook records must move with code

When this workflow changes, update this document in the same repo and under version control. Do not split operational truth into an external handbook.

## 3. Latency tiers

Use stratified thresholds instead of one flat target.

### Tier A: Trade-critical

Examples:

- exchange disclosures
- intraday market flashes
- central-bank operations
- rate fixings

Primary target:

- `initial canonical event P95 <= 5 minutes`

### Tier B: High-value non-intraday

Examples:

- key macro releases
- important policy notices

Primary target:

- `initial canonical event P95 <= 10-15 minutes`

### Tier C: Long-form / heavy parsing

Examples:

- long policy documents
- complex long-form parsing sources

Primary target:

- `initial canonical event P95 <= 30 minutes`

### Dual latency measurement

Track both of the following:

- `initial canonical latency`: time to first trustworthy canonical event
- `full semantic enrichment latency`: time to deeper structured enrichment

Do not allow heavy parsing to hide slow time-to-first-truth behavior.

## 4. Standard triage loop

### Step 1: Inspect current operational state

Use:

- `pnpm events:ops-report -- --hours 24 --limit 20`
- `curl http://127.0.0.1:3000/api/ops/events/status`

Record:

- slowest source kinds
- slowest source ids
- current quality-gate failures
- which latency tier is affected

### Step 2: Classify the issue

Decide whether the problem is mainly:

- source polling cadence
- worker scheduling / backlog
- parsing cost
- persistence bottleneck
- semantic reprocessing / repair side effects

### Step 3: Pick the remediation scope

Prioritize in this order:

1. Tier A source families
2. Tier B source families
3. Tier C source families
4. semantic precision defects in high-value source families
5. long-tail hygiene that risks polluting canonical truth

### Step 4: Validate before rollout

Minimum validation for every remediation batch:

- targeted `vitest` suites
- replay-sensitive tests when event meaning changes
- `pnpm typecheck`
- `pnpm build`
- `pnpm events:ops-report`
- `pnpm events:check-quality`

If quality gates still fail, record whether the remaining failure is expected and why.

## 5. Repair and backfill workflow

### When to run repair

Run repair when one of the following is true:

- canonical entity truth was polluted by a known extraction bug
- event timeline or merge history contains systematic duplicate or malformed records
- a semantic fix should be applied to historical local data, not just future ingest

### When to run backfill

Run backfill when:

- a source family gained materially deeper extraction
- a previously generic family now has a more precise semantic path
- a replay sample proves older events should be reinterpreted

### Required sequence

1. diagnose with `events:ops-report` or direct ops status
2. confirm behavior with fixture or targeted sample
3. implement the semantic or latency fix
4. run targeted tests and replay checks
5. run repair or backfill if historical data is affected
6. rerun quality and ops checks
7. record the remaining risk in the roadmap or delivery board if the tranche is not yet closed

## 6. Manual review workflow

The following still require operator judgment:

- sampled entity precision
- false merges
- missed merges
- replay consistency when semantics materially change

Review rule:

- focus manual review on high-value source families first
- long-tail sources may stay conservative as long as they do not poison canonical truth

## 7. Exit criteria for the post-foundation tranche

This tranche is ready to close when:

- Tier A latency is near or within the hard target for the main trade-critical families
- Tier B and Tier C thresholds are explicit and enforced separately
- high-value source families show continued semantic precision improvement
- long-tail fallback no longer pollutes canonical entity truth
- repair, backfill, and manual review follow this runbook rather than ad hoc operator memory
