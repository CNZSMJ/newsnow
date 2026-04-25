# Implementation Plan

状态：Completed；technical-design.md 审批通过；一致性检查已完成；R1-R4 已实现并验证
最后更新：2026-04-26
范围：代码设计简化 backlog 的 Sprint-by-Sprint / TDD 实施计划

## 1. 一致性检查

- 与 `technical-design.md` 的一致性检查：已完成。
- `technical-design.md` 状态已明确包含“审批通过”。
- `technical-design-review.md` 审查结论为无开放问题。
- 本计划覆盖 `technical-design.md` §4-§7 的 R1-R4 首轮 DoD。
- 本计划不把 R5 benchmark cleanup 纳入当前 DoD，符合 `technical-design.md` §8 和 `product-spec.md` §2。
- R1 测试形态已落定为独立 adapter characterization test。
- R3 SQL 边界已落定为只抽 same-module pure helper，不移动 SQL 字符串。
- 一致性结论：本实施计划与已审批技术方案一致，可以进入 `Ready for Implementation`。

## 2. 执行协议

每个 Sprint 必须按下面顺序执行：

1. 更新 `delivery-status.md`，标记当前 Sprint 为进行中。
2. Red：先补 characterization / focused regression test，并确认测试能证明当前行为。
3. Green：做最小代码改动，让新增测试和现有测试通过。
4. Refactor：只清理当前 Sprint 范围内的重复、命名和 helper 边界。
5. Validation：运行该 Sprint 指定测试、`pnpm typecheck`、`git diff --check`。
6. 记录验证结果和 commit / push 状态到 `delivery-status.md`。

硬约束：

- 不改变外部 API contract、provider-facing contract、agent-facing contract、数据库语义或投资语义。
- 不把 backend-owned investment semantics 移入 route、frontend、MCP 或 prompt。
- 不引入临时兼容层、临时脚本或未说明 fallback。
- 不跨 Sprint 做 drive-by refactor。
- 任一 Sprint 失败时，只回退或修正当前 Sprint 范围。

## 3. Sprint 1：Provider Route Query Adapter

目标：

- 收敛 latest / search / entity 三个 provider list route 的重复 query parsing。
- 保持 provider-facing request / response contract 不变。

### Task 1.1：Red - adapter characterization test

描述：新增独立 adapter test，锁定现有 query parsing 和 provider response shaping 行为。

验收标准：

- 覆盖 `parseTimestampQuery` 的 numeric timestamp、date string、empty string、invalid string、array first value。
- 覆盖 `sort=changed/latest/investment`、`latest=true` fallback、未知 sort 默认 investment。
- 覆盖 `limit` 默认值、NaN fallback、下限 1、上限 400。
- 覆盖 `changed_since` 与 `lifecycle_after` 优先级。
- 覆盖 latest / search / entity 共享 response shape：`status`、`updatedTime`、`contract`、`items`、`totalCount`、`displayedCount`、`hasMore`。

验证：

- `pnpm test -- test/investment-events-query-adapter.test.ts`

预计文件：

- `test/investment-events-query-adapter.test.ts`

### Task 1.2：Green - extract adapter module

描述：新增 `server/api/investment-events/query-adapter.ts`，让 latest / search / entity routes 复用 query parsing 和 response shaping helper。

验收标准：

- route-specific required 参数仍留在 route：search 的 `q`、entity 的 `entity`。
- adapter 只转换 HTTP query、service input 和 provider response shape。
- adapter 不计算 event family、directional view、materiality、tradability、authority 等 backend-owned semantics。

验证：

- `pnpm test -- test/investment-events-query-adapter.test.ts`
- `pnpm typecheck`

预计文件：

- `server/api/investment-events/query-adapter.ts`
- `server/api/investment-events/latest.ts`
- `server/api/investment-events/search.ts`
- `server/api/investment-events/entity.ts`

### Task 1.3：Refactor / validation

描述：删除三个 route 中重复 helper，确认 imports、types 和 response shape 干净。

验收标准：

- `latest.ts`、`search.ts`、`entity.ts` 不再各自维护重复的 timestamp / sort / lifecycle helper。
- route 文件只保留 HTTP boundary、route-specific validation、service call。

验证：

- `pnpm test -- test/investment-events-query-adapter.test.ts`
- `pnpm typecheck`
- `git diff --check`

