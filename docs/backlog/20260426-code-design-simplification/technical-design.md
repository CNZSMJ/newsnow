# Code Design Simplification Technical Design

状态：Ready for Implementation；审批通过；research 已核实
最后更新：2026-04-26
范围：性能重构后代码设计简化的已审批技术方案

## 1. 实现闸门

- 当前方案已完成审查并审批通过。
- 进入实现前，必须确认 `implementation-plan.md` 已完成与本技术方案的一致性检查。
- 实现只能按 `implementation-plan.md` 的 Sprint / TDD step 推进，不允许绕过计划做 drive-by refactor。

## 2. 设计原则

- Preserve behavior exactly：只改变表达方式，不改变输入、输出、副作用、错误行为、执行顺序或边界条件。
- Chesterton's Fence：抽取、移动、删除或重命名前，先确认现有代码承担的历史兼容或业务边界。
- 局部抽象优先：能用 module-local helper 解决时，不创建跨业务线公共 abstraction。
- 单一 owner 不变：backend-owned investment semantics、projection schema owner、news fallback owner 不迁移。
- 清晰优先于行数减少：不为了减少行数删除 error handling、fallback、日志或验证路径。
- 小步 TDD：每个 refactor step 必须有 focused test、characterization test 或现有覆盖证明。

## 3. 目标边界总览

| 问题 | 当前 owner | 目标 owner | 明确不迁移的责任 |
| --- | --- | --- | --- |
| R1 provider route query parsing | `server/api/investment-events/*.ts` route files | `server/api/investment-events/query-adapter.ts` | investment semantics 不进入 route adapter |
| R2 news fallback branch | `NewsQueryService` | `NewsQueryService` private helpers | 不创建 news / event 共享 runtime abstraction |
| R3 projection persistence | `EventProjectionTable` | `EventProjectionTable` + same-module pure helpers | SQL owner、事务顺序、schema owner 不外移 |
| R4 related events | `InvestmentQueryService` | same service + private planning / assembly helpers | 查询并发、section order、dedupe 语义不变 |
| R5 benchmark script | `scripts/benchmark-surface-performance.ts` | 暂不进入当前 DoD | perf gate CLI / JSON contract 不变 |

## 4. R1：Provider Route Query Adapter

目标：

- 收敛 latest / search / entity 三个 provider list routes 的重复 HTTP query parsing。
- 让 route 文件只表达 HTTP 边界：读取 request、调用 query service、转换 provider response、返回 error。

目标位置：

- `server/api/investment-events/query-adapter.ts`

候选 helper：

- `parseInvestmentListQuery(query, options)`
- `parseInvestmentSort(query)`
- `parseTimestampQuery(value)`
- `resolveLifecycleAfter(query)`
- `buildInvestmentListResponse(result, options)`

设计约束：

- adapter 输入只接收 HTTP query / route-specific options。
- adapter 输出只生成 Investment Query Service input 或 provider response shape。
- route-specific required 参数仍由 route 明确声明，例如 search 的 `q`、entity 的 `entity`。
- 不把 event family、directional view、materiality、tradability、authority 等 backend-owned semantics 计算放入 adapter。

行为保持要求：

- `sort=changed/latest/investment` 与 `latest=true` 语义不变。
- `changed_since` 与 `lifecycle_after` 的优先级不变。
- `limit` clamp 范围不变。
- focus、event_family、materiality、authority 等过滤行为不变。
- 缺少 `q` / `entity` 时的 HTTP error 行为不变。

测试要求：

- 优先新增独立 adapter characterization test；如果 route handler 已有成熟 test harness，可用 route handler test 覆盖同一行为。
- 必须覆盖缺参错误、默认参数、limit clamp、sort fallback、timestamp parsing、latest / search / entity response shape。

## 5. R2：News Query Service Branch Simplification

目标：

- 降低 `getSource` 与 `getSourcesBatch` 中 snapshot / legacy fallback / stale refresh response 组装重复。
- 保留 News Snapshot Model 作为目标 read model，同时保留 legacy cache migration fallback。

目标位置：

- `server/services/news-query/service.ts`

候选 private helper：

- `responseFromSnapshot(snapshot, freshness, options)`
- `responseFromLegacyCache(entry, freshness, options)`
- `persistLegacyAsSnapshot(sourceKey, entry, waitUntil)`
- `submitRefreshIfStale(sourceKey, reason)`
- `fallbackAfterFetchFailure(sourceKey, error, options)`

设计约束：

- helper 保持 private 或 module-local，不成为新闻业务线与投资事件业务线的共享 abstraction。
- `waitUntil` 仍只用于异步持久化和 background work，不改变 request 可见返回时机。
- stale response 必须继续立即返回 cache，并提交 neutral refresh intent。
- `submitRefreshIfStale` 不能只按 helper 名称做单一粗粒度判断，必须保持当前三类触发边界：
  - single-source stale snapshot：已有 snapshot 且 `snapshotState !== "fresh"` 时提交 refresh intent。
  - single-source legacy cache：仅当 `!isFreshCache(legacy, now, intervalMs)` 时提交 refresh intent。
  - batch snapshot / legacy：snapshot 分支仅当 `snapshotState !== "fresh"` 时提交，legacy 分支仅当 `!isFreshCache(legacy, now, intervalMs)` 时提交。

