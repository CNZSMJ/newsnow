# Investment Event Provider Handoff

Status: Active  
Last updated: 2026-04-12  
Scope: operational handoff notes for `nexus-fi-mcp` to consume `newsnow` investment event outputs

## 1. Purpose

This document is the practical provider handoff note for the `newsnow -> nexus-fi-mcp` boundary.

It does not restate the full architecture. It defines:

- what `newsnow` already guarantees
- which HTTP and MCP outputs are stable enough to consume
- which fields are canonical investment semantics
- which fields are default-safe vs debug-only

## 2. Boundary rule

`newsnow` is the provider.

It is responsible for:

- canonical events
- facts
- evidence
- impact and investment interpretation
- canonical investment projection

`nexus-fi-mcp` is the public agent boundary.

It should:

- consume the canonical investment projection from `newsnow`
- normalize naming to its own public tool contract
- avoid rebuilding event meaning from raw text

It should not:

- parse raw `event-bus` internals
- derive event family from source ids or titles
- reconstruct `whyItMatters`, `whatToWatchNext`, or `riskOfMisread`

## 3. Stable provider surfaces

### 3.1 HTTP

The stable provider-facing HTTP layer now uses explicit provider routes and carries contract metadata:

- `/api/investment-events/latest`
- `/api/investment-events/search`
- `/api/investment-events/entity`
- `/api/investment-events/:id`
- `/api/investment-watchlists/:id`
- `/api/investment-watchlists/:id/events`

Route boundary note:

- downstream provider consumers should use the explicit `/api/investment-*` routes only
- event-engine operational endpoints now live under `/api/ops/events/*` for refresh, shadow, backfill, and status

### 3.2 Local MCP

The local MCP server in `newsnow` is a provider-facing adapter, not the final public tool boundary.

Relevant tools:

- `event_get_latest_events`
- `event_search_events`
- `event_get_entity_events`
- `event_get_event`
- `watchlist_get_events`
- `watchlist_get_detail`

These tools now consume the same canonical investment projection used by the frontend.
They also now consume explicit provider-contract routes rather than relying on implicit projection query parameters.

## 4. Canonical investment semantics

The following fields should be treated as canonical and reusable by `nexus-fi-mcp`:

- `eventFamily`
- `actionBucket`
- `signalDirection`
- `signalConfidence`
- `materialityScore`
- `tradabilityScore`
- `authorityScore`
- `affectedMarkets`
- `affectedEntities`
- `whyItMatters`
- `tradableNow`
- `whatToWatchNext`
- `riskOfMisread`
- `keyFacts`
- `evidence`

These values come from the backend event engine and should not be recomputed downstream unless explicitly versioned and agreed.

## 5. Default-safe vs debug-only

### 5.1 Default-safe

Default provider payloads should include:

- investment interpretation
- structured facts
- evidence trail
- high-level lifecycle view
- related events

This is sufficient for:

- morning reports
- watchlist scans
- single-event analysis
- topic/entity tracking

### 5.2 Debug-only

The following should remain debug-only and should not be required by downstream workflows:

- internal fact type ids when a user-facing label already exists
- evidence ids
- extraction status
- source kind internals
- timeline ids
- resolver or merger internals

In local MCP these fields are available only when `debug=true` is set on detail-style tools.

## 6. Consumption guidance for `nexus-fi-mcp`

`nexus-fi-mcp` should map the provider contract into public `event.*` tools with the following rules:

1. Keep the backend interpretation as the primary source of investment meaning.
2. Preserve facts and evidence in structured form.
3. Do not expose `newsnow` private implementation terms unless a debug path explicitly requests them.
4. Prefer agent-facing labels over engine-facing labels.
5. Treat `actionBucket` as a first-class downstream prioritization signal.

## 7. Minimum mapping recommendation

The public tool layer should preserve these concepts:

- `what happened`
- `why it matters`
- `who is affected`
- `tradable now`
- `what to watch next`
- `risk of misread`
- `facts`
- `evidence`

If `nexus-fi-mcp` collapses or renames fields, it should do so without losing those concepts.

## 8. Current readiness

Ready now:

- provider-side investment projection
- explicit provider-side HTTP contract routes
- provider-side contract metadata (`investment-provider-v1`)
- provider-side related event sections
- provider-side action bucket
- provider-side investment interpretation and evidence
- local MCP debug gating for detail-style outputs

Still downstream work:

- final public `event.*` contract normalization in `nexus-fi-mcp`
- cross-provider composition rules when multiple event providers exist
- public MCP tests in the `nexus-fi-mcp` repository itself
