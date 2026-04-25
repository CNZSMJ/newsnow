# Code Design Simplification Product Spec

状态：Completed；R1-R4 已实现并验证；R5 保持 deferred candidate
最后更新：2026-04-26
范围：性能重构后代码设计简化的目标、范围、非目标和验收标准

## 1. 目标

降低刚合并性能重构代码的维护复杂度，让后续 agent 和工程师能更快理解、修改、测试和审查相关模块。

本 backlog 的产品目标不是改变用户体验，而是降低未来修改 investor-facing 和 agent-facing surface 时引入行为漂移的概率。

## 2. 首轮范围

纳入当前 Definition of Done：

- R1：投资事件 provider list routes 的 query parsing 和 response shaping 重复。
- R2：News Query Service 的 snapshot / legacy fallback 分支复杂度。
- R3：Event Projection persistence 和 index entry 构造复杂度。
- R4：Investment Query Service related-events 方法职责混合。
- 每个 R1-R4 简化项所需的 characterization test、focused regression test 或现有覆盖说明。

不纳入当前 Definition of Done：

- R5：`scripts/benchmark-surface-performance.ts` cleanup。该项保留为低优先级候选，只能在 R1-R4 完成后重新评估。

## 3. 非目标

不包含：

- 不改变任何外部 API request / response contract。
- 不改变 provider-facing 或 agent-facing contract。
- 不改变数据库 schema、projection 语义或 query index 语义。
- 不改变 backend-owned investment semantics 的计算位置或含义。
- 不改变新闻业务线的 fallback、refresh、stale cache、force refresh 可见行为。
- 不优化性能指标，除非是行为不变简化自然带来的附带结果。
- 不重构 unrelated 代码。
- 不在 `custom/main` 直接实施。

## 4. 用户价值

对 investor-facing 和 agent-facing surface 的间接价值：

- route 参数语义更统一，降低 provider route 之间的漂移风险。
- news fallback 行为更容易审计，降低新闻业务线读取链路误改风险。
- projection 写入逻辑更容易维护 schema / SQL params / index entries 对齐。
- related-events 扩展更安全，降低 detail surface 增加维度时的回归风险。

## 5. 验收标准

功能与 contract：

- 所有现有测试无需改期望即可通过。
- 代码 diff 不包含产品行为、API contract、数据库语义或投资语义变更。
- R1-R4 每个 refactor step 可独立 review 和回滚。

测试与证明：

- R1 覆盖缺参错误、默认参数、limit clamp、sort fallback、timestamp parsing，以及 latest / search / entity 的 contract 等价性。
- R2 覆盖 fresh snapshot、stale snapshot、legacy fresh、legacy stale、force refresh、fetch failure fallback。
- R3 覆盖 projection record、query index entries、related index 删除边界和 deferred publish latest ordering。
- R4 覆盖 section 顺序、跨 section dedupe、`limitPerSection` clamp、indexed related 优先级和排除当前 event。

最终 gate：

- `pnpm docs:check`
- `pnpm test`
- `pnpm typecheck`
- `git diff --check`