行为保持要求：

- fresh snapshot 返回 `success`。
- stale snapshot 返回 `cache` 并提交 neutral refresh intent。
- legacy fresh 返回 `success` 并持久化 snapshot。
- legacy stale 返回 `cache` 并提交 neutral refresh intent。
- `forceRefresh` 仍走同步 getter。
- getter 失败时优先 fallback snapshot，再 fallback legacy cache，最后才抛错。

测试要求：

- 扩展 `server/services/news-query/service.test.ts`。
- 覆盖 fresh snapshot、stale snapshot、legacy fresh、legacy stale、force refresh、fetch failure fallback、batch source 等价行为。
- 必须断言 fresh snapshot 和 fresh legacy cache 不提交 refresh intent，stale snapshot、stale legacy cache、batch non-fresh snapshot / legacy cache 会提交 refresh intent。

## 6. R3：Event Projection Persistence Decomposition

目标：

- 降低 `upsertProjection` 中 SQL 字段、参数序列化、projection upsert、旧索引清理、新索引写入的耦合。
- 降低 `insertIndexEntries` 中多类 index entry 构造逻辑的膨胀风险。

目标位置：

- `server/database/event-projections.ts`

候选 helper：

- `buildProjectionRowInput(input, now)`
- `buildProjectionUpsertParams(rowInput)`
- `buildEventQueryIndexEntries(input)`
- `buildRelatedEventIndexEntries(input)`
- `insertEventQueryIndexEntries(entries, rankScore, sortTime)`

设计约束：

- SQL 执行、transaction order、table owner 仍保留在 `EventProjectionTable`。
- 默认不移动 SQL 字符串；先抽纯 helper，降低参数错位和 index entry 漏写风险。
- 如果 technical-design 审批时决定常量化 SQL fragment，必须额外增加参数顺序和字段列表的测试证明。

行为保持要求：

- `event_projection` 字段值不变。
- `event_query_indexes` 写入集合不变。
- related index 清理边界不变：删除当前 event 的普通索引和 related 出边，保留其他 event 指向当前 event 的 related 入边。
- deferred publish latest ordering guard 不变。

测试要求：

- 扩展 `server/database/event-projections.test.ts`。
- 覆盖 projection record、query index entries、related index 删除边界、query result、deferred publish latest ordering。

## 7. R4：Related Events Query Planning And Assembly Split

目标：

- 把 `getRelatedEvents` 拆成 lookup planning、并发执行、section assembly。
- 让方法主流程表达“规划 -> 查询 -> 组装”，具体 section 规则可单独测试。

目标位置：

- `server/services/investment-query/service.ts`

候选 helper：

- `buildRelatedEventLookups(detail, options)`
- `executeRelatedEventLookups(lookups)`
- `appendDistinctRelatedSection(sections, seen, sectionInput)`
- `buildRelatedSectionLabel(lookup)`

设计约束：

- 不改变多个 related sources 的并发查询行为。
- 不改变 section 顺序或跨 section 去重。
- 不把 section display label 规则移到 frontend 或 MCP。

行为保持要求：

- section 顺序保持 `entity -> topic -> market -> family`。
- indexed related 仍优先进入 entity section。
- `limitPerSection` clamp 保持 1 到 12。
- 去重必须跨 sections 生效，且当前 event 自身必须排除。

测试要求：

- 扩展 `server/services/investment-query/service.test.ts`。
- 覆盖 section order、dedupe、`limitPerSection` clamp、indexed related 优先级、排除当前 event。

## 8. R5：Benchmark Script Cleanup Candidate

当前决策：

- 不纳入 R1-R4 的最终 DoD。
- 不作为进入 `Completed` 的必要条件。
- 只在 R1-R4 全部完成后，若仍有明确维护收益，再单独评估是否作为追加 sprint。

如果后续纳入，行为边界必须保持：

- CLI 参数不变。
- `pnpm perf:surface-baseline` 使用方式不变。
- 输出 JSON 字段不变。
- HTTP probe 与 DB fanout 诊断口径不变。

## 9. Rollout And Rollback

- 每个 sprint 只处理一个 R 编号，避免不可审查的大改动。
- 每个 sprint 都必须先 red / characterization，再 green refactor，再清理。
- 任一 sprint 如果 focused test 或 typecheck 失败，只回滚该 sprint 的实现，不扩大到其他模块。
- 不引入临时兼容层、临时脚本或未说明的 fallback。

## 10. 审批状态

- 当前方案已审批通过。
- `technical-design-review.md` 审查结论为无开放问题。
- `implementation-plan.md` 已完成与本方案的一致性检查后，允许进入 `Ready for Implementation`。
