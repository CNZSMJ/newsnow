# Code Design Simplification Technical Design

状态：Draft；未审批；禁止进入实现
最后更新：2026-04-26
范围：性能重构后代码设计简化的候选技术方案

## 1. 设计原则

- Preserve behavior exactly。
- 优先使用小步 TDD / characterization test。
- 不改变 module ownership。
- 不把 backend-owned investment semantics 下沉到 route、frontend、MCP 或 prompt。
- 不为了减少行数牺牲显式性。

## 2. 候选设计

### 2.1 Provider route query adapter

候选变更：

- 新增局部 adapter helper，集中处理 investment provider list routes 的 query parsing。
- route 仍然只负责 HTTP error、调用 query service、返回 provider response。

候选位置：

- `server/api/investment-events/query-adapter.ts`

候选 helper：

- `parseInvestmentListQuery(query)`
- `parseInvestmentSort(query)`
- `parseTimestampQuery(value)`
- `buildInvestmentListResponse(result, options)`

行为边界：

- 不改变已有 query 参数名。
- 不改变默认 limit、sort、focus、event_family、changed_since / lifecycle_after 语义。
- 不新增任何 route-level investment semantics。

### 2.2 News Query Service private helper extraction

候选变更：

- 在 `NewsQueryService` 内部拆出私有 helper，降低 `getSource` 和 `getSourcesBatch` 的分支重复。

候选 helper：

- `responseFromSnapshot`
- `responseFromLegacyCache`
- `persistLegacyAsSnapshot`
- `submitRefreshIfStale`

行为边界：

- 不改变 stale snapshot 立即返回 cache 的行为。
- 不改变 stale / legacy fallback 后提交 neutral refresh intent 的行为。
- 不改变 force refresh 的同步 getter 路径。
- 不改变 `waitUntil` 的异步持久化语义。

### 2.3 Event Projection persistence decomposition

候选变更：

- 把 projection row serialization 从 `upsertProjection` 中拆出。
- 把 index entry 构造从 `insertIndexEntries` 中拆出。

候选 helper：

- `buildProjectionRowInput(input, now)`
- `buildProjectionUpsertParams(rowInput)`
- `buildEventQueryIndexEntries(input)`
- `insertEventQueryIndexEntries(entries, rankScore, sortTime)`

行为边界：

- 不改变 `event_projection` schema。
- 不改变 `event_query_indexes` schema。
- 不改变 related index 的入边 / 出边删除边界。
- 不改变 deferred publish latest ordering。

### 2.4 Related events query planning and assembly split

候选变更：

- 把 `getRelatedEvents` 拆成 query planning、query execution、section assembly 三段。

候选 helper：

- `buildRelatedEventLookups(detail, options)`
- `executeRelatedEventLookups(lookups)`
- `appendDistinctRelatedSection`

行为边界：

- 不改变 section 顺序：entity -> topic -> market -> family。
- 不改变 per-section dedupe。
- 不改变 `limitPerSection` clamp。
- 不改变 indexed related 优先进入 entity section 的现有行为。

### 2.5 Benchmark script cleanup

候选变更：

- 如果前四项完成后仍有必要，再拆分 `scripts/benchmark-surface-performance.ts`。

候选拆分：

- CLI arg parsing
- probe execution
- DB fanout diagnostics
- report assembly

行为边界：

- 不改变输出 JSON contract。
- 不改变 `pnpm perf:surface-baseline` 使用方式。

## 3. 风险

- route query adapter 抽取可能误改默认参数行为。
- News fallback helper 抽取可能误改 refresh intent 触发时机。
- Projection params helper 抽取如果测试不足，可能引入 SQL 参数顺序错误。
- Related events 拆分可能误改去重顺序。

## 4. 测试策略

- 先为 route query parsing 增加 focused tests 或利用现有 route smoke / service tests 做 characterization。
- News Query Service 使用现有 `server/services/news-query/service.test.ts` 扩展覆盖。
- Event Projection 使用 `server/database/event-projections.test.ts` 覆盖 upsert 和 index entry 行为。
- Related events 使用 `server/services/investment-query/service.test.ts` 覆盖 section 顺序、dedupe 和 limit。

## 5. 审批状态

- 当前方案为 Draft。
- 尚未完成技术方案审批。
- 尚未允许进入实现。