状态：已完成。

## 4. Sprint 2：News Query Service Branch Simplification

目标：

- 拆出 snapshot / legacy cache response helper。
- 保持 stale response + background refresh 行为。

### Task 2.1：Red - news fallback characterization

描述：扩展 `NewsQueryService` 测试，先锁定 single-source 与 batch-source 的 snapshot / legacy / refresh intent 行为。

验收标准：

- fresh snapshot 返回 `success`，不提交 refresh intent。
- stale snapshot 返回 `cache`，提交 refresh intent。
- legacy fresh 返回 `success`，持久化 snapshot，不提交 refresh intent。
- legacy stale 返回 `cache`，持久化 snapshot，提交 refresh intent。
- force refresh 走同步 getter。
- fetch failure fallback 顺序保持 snapshot -> legacy cache -> throw。
- batch snapshot / legacy 分支保持与 single-source 等价的 refresh intent 条件。

验证：

- `pnpm test -- server/services/news-query/service.test.ts`

预计文件：

- `server/services/news-query/service.test.ts`

### Task 2.2：Green - extract service private helpers

描述：在 `NewsQueryService` 内抽取 response 和 fallback helper，保持 helper private 或 module-local。

验收标准：

- `getSource` 主流程清晰表达 snapshot -> legacy -> fetch -> failure fallback。
- `getSourcesBatch` 复用 snapshot / legacy response helper。
- 不创建 news / event 共享 abstraction。
- `waitUntil` 异步持久化语义不变。

验证：

- `pnpm test -- server/services/news-query/service.test.ts`
- `pnpm typecheck`

预计文件：

- `server/services/news-query/service.ts`

### Task 2.3：Refactor / validation

描述：清理重复 freshness 判断，确保 `submitRefreshIfStale` 没有丢失边界。

验收标准：

- single-source stale snapshot、single-source stale legacy、batch non-fresh snapshot / legacy 的 refresh intent 条件分别保持。
- fresh snapshot 和 fresh legacy cache 不提交 refresh intent。
- force refresh 和 fetch failure fallback 行为不变。

验证：

- `pnpm test -- server/services/news-query/service.test.ts`
- `pnpm typecheck`
- `git diff --check`

状态：已完成。

## 5. Sprint 3：Event Projection Persistence Decomposition

目标：

- 拆分 projection row serialization、upsert params 和 index entry construction。
- 保持 SQL owner、事务顺序和 schema owner 不变。

### Task 3.1：Red - projection persistence characterization

描述：扩展 projection tests，锁定 projection row、query indexes、related index 清理边界和 deferred publish latest ordering。

验收标准：

- projection record 字段值与 input 对齐。
- latest / detail / search / entity / topic / source / market / watchlist indexes 写入集合可验证。
- related index 出边写入与入边保留边界可验证。
- deferred publish latest ordering guard 可验证。

验证：

- `pnpm test -- server/database/event-projections.test.ts`

预计文件：

- `server/database/event-projections.test.ts`

### Task 3.2：Green - extract projection row helpers

描述：抽取 projection row serialization 和 upsert params helper，不移动 SQL 字符串。

验收标准：

- `upsertProjection` 不再直接维护长参数序列。
- helper 输出字段顺序与 SQL `VALUES` 参数顺序一致。
- SQL 字符串、transaction order、table owner 仍在 `EventProjectionTable`。

验证：

- `pnpm test -- server/database/event-projections.test.ts`
- `pnpm typecheck`

预计文件：

- `server/database/event-projections.ts`

### Task 3.3：Green - extract index entry builders

描述：抽取 event query index entries 和 related index entries 构造 helper。

验收标准：

- latest / detail / search / entity / topic / source / market / watchlist indexes 写入集合不变。
- related index 清理边界保持：删除当前 event 普通索引与 related 出边，保留其他 event 指向当前 event 的 related 入边。
- `insertIndexEntries` 只负责执行 insert loop。

验证：

- `pnpm test -- server/database/event-projections.test.ts`
- `pnpm typecheck`

预计文件：

- `server/database/event-projections.ts`

### Task 3.4：Refactor / validation

描述：清理 helper 命名、types 和重复 JSON serialization，保持 DAO owner 清晰。

