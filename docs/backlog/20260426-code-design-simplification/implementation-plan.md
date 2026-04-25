# Implementation Plan

状态：Draft；technical-design.md 尚未审批通过；禁止进入实现
最后更新：2026-04-26
范围：代码设计简化 backlog 的候选 Sprint / TDD 实施计划

## 1. 一致性检查

- 与 `technical-design.md` 的一致性检查：未执行。
- 原因：`technical-design.md` 仍为 Draft，尚未审批通过。
- 进入实现前必须先完成技术方案审查，并将本节更新为“一致性检查已完成”。

## 2. Sprint Plan

### Sprint 0：审批前准备

目标：

- 审查 `technical-design.md`。
- 确认简化范围和非目标。
- 明确 R5 benchmark cleanup 是否纳入本 backlog DoD。

TDD / 验证：

- Red：如果技术方案未审批，不进入实现。
- Green：技术方案审批通过后，更新 `technical-design.md` 和本计划一致性检查。
- Validation：`pnpm docs:check` 通过。

状态：未开始。

### Sprint 1：Provider route query adapter

目标：

- 收敛 latest / search / entity 三个 provider list route 的重复 query parsing。

TDD / 验证：

- Red：补 route query parsing characterization test 或等价 focused test。
- Green：抽出共享 adapter helper，并保持 route response 不变。
- Refactor：删除重复 parsing helper。
- Validation：focused tests、`pnpm typecheck`。

状态：未开始。

### Sprint 2：News Query Service branch simplification

目标：

- 拆出 snapshot / legacy cache response helper。
- 保持 stale response + background refresh 行为。

TDD / 验证：

- Red：补 stale snapshot、legacy fresh、legacy stale、force refresh、fetch failure fallback 的 characterization。
- Green：抽 helper 并保持测试不变。
- Refactor：消除 single / batch 中重复 response 组装。
- Validation：`pnpm test -- server/services/news-query/service.test.ts`、`pnpm typecheck`。

状态：未开始。

### Sprint 3：Event Projection persistence decomposition

目标：

- 拆分 projection row serialization 和 index entry construction。

TDD / 验证：

- Red：补 upsert params / index entry behavior characterization。
- Green：抽 helper，保持 projection 和 query indexes 输出一致。
- Refactor：降低 `upsertProjection` 和 `insertIndexEntries` 方法长度。
- Validation：`pnpm test -- server/database/event-projections.test.ts`、`pnpm typecheck`。

状态：未开始。

### Sprint 4：Related events method split

目标：

- 拆出 related event lookup planning 和 section assembly。

TDD / 验证：

- Red：补 section order、dedupe、limitPerSection characterization。
- Green：拆分 helper，保持输出一致。
- Refactor：让 `getRelatedEvents` 只表达主流程。
- Validation：`pnpm test -- server/services/investment-query/service.test.ts`、`pnpm typecheck`。

状态：未开始。

### Sprint 5：Final gate

目标：

- 跑完整验证。
- 更新 delivery status。
- 决定是否纳入 benchmark script cleanup。

TDD / 验证：

- Red：如果任一 focused test 或 full gate 失败，不进入 Completed。
- Green：修正 refactor 造成的问题，不改行为期望。
- Refactor：清理未使用 helper、临时代码和重复 imports。
- Validation：`pnpm docs:check`、`pnpm test`、`pnpm typecheck`。

状态：未开始。

## 3. Final Definition of Done

- 所有实现项均保持行为不变。
- 重复 query parsing 已收敛。
- News Query Service 的读取分支更易审计。
- Event Projection persistence 更容易维护 schema / params 对齐。
- Related events 查询和 section assembly 职责清晰。
- 完整验证通过。

状态：未开始。
