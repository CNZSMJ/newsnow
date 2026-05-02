# Issue 01: Move investment filter semantics into the query model

Status: ready-for-human
Label: ready-for-human

## Problem

`event_family` and `focus` are accepted by provider event and watchlist routes, but they are currently applied after `InvestmentQueryService` returns a page of projection records.

This can make `limit`, `totalCount`, and `hasMore` describe the unfiltered query instead of the investor-visible result set.

## Scope

- Provider event list routes:
  - `/api/investment-events/latest`
  - `/api/investment-events/search`
  - `/api/investment-events/entity`
- Provider watchlist event-read routes:
  - `/api/investment-watchlists/:id`
  - `/api/investment-watchlists/:id/events`
  - compatibility watchlist event-read routes if needed
- Query model modules:
  - `server/services/investment-query/service.ts`
  - `server/database/event-projections.ts`
  - route adapters under `server/api/`

## Acceptance Criteria

- `event_family` is passed to `InvestmentQueryService` and enforced by `event_projection.event_family`.
- `focus=actionable` and `focus=watchable` are mapped to query-model filtering over backend-owned `action_bucket`.
- Route adapters do not recompute event family or action bucket.
- `displayedCount`, `totalCount`, and `hasMore` describe the filtered result set.
- Regression tests cover event list and watchlist event-read filtering.

## Comments

- 2026-05-02: Created from architecture screening. This is a provider/query-model consistency hotfix, not a new investment semantic.
- 2026-05-02: Implemented and validated. Ready for human review in the local tracker.
- 2026-05-02: Follow-up review fixed watchlist pre-limit counts and MCP structured focus labels.
