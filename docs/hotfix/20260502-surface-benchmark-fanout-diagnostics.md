# Surface Benchmark Fanout Diagnostics Hotfix

状态：Completed
日期：2026-05-02

## 1. 问题现象描述

`pnpm perf:surface-baseline` 会输出 event detail 的 fanout breakdown，包括 `relatedQueryCount` 和 `relatedScanLimit`。

当前 `scripts/benchmark-surface-performance.ts` 在脚本层通过 `getRelatedEventsQueryShape()` 手动推断 related-events fanout shape。这个推断重复了 `InvestmentQueryService` 内部 related-events lookup planning 的一部分规则。

这会让 benchmark 诊断口径容易随 query model 演进发生漂移。即使在线读取行为正确，性能报告也可能继续输出过期或不准确的 fanout 解释。

## 2. 问题的根因分析

`InvestmentQueryService` 已经拥有 related-events lookup planning 的真实执行规则：

- indexed related lookup
- entity / topic / market lookup
- family fallback lookup
- `limitPerSection` clamp
- per-lookup query limit

但 benchmark 脚本没有复用 query module 暴露的诊断口径，而是在脚本内重新计算 query count 和 scan limit。

这使脚本变成一个浅 Module：它的 Interface 只是运行 benchmark，但 Implementation 需要知道 query module 的内部 fanout 规则，降低了 locality。query module 规则变化时，维护者必须记得同步脚本里的手写估算。

## 3. 修复方案

将 related-events fanout 诊断口径收敛到 query/performance module，保持 benchmark CLI 的输入输出 contract 不变。

1. 在 `InvestmentQueryService` 所在 module 暴露一个只读诊断 helper，用于从 `InvestmentEventDetail` 和 related-events options 生成 fanout shape。
2. 该 helper 复用与 `getRelatedEvents()` 相同的 lookup planning 规则，不执行数据库查询。
3. `scripts/benchmark-surface-performance.ts` 删除脚本层 `getRelatedEventsQueryShape()`，改为调用 query module helper。
4. `server/services/performance/surface-baseline.ts` 的输出 schema 保持不变。
5. 不改变 `InvestmentQueryService.getRelatedEvents()` 的读取行为、section 顺序、dedupe、label 或 query filters。

Out of scope:

- 改变 benchmark CLI 参数。
- 改变 benchmark JSON 字段名。
- 改变 provider HTTP、MCP、frontend 的读取路径。
- 改变 related-events 投资语义、排序、去重或 section 组装。

## 4. 实施计划

与修复方案一致性检查：已完成。

1. Red: 增加 `InvestmentQueryService` fanout diagnostics helper 的单元测试，证明默认 detail 会报告真实 lookup count 和 per-lookup scan limit。
2. Red: 增加缺少 entity/topic/market 时的诊断测试，防止 helper 把不存在的 lookup 计入 fanout。
3. Green: 从现有 related-events lookup plan 派生 fanout diagnostics helper。
4. Green: benchmark 脚本调用该 helper，删除脚本层重复推断。
5. Validation: 运行 focused tests、`pnpm typecheck`、`pnpm docs:check`、`pnpm perf:query-plans`、`pnpm build` 和 `git diff --check`。

## 5. 实施状态

- 2026-05-02：Hotfix created; scope limited to surface benchmark fanout diagnostics.
- 2026-05-02：Implemented `getRelatedEventsFanoutDiagnostics()` in the Investment Query Service module and removed script-local related-events fanout inference from `scripts/benchmark-surface-performance.ts`.
- 2026-05-02：Focused TDD validation passed: `pnpm test -- server/services/investment-query/service.test.ts server/services/performance/surface-baseline.test.ts` (45 files / 310 tests).
- 2026-05-02：Validation passed: `pnpm typecheck`, `pnpm docs:check`, `pnpm perf:query-plans`, `pnpm build`, and `git diff --check`.
- 2026-05-02：Runtime validation passed after `./scripts/service.sh restart`: `pnpm perf:surface-baseline -- --iterations 1` returned `status=success`; four required surfaces covered; event detail fanout kept the existing JSON fields with `relatedQueryCount=5` and `relatedScanLimit=30`.
