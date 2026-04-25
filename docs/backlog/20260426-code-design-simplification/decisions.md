# Code Design Simplification Decisions

状态：Draft
最后更新：2026-04-26
范围：代码设计简化 backlog 的已接受和候选决策

## Product Decisions

### Accepted

- 暂无已接受产品决策。

### Proposed

- PD-1：本 backlog 不改变用户可见行为、agent-facing contract 或投资事件语义。
- PD-2：本 backlog 的成功标准是降低后续维护和审查成本，而不是新增功能。

## Technical Decisions

### Accepted

- 暂无已接受技术决策。

### Proposed

- TD-1：所有简化必须行为不变，并由现有测试或新增 characterization test 证明。
- TD-2：优先简化刚合并性能重构中新增 / 大改的代码，避免无边界 drive-by refactor。
- TD-3：provider HTTP route 的重复 query parsing 应收敛到共享 adapter helper。
- TD-4：News Query Service 的 snapshot / legacy fallback response 组装应抽出命名清晰的私有 helper。
- TD-5：Event Projection persistence 应把 projection row serialization 与 index entry 构造拆出。
- TD-6：Related events 查询应把 lookup planning 与 section assembly 拆开。
- TD-7：benchmark 工具拆分作为低优先级候选，除非前四项完成后仍有明确维护收益。
