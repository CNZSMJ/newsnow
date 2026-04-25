# Technical Design Review

状态：审查完成
审查日期：2026-04-26
审查范围：`technical-design.md` 与已核实的 `research.md` 代码事实、`product-spec.md` 规范的交叉对比
闭环状态：无开放问题；唯一 R2 实现注意事项已回写到 `technical-design.md` 和 `implementation-plan.md`

## 1. 审查结论

technical-design.md 中没有发现与代码事实或上游文档矛盾的错误。所有文件路径、函数名称、行为描述和设计约束均通过源码核实。

## 2. 逐章节审查结果

### §1 实现闸门 — ✅ 正确

与审查时的 product-spec 设计审查阶段状态一致。闸门条件清晰：需更新状态 + implementation-plan 一致性检查。

### §2 设计原则 — ✅ 正确

| 原则 | research 来源 | 一致？ |
| --- | --- | --- |
| Preserve behavior exactly | research §2.1 第 1 条 | ✅ |
| Chesterton's Fence | research §2.1 第 2 条 | ✅ |
| 局部抽象优先 | research R2 简化信号 | ✅ |
| 单一 owner 不变 | research R3 Chesterton's Fence | ✅ |
| 清晰优先于行数减少 | research §7 + §2.2 第 5 条 | ✅ |
| 小步 TDD | research §6 + §7 | ✅ |

全部追溯到 research 原文，无偏差。

### §3 目标边界总览 — ✅ 正确

| 行 | 声明 | 核实结果 |
| --- | --- | --- |
| R1 当前 owner `server/api/investment-events/*.ts` | 对应 `latest.ts`, `search.ts`, `entity.ts` | 准确 |
| R1 目标 `query-adapter.ts` | 审查时为计划新增文件；实现完成后已新增 | 准确 |
| R1 "investment semantics 不进入 route adapter" | 与 research §3 R1 简化信号一致 | 准确 |
| R2 当前 owner `NewsQueryService` | 对应 `server/services/news-query/service.ts` | 准确 |
| R2 目标 private helpers | 与 research R2 简化信号一致 | 准确 |
| R2 "不创建 news / event 共享 runtime abstraction" | 与 research R2 简化信号一致 | 准确 |
| R3 当前 owner `EventProjectionTable` | 对应 `server/database/event-projections.ts` | 准确 |
| R3 目标 same-module pure helpers | 与 research R3 简化信号一致 | 准确 |
| R3 "SQL owner、事务顺序、schema owner 不外移" | 与 research R3 Chesterton's Fence 一致 | 准确 |
| R4 当前 owner `InvestmentQueryService` | 对应 `server/services/investment-query/service.ts` | 准确 |
| R5 "暂不进入当前 DoD" | 与 product-spec §2 一致 | 准确 |

### §4 R1：Provider Route Query Adapter — ✅ 正确

候选 helper 与现有重复代码的映射：

| 候选 helper | 对应当前重复代码 | 准确？ |
| --- | --- | --- |
| `parseInvestmentListQuery(query, options)` | 三文件中重复的 limit/focus/eventFamily/scores/lifecycleAfter 参数解析 | ✅ |
| `parseInvestmentSort(query)` | 三文件中重复的 `resolveSort` 函数 | ✅ |
| `parseTimestampQuery(value)` | 三文件中逐字重复的 `parseTimestampQuery` 函数 | ✅ |
| `resolveLifecycleAfter(query)` | 三文件中逐字重复的 `resolveLifecycleAfter` 函数 | ✅ |
| `buildInvestmentListResponse(result, options)` | 三文件中逐字重复的 response shaping | ✅ |

设计约束核实：

- "route-specific required 参数仍由 route 明确声明" → 与代码一致：`search.ts` 的 `q` 必传校验、`entity.ts` 的 `entity` 必传校验确实是 route-specific 逻辑。
- "不把 backend-owned semantics 放入 adapter" → 与 research R1 简化信号一致。

行为保持要求全部与代码一致：sort 语义、lifecycle_after/changed_since 优先级、limit clamp 范围 `[1, 400]`、focus/event_family 过滤、缺参错误行为。

### §5 R2：News Query Service Branch Simplification — ✅ 正确

候选 helper 与现有逻辑的映射：

| 候选 helper | 对应现有逻辑 | 准确？ |
| --- | --- | --- |
| `responseFromSnapshot(snapshot, freshness, options)` | `getSource` 的 fresh/stale snapshot response 构造 | ✅ |
| `responseFromLegacyCache(entry, freshness, options)` | `getSource` 和 `getSourcesBatch` 的 legacy response 构造 | ✅ |
| `persistLegacyAsSnapshot(sourceKey, entry, waitUntil)` | `getSource` 和 `getSourcesBatch` 的 `persistSnapshot` 调用 | ✅ |
| `submitRefreshIfStale(sourceKey, reason)` | `getSource` 和 `getSourcesBatch` 的 `submitRefreshIntent` 调用 | ✅ |
| `fallbackAfterFetchFailure(sourceKey, error, options)` | `getSource` catch 块的 fallback 链 | ✅ |

