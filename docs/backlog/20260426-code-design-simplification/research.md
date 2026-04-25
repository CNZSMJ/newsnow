# Code Design Simplification Research

状态：Draft
最后更新：2026-04-26
范围：性能重构合并后，对新增和大改代码做行为不变的代码设计简化调研

## 1. 背景

`20260424-newsnow-surface-performance-rearchitecture` 已合并到 `custom/main`。性能目标已经闭环，但新增 query model、projection、runtime、benchmark 和文档治理脚本中存在若干可维护性复杂度。

本 backlog 只处理代码表达和模块边界清晰度，不改变产品行为、API contract、数据库语义或投资事件语义。

## 2. 已完成只读审查

审查方式：

- 激活 `code-simplification` 进行只读审查。
- 范围优先覆盖刚合并的性能重构新增 / 大改代码。
- 未修改任何文件。

## 3. 发现的问题

### R1：投资事件 provider list routes 存在重复 query parsing

涉及文件：

- `server/api/investment-events/latest.ts`
- `server/api/investment-events/search.ts`
- `server/api/investment-events/entity.ts`

重复内容：

- `parseTimestampQuery`
- `resolveLifecycleAfter`
- `resolveSort`
- limit clamp
- materiality / authority score parsing
- focus / event_family filtering
- `InvestmentProviderEventListResponse` shaping

风险：

- 后续新增 query 参数时容易只改一个 route，导致 latest / search / entity 语义漂移。
- route 文件承担过多 adapter 细节。

### R2：`NewsQueryService` 同时承担多条读取路径

涉及文件：

- `server/services/news-query/service.ts`

复杂点：

- `getSource` 同时处理 fresh snapshot、stale snapshot、legacy fallback、force refresh、fetch error fallback。
- `getSourcesBatch` 重复了 snapshot / legacy cache 的部分 response 组装逻辑。
- fresh / stale 判断和 background refresh 触发分散在多个分支。

风险：

- 新闻读取行为已经正确，但未来改 fallback 或 refresh 时容易漏掉 single-source 或 batch-source 其中一侧。

### R3：`EventProjectionTable` 的 persistence 方法承担过多职责

涉及文件：

- `server/database/event-projections.ts`

复杂点：

- `upsertProjection` 同时负责 SQL 字段列表、参数序列化、projection upsert、旧索引清理和新索引写入。
- `insertIndexEntries` 同时构造 latest / detail / search / entity / topic / source / market / watchlist / related 多类 index。

风险：

- 修改 projection schema 时，SQL 字段、VALUES 占位符、参数顺序和 update list 容易不一致。
- 新增 index 类型时容易让 `insertIndexEntries` 继续膨胀。

### R4：`InvestmentQueryService.getRelatedEvents` 混合 query planning 与 section assembly

涉及文件：

- `server/services/investment-query/service.ts`

复杂点：

- 同一方法中完成 related lookup 规划、并发查询、去重、section label 和 display label 组装。

风险：

- 新增 related 维度时会继续扩大单个方法。
- 去重逻辑与 section 组装耦合，后续难以单独测试。

### R5：surface benchmark 脚本职责偏重

涉及文件：

- `scripts/benchmark-surface-performance.ts`

复杂点：

- 同时承担 CLI parse、HTTP probe、DB 直连 fanout 诊断和报告组装。

判断：

- 这是工具脚本，优先级低于在线业务代码。
- 后续可以在性能工具整理时拆分，不应优先占用本 backlog 的第一轮实现。

## 4. 当前共识

- 简化必须严格保持行为不变。
- 不做 API contract、数据库语义、业务语义或投资语义变更。
- 不移动 backend-owned investment semantics 到 route、frontend、MCP 或 downstream prompt。
- 不追求行数减少，优先降低修改风险和理解成本。

## 5. 待确认问题

- 是否把 R5 纳入本 backlog 的最终 DoD，还是仅作为后续低优先级候选。
- 投资事件 provider route query adapter 放在 `server/api/investment-events/` 局部，还是放到 `server/services/investment-query/` 作为 HTTP adapter 辅助。
