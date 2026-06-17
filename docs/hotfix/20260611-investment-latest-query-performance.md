# Investment Latest Query Performance Hotfix

状态：Completed
日期：2026-06-11

## 1. 问题现象描述

`/events` 默认请求 `GET /api/investment-events/latest?limit=40&sort=investment`。

当前生产数据中 `event_projection` 有约 7.4 万条可用投影，浏览器请求经常超过前端 `15000ms` 超时并被取消，页面表现为事件流刷不出来。

## 2. 问题的根因分析

Investment Event Query Model 已经把在线读取切到 `event_projection` / `event_query_indexes`，但默认 `sort=investment` 的 indexed scan 仍在请求期按 `event_projection` 上的表达式排序：

`materiality_score * 0.4 + tradability_score * 0.35 + authority_score * 0.25`

SQLite 无法用现有索引满足该表达式排序，会对 `latest/all` 的全量候选建立临时排序 B-tree。默认列表还会执行投影表 join 后的总数统计，两者叠加导致接口超过前端超时。

## 3. 修复方案

复用已经物化到 `event_query_indexes` 的排序字段。

1. 为 `event_query_indexes(index_name, index_value, rank_score DESC, sort_time DESC)` 增加索引。
2. `EventProjectionTable.listProjections()` 在 `indexName/indexValue + sort=investment` 时从 `event_query_indexes` 驱动查询，并按 `i.rank_score DESC, i.sort_time DESC` 排序。
3. 无额外过滤条件的 indexed count 直接统计 `event_query_indexes`，避免默认列表再扫描投影表。
4. 保留 `sort=latest` 当前未来发布时间处理逻辑，不在本 hotfix 中改变时间语义。

Out of scope:

- 改变投资评分计算方式。
- 改变 `/api/investment-events/latest` response schema。
- 改变前端 timeout。
- 重做 `sort=latest` 的 deferred publication 语义。

## 4. 实施计划

与修复方案一致性检查：已完成。

1. Red: 增加 `EventProjectionTable` 回归测试，证明 indexed investment scan 使用 query-index rank order。
2. Red: 增加 indexed count 回归测试，证明默认无过滤 count 不再走 projection join。
3. Green: 增加 query index rank-order 索引并改写 indexed investment list/count 查询。
4. Green: 同步 surface query-plan 中 investment hot path 的 SQL。
5. Validation: 运行 focused tests、typecheck、docs governance、query-plan、live API latency、service build-start、browser network verification。

## 5. 实施状态

- 2026-06-11：Hotfix created; baseline observed `limit=10&sort=investment` at 18.60s and `limit=40&sort=investment` at 20.13s on the live service.
- 2026-06-11：Implemented indexed investment ordering through `idx_event_query_indexes_rank_lookup`; default latest count now uses unfiltered query-index count.
- 2026-06-11：Search now reads through the `latest/all` query index for investment ordering; search/entity canonical repair only runs when the projected page is not full.
- 2026-06-11：Validation passed: `pnpm test -- server/services/investment-query/service.test.ts server/database/event-projections.test.ts server/services/performance/sql-plan.test.ts` (50 files / 347 tests), `pnpm typecheck`, `pnpm docs:check`, `git diff --check`, and `./scripts/service.sh build-start`.
- 2026-06-11：Runtime validation passed: `latest?limit=40&sort=investment` measured 116ms then 12ms; `entity=贵州茅台` measured 148ms then 1ms; browser `/events` loaded with `/api/investment-events/latest?limit=40&sort=investment` returning 200 and no console errors.
- 2026-06-11：`pnpm perf:surface-baseline -- --iterations 1` passed coverage; `investment_user_latest` 9.48ms, `investment_user_entity` 5.10ms, `investment_agent_event_scan_hot_path` 9.67ms. `investment_user_search` remained 9.48s because exact full-text `totalCount` is still preserved.
