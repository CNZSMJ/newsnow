# Delivery Status

状态：Completed
最后更新：2026-04-26
范围：代码设计简化 backlog 的进度、blocker、验证记录和下一步

## 1. 当前状态

- 已从 `custom/main` 创建独立分支：`backlog/20260426-code-design-simplification`
- 已建立 backlog 六件套
- 已记录只读 code-simplification 审查结论
- research 结论已由用户核实属实
- 已将核实后的 research 回写到 decisions / product-spec / technical-design / implementation-plan
- 已读取并核实 `technical-design-review.md`，审查结论为无矛盾、无开放问题；唯一 R2 实现注意事项已回写到 technical-design / implementation-plan
- 技术方案审查已通过，`technical-design.md` 已标记为审批通过
- `implementation-plan.md` 已拆分为 Sprint-by-Sprint / Task-by-Task TDD 实施计划，并完成与 `technical-design.md` 的一致性检查
- Sprint 1：Provider Route Query Adapter 已完成
- Sprint 2：News Query Service Branch Simplification 已完成
- Sprint 3：Event Projection Persistence Decomposition 已完成
- Sprint 4：Related Events Method Split 已完成
- Sprint 5：Final Gate 已完成
- Post-completion fix：R1 adapter characterization test 已移出 Nitro API route 扫描树，避免 `.test.ts` 被打包为 `/api/*` route
- R5：benchmark script cleanup 仍按方案作为 deferred candidate，不纳入当前 DoD
- 当前实现改动尚未提交、尚未推送

## 2. 已完成内容

- 读取 `docs/README.md`
- 确认本 backlog 必须使用独立分支
- 确认 Draft / Design Review backlog 不能伪造 `technical-design.md` 审批通过
- 记录并方案化以下首轮简化范围：
  - R1：investment provider route query adapter
  - R2：News Query Service branch simplification
  - R3：Event Projection persistence decomposition
  - R4：Related events method split
- 记录 R5 benchmark script cleanup 为 deferred candidate，不纳入当前 DoD
- 修复 R1 测试文件落点：`test/investment-events-query-adapter.test.ts` 保持独立 adapter characterization 覆盖，但不再位于 `server/api/` route tree
- 闭环 technical design review 的 R2 实现注意事项：
  - single-source stale snapshot、single-source stale legacy、batch non-fresh snapshot / legacy 的 refresh intent 条件必须分别保持。
  - fresh snapshot 和 fresh legacy cache 不得提交 refresh intent。
- 完成实施计划拆分：
  - Sprint 1：Provider Route Query Adapter
  - Sprint 2：News Query Service Branch Simplification
  - Sprint 3：Event Projection Persistence Decomposition
  - Sprint 4：Related Events Method Split
  - Sprint 5：Final Gate

## 3. Blockers

- 当前无 blocker。
- Sprint 1 已完成。
- Sprint 2 已完成。
- Sprint 3 已完成。
- Sprint 4 已完成。
- Sprint 5 已完成。
- Post-completion fix 已完成。

## 4. 下一步

- 如需进入合并流程，先由用户审查当前 diff，再按显式路径 staging、commit、push。
- 若未来要处理 R5，应作为独立 follow-up backlog 或 hotfix，不混入本次已完成 DoD。

## 5. 验证记录

- 2026-04-26：创建 backlog 六件套后，`pnpm docs:check` 通过。
- 2026-04-26：创建 backlog 六件套后，`pnpm typecheck` 通过。
- 2026-04-26：创建 backlog 六件套后，`git diff --check` 通过。
- 2026-04-26：research 已按 code-simplification 方法补充，并经用户核实属实。
- 2026-04-26：本轮 Design Review 文档更新后，`pnpm docs:check` 通过，当前检查 3 个 backlog / 0 个 hotfix。
- 2026-04-26：本轮 Design Review 文档更新后，`git diff --check` 通过。
- 2026-04-26：读取并核实 `technical-design-review.md`；R2 `submitRefreshIfStale` 条件映射注意事项已回写，`pnpm docs:check` 通过，当前检查 3 个 backlog / 0 个 hotfix。
- 2026-04-26：读取并核实 `technical-design-review.md` 后，`git diff --check` 通过。
- 2026-04-26：技术方案审查通过后，已将 `technical-design.md` 标记为审批通过，并将 `implementation-plan.md` 拆分为可执行 TDD 任务；`pnpm docs:check` 通过，当前检查 3 个 backlog / 0 个 hotfix。
- 2026-04-26：实施计划拆分后，`git diff --check` 通过。
- 2026-04-26：开始 Sprint 1 / Task 1.1，进入 adapter characterization Red 阶段。
- 2026-04-26：Sprint 1 完成。新增 `test/investment-events-query-adapter.test.ts` 和 `server/api/investment-events/query-adapter.ts`，latest / search / entity routes 已复用 adapter；`pnpm test -- test/investment-events-query-adapter.test.ts` 通过，42 个测试文件 / 289 个测试通过。
- 2026-04-26：Sprint 1 验证通过：`pnpm typecheck`、`git diff --check`。
- 2026-04-26：Sprint 2 完成。扩展 `server/services/news-query/service.test.ts` 的 refresh intent characterization，并抽取 `NewsQueryService` private helpers；`pnpm test -- server/services/news-query/service.test.ts` 通过，42 个测试文件 / 290 个测试通过。
- 2026-04-26：Sprint 2 验证通过：`pnpm typecheck`、`git diff --check`。
- 2026-04-26：Sprint 3 完成。扩展 `server/database/event-projections.test.ts` 的 index replacement / related inbound preservation characterization，并抽取 projection row / upsert params / index entry pure helpers；`pnpm test -- server/database/event-projections.test.ts` 通过，42 个测试文件 / 291 个测试通过。
- 2026-04-26：Sprint 3 验证通过：`pnpm typecheck`、`git diff --check`。
- 2026-04-26：Sprint 4 完成。扩展 `server/services/investment-query/service.test.ts` 的 related section order / dedupe / limit characterization，并拆分 related events planning / execution / assembly；`pnpm test -- server/services/investment-query/service.test.ts` 通过，42 个测试文件 / 292 个测试通过。
- 2026-04-26：Sprint 4 验证通过：`pnpm typecheck`、`git diff --check`。
- 2026-04-26：Sprint 5 完整验证通过：`pnpm docs:check` 通过，当前检查 3 个 backlog / 0 个 hotfix。
- 2026-04-26：Sprint 5 完整验证通过：`pnpm test` 通过，42 个测试文件 / 292 个测试通过。
- 2026-04-26：Sprint 5 完整验证通过：`pnpm typecheck` 退出码 0。
- 2026-04-26：Sprint 5 完整验证通过：`git diff --check` 通过。
- 2026-04-26：当前分支 `backlog/20260426-code-design-simplification` 仍有未提交实现与文档改动；本轮未执行 commit / push。
- 2026-04-26：Post-completion fix 完成。R1 adapter characterization test 当前位于 `test/investment-events-query-adapter.test.ts`，避免 Nitro 将 `.test.ts` 打包为 API route。
- 2026-04-26：Post-completion fix 验证通过：`pnpm test -- test/investment-events-query-adapter.test.ts` 通过，42 个测试文件 / 292 个测试通过。
- 2026-04-26：Post-completion fix 验证通过：`pnpm typecheck`、`git diff --check`。
- 2026-04-26：Post-completion fix 运行时验证通过：`./scripts/service.sh build-start` 成功，服务经 launchd 运行，`/api/health` healthy；`dist/output/server/chunks/routes/api` 下无 `*.test.*` route，`/api/investment-events/query-adapter.test` 返回 404。