行为保持要求全部与代码一致。测试文件 `server/services/news-query/service.test.ts` 已确认存在。

实现注意事项：

- `submitRefreshIfStale` 的 "IfStale" 语义需正确映射三个不同分支的 refresh 提交条件：stale snapshot 分支（无条件提交）、stale legacy 分支（仅当 `!isFreshCache` 时提交）、batch 分支（仅当 `snapshotState !== "fresh"` 时提交）。这三种条件本质等价（都是 non-fresh），但实现时需确保不丢失边界。

### §6 R3：Event Projection Persistence Decomposition — ✅ 正确

候选 helper 与现有逻辑的映射：

| 候选 helper | 对应现有逻辑 | 准确？ |
| --- | --- | --- |
| `buildProjectionRowInput(input, now)` | `upsertProjection` 的 25 个参数序列化 | ✅ |
| `buildProjectionUpsertParams(rowInput)` | 同上，进一步结构化 | ✅ |
| `buildEventQueryIndexEntries(input)` | `insertIndexEntries` 的 8 类 index（latest-watchlist）构造 | ✅ |
| `buildRelatedEventIndexEntries(input)` | `insertIndexEntries` 的 related index 构造 | ✅ |
| `insertEventQueryIndexEntries(entries, rankScore, sortTime)` | `insertIndexEntries` 的执行循环 | ✅ |

设计约束核实：

- "默认不移动 SQL 字符串" → 与 research §8 待确认问题第 4 条一致。
- "SQL 执行、transaction order、table owner 仍保留在 EventProjectionTable" → 与 research R3 Chesterton's Fence 一致。

行为保持要求全部与代码一致。related index 清理边界 `(event_id = ? AND index_name != 'related') OR (index_name = 'related' AND index_value = ?)` 已核实。测试文件 `server/database/event-projections.test.ts` 已确认存在。

### §7 R4：Related Events Query Planning And Assembly Split — ✅ 正确

候选 helper 与现有逻辑的映射：

| 候选 helper | 对应现有逻辑 | 准确？ |
| --- | --- | --- |
| `buildRelatedEventLookups(detail, options)` | 参数提取 + 并发查询规划 | ✅ |
| `executeRelatedEventLookups(lookups)` | `Promise.all` 5 路并发执行 | ✅ |
| `appendDistinctRelatedSection(sections, seen, sectionInput)` | `appendSection` 闭包 | ✅ |
| `buildRelatedSectionLabel(lookup)` | `getInvestmentRelatedSectionDisplayLabel` 调用 | ✅ |

设计约束核实：

- "不改变多个 related sources 的并发查询行为" → 与 research R4 Chesterton's Fence 一致。
- "不改变 section 顺序或跨 section 去重" → 与 research R4 行为保持要求一致。
- "不把 section display label 规则移到 frontend 或 MCP" → 与 research §7 一致。

行为保持要求全部与代码一致：section 顺序 `entity→topic→market→family`、indexed related 优先进入 entity section、`limitPerSection` clamp `[1, 12]`、跨 section 去重 + 排除当前 event。测试文件 `server/services/investment-query/service.test.ts` 已确认存在。

### §8 R5：Benchmark Script Cleanup Candidate — ✅ 正确

排除决策与 product-spec §2 一致。行为边界与 research R5 一致。

### §9 Rollout And Rollback — ✅ 正确

- "每个 sprint 只处理一个 R 编号" → 与 research §7 一致。
- "red / characterization → green refactor → 清理" → TDD 流程合理。
- "不引入临时兼容层" → 与 research §2.2 和 §7 一致。

### §10 审批状态 — ✅ 正确

与 product-spec 状态一致。

## 3. 总结

| 章节 | 判定 | 说明 |
| --- | --- | --- |
| §1 实现闸门 | ✅ 正确 | 闸门条件清晰 |
| §2 设计原则 | ✅ 正确 | 全部追溯到 research |
| §3 目标边界总览 | ✅ 正确 | 文件路径、owner 均与代码一致 |
| §4 R1 query adapter | ✅ 正确 | 5 个候选 helper 映射准确 |
| §5 R2 news fallback | ✅ 正确 | 5 个候选 helper 映射准确；`submitRefreshIfStale` 实现时注意条件映射 |
| §6 R3 projection persistence | ✅ 正确 | 5 个候选 helper 映射准确 |
| §7 R4 related events | ✅ 正确 | 4 个候选 helper 映射准确 |
| §8 R5 benchmark | ✅ 正确 | 排除决策与 spec 一致 |
| §9 rollout/rollback | ✅ 正确 | TDD 流程合理 |
| §10 审批状态 | ✅ 正确 | 与 spec 一致 |

所有文件路径、函数名称、行为描述和设计约束均通过源码核实。19 个候选 helper 全部能精确追溯到现有代码中的重复或复杂逻辑。唯一的实现注意事项是 R2 `submitRefreshIfStale` 的条件映射。
