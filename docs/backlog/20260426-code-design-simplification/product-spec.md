# Code Design Simplification Product Spec

状态：Draft
最后更新：2026-04-26
范围：性能重构后代码设计简化的目标、范围、非目标和验收标准

## 1. 目标

降低刚合并性能重构代码的维护复杂度，让后续 agent 和工程师能更快理解、修改和审查相关模块。

## 2. 范围

包含：

- 投资事件 provider list routes 的 query parsing 和 response shaping 重复。
- News Query Service 的 snapshot / legacy fallback 分支复杂度。
- Event Projection persistence 和 index entry 构造复杂度。
- Investment Query Service related-events 方法职责混合。
- 必要的 characterization test 或 focused regression test。

## 3. 非目标

不包含：

- 不改变任何外部 API contract。
- 不改变数据库 schema 或 projection 语义，除非另开 backlog 并审批。
- 不改变投资事件 backend-owned semantics。
- 不优化性能指标，除非是简化过程自然带来的无行为差异结果。
- 不重构 unrelated legacy 代码。
- 不在 `custom/main` 直接实施。

## 4. 用户价值

虽然本 backlog 不直接改变用户体验，但它降低后续业务迭代和问题修复的风险。

对 investor-facing 和 agent-facing surface 的间接价值：

- route 参数语义更统一。
- fallback 行为更容易审计。
- projection 写入逻辑更不容易因 schema 变更出错。
- related-events 扩展更安全。

## 5. 验收标准

- 所有现有测试无需改期望即可通过。
- 每个简化项都有对应 focused test 或现有测试覆盖说明。
- `pnpm test`、`pnpm typecheck`、`pnpm docs:check` 通过。
- 代码 diff 不包含产品行为、API contract 或数据库语义变更。
- 每个 refactor step 可独立 review 和回滚。
