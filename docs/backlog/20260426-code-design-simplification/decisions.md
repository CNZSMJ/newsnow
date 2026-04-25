# Code Design Simplification Decisions

状态：Ready for Implementation；technical-design 已审批
最后更新：2026-04-26
范围：代码设计简化 backlog 的已接受决策与仍需审查的实现细节

## Product Decisions

### Accepted

- PD-1：本 backlog 不改变用户可见行为、agent-facing contract、provider-facing contract、数据库语义或投资事件语义。
- PD-2：本 backlog 的成功标准是降低后续维护、测试和审查成本，而不是新增功能或重新设计性能重构成果。
- PD-3：首轮 Definition of Done 覆盖 R1-R4：provider route query adapter、News Query Service branch simplification、Event Projection persistence decomposition、Related events method split。
- PD-4：R5 benchmark script cleanup 仅保留为低优先级候选，不纳入当前最终 DoD；除非 R1-R4 完成后证明继续拆分有明确维护收益，否则延期处理。

### Proposed

- 暂无未接受产品决策。

## Technical Decisions

### Accepted

- TD-1：所有简化必须 preserve behavior exactly，并由现有测试或新增 characterization test 证明。
- TD-2：优先简化刚合并性能重构中新增 / 大改的代码，避免无边界 drive-by refactor。
- TD-3：provider HTTP route 的重复 query parsing 收敛到 `server/api/investment-events/` 下的局部 adapter helper；该 helper 只处理 HTTP query 到 service input / provider response 的转换，不承载 backend investment semantics。
- TD-4：News Query Service 的 snapshot / legacy fallback response 组装只抽为 service 内部私有 helper，不创建跨新闻与投资事件业务线的公共 abstraction。
- TD-5：Event Projection persistence 只抽取 projection row serialization、upsert params 和 query index entry 构造等纯 helper；SQL 执行、事务顺序和 schema owner 仍保留在 `EventProjectionTable`。
- TD-6：Related events 查询拆成 lookup planning、并发执行和 section assembly；不得改变 section 顺序、跨 section 去重、limit clamp 或 indexed related 优先级。
- TD-7：benchmark 脚本拆分不是当前实现闸门；如果后续纳入，必须保持 CLI 参数、`pnpm perf:surface-baseline` 用法和 JSON 输出 contract 不变。
- TD-8：R1 测试形态采用独立 adapter characterization test，测试文件放在 `test/investment-events-query-adapter.test.ts`，避免 route handler setup 干扰 query parsing 等价证明，同时避免 `.test.ts` 被 Nitro 当作 API route 打包。
- TD-9：R3 默认只抽 same-module pure helper，不移动 SQL 字符串；SQL 常量化不纳入本 backlog，除非后续单独审批并增加字段列表 / 参数顺序测试。

### Resolved Design Review Items

- OD-1：已解决。R1 采用独立 adapter characterization test。
- OD-2：已解决。R3 默认只抽 pure helper，不移动 SQL 字符串。
