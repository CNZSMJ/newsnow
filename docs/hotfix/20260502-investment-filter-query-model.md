# Investment Filter Query Model Hotfix

状态：Completed
日期：2026-05-02
关联 issue：`.scratch/investment-event-filter-query-model/issues/01-filter-semantics-in-query-model.md`

## 1. 问题现象描述

Provider event routes and watchlist event-read routes accept `event_family` and `focus`.

Current behavior applies these filters after `InvestmentQueryService` has already returned a page of projection records. The response can therefore expose:

- `items` filtered by route adapter logic
- `displayedCount` equal to post-filter item count
- `totalCount` and `hasMore` still based on the pre-filter query result

This makes the investor-facing list less trustworthy when a user narrows by event family or focus mode.

## 2. 问题的根因分析

The Investment Event Query Model already owns the relevant backend semantics:

- `event_family` is materialized into `event_projection.event_family`.
- `action_bucket` is materialized into `event_projection.action_bucket`.
- `InvestmentQueryService` already accepts `eventFamily`.
- `EventProjectionTable` already filters by `eventFamily`.

However, route adapters parse `event_family` and `focus` and apply them after query execution. This puts query semantics in the adapter seam, reducing locality and making pagination/counting depend on a post-query slice.

The fix must not move or duplicate investment semantics into routes. Routes may parse HTTP parameters, but the query model must own filtering over materialized backend semantics.

## 3. 修复方案

Use the existing Investment Event Query Model as the seam for these filters.

1. Pass `eventFamily` from provider event routes into `InvestmentQueryService`.
2. Add a query-model option for action bucket filtering.
3. Map `focus=actionable` to `actionBucket = actionable`.
4. Map `focus=watchable` to `actionBucket IN actionable, watch`.
5. Extend `EventProjectionTable` filtering to use `event_projection.action_bucket`.
6. Keep route adapters responsible only for HTTP parsing and response shaping.
7. Remove route-level `matchesInvestmentEventFamily` / `filterInvestmentBriefsByFocus` filtering for list-style provider responses once query-model filtering is in place.

Out of scope:

- Changing how event family or action bucket is computed.
- Changing provider response field names.
- Reworking watchlist matching beyond applying the same query-model filter semantics.

## 4. 实施计划

与修复方案一致性检查：已完成。

1. Red: add regression coverage proving `event_family` is passed into query service instead of only post-filtered in the adapter.
2. Red: add regression coverage proving `focus` filtering affects query results/counts, not only returned items.
3. Green: extend projection query options and `EventProjectionTable` to filter `action_bucket`.
4. Green: pass parsed `eventFamily` and focus-derived action bucket filters through event and watchlist routes into `InvestmentQueryService`.
5. Refactor: keep adapter response shaping minimal and remove duplicated route-level semantic filtering where covered by query model.
6. Validation: run focused tests, `pnpm docs:check`, `pnpm perf:query-plans`, and `git diff --check`.

## 5. 实施状态

- 2026-05-02：Hotfix created; issue tracker entry created.
- 2026-05-02：Implemented query-model filtering for `event_family` and focus-derived `action_bucket`; removed route-level family/focus post-filtering from provider list responses and watchlist event-read responses.
- 2026-05-02：Follow-up review fixed watchlist pre-limit `totalCount` and MCP structured focus labels for focus-filtered reads.
- 2026-05-02：Validation passed: `pnpm test -- server/services/investment-query/service.test.ts server/mcp/server.test.ts test/investment-events-query-adapter.test.ts server/database/event-projections.test.ts` (45 files / 306 tests), `pnpm typecheck`, `pnpm docs:check`, `pnpm perf:query-plans`, and `git diff --check`.