验收标准：

- 不移动 SQL 字符串。
- 不改变 `event_projection` 或 `event_query_indexes` schema。
- 不改变 deferred publish latest ordering。

验证：

- `pnpm test -- server/database/event-projections.test.ts`
- `pnpm typecheck`
- `git diff --check`

状态：已完成。

## 6. Sprint 4：Related Events Method Split

目标：

- 拆出 related event lookup planning、并发 query execution 和 section assembly。

### Task 4.1：Red - related events characterization

描述：扩展 investment query tests，锁定 related events section order、dedupe、limit 和 indexed related priority。

验收标准：

- section 顺序保持 `entity -> topic -> market -> family`。
- indexed related 优先进入 entity section。
- `limitPerSection` clamp 保持 1 到 12。
- 去重跨 sections 生效。
- 当前 event 自身始终排除。

验证：

- `pnpm test -- server/services/investment-query/service.test.ts`

预计文件：

- `server/services/investment-query/service.test.ts`

### Task 4.2：Green - split planning and execution

描述：抽取 lookup planning 和 concurrent execution helper，保持 `Promise.all` fanout。

验收标准：

- lookup planning 只负责从 detail / options 派生 query inputs。
- execution helper 保持并发查询，不改成串行。
- query limit 和 sortBy 默认值不变。

验证：

- `pnpm test -- server/services/investment-query/service.test.ts`
- `pnpm typecheck`

预计文件：

- `server/services/investment-query/service.ts`

### Task 4.3：Green - split section assembly

描述：抽取 distinct section assembly 和 display label helper。

验收标准：

- section display label 仍由 backend service 生成，不移到 frontend 或 MCP。
- append / dedupe 逻辑可独立阅读。
- output shape 不变。

验证：

- `pnpm test -- server/services/investment-query/service.test.ts`
- `pnpm typecheck`

预计文件：

- `server/services/investment-query/service.ts`

### Task 4.4：Refactor / validation

描述：清理 `getRelatedEvents` 主流程，让它只表达 planning -> execution -> assembly。

验收标准：

- `getRelatedEvents` 主流程更短且职责清晰。
- section order、dedupe、limit、indexed related priority 均由测试覆盖。

验证：

- `pnpm test -- server/services/investment-query/service.test.ts`
- `pnpm typecheck`
- `git diff --check`

状态：已完成。

## 7. Sprint 5：Final Gate

目标：

- 跑完整验证。
- 更新 delivery status。
- 明确 R5 benchmark cleanup 后续处理。

### Task 5.1：Full validation

验收标准：

- R1-R4 focused tests 全部通过。
- 完整测试通过。
- typecheck 通过。
- docs governance 通过。
- diff whitespace 检查通过。

验证：

- `pnpm docs:check`
- `pnpm test`
- `pnpm typecheck`
- `git diff --check`

### Task 5.2：Completion update

验收标准：

- `delivery-status.md` 记录最终验证结果、commit、push 状态。
- R5 明确记录为 deferred candidate，或另开后续 backlog / sprint 并审批。
- 工作区没有未说明的临时文件、临时代码、临时兼容层。

验证：

- `git status --short --branch`
- `pnpm docs:check`

状态：已完成。

## 8. Recovery Instructions For Any Agent

如果任意 agent 从中途恢复：

1. 读取 `docs/README.md`。
2. 读取本 backlog 的 `delivery-status.md`，确认当前 Sprint。
3. 读取本文件，找到第一个未完成 task。
4. 读取 `technical-design.md` 中对应 R 编号的行为边界。
5. 按 Red -> Green -> Refactor -> Validation 执行。
6. 每完成一个 task 或 Sprint，更新 `delivery-status.md`。

## 9. Final Definition of Done

- R1-R4 全部完成，且每项均保持行为不变。
- 重复 query parsing 已收敛。
- News Query Service 的读取分支更易审计。
- Event Projection persistence 更容易维护 schema / params / index entries 对齐。
- Related events 查询和 section assembly 职责清晰。
- R5 已明确记录为 deferred candidate 或已通过单独审批纳入。
- `pnpm docs:check`、`pnpm test`、`pnpm typecheck`、`git diff --check` 全部通过。
- `delivery-status.md` 更新最终验证、commit、push 状态。

状态：已完成。
