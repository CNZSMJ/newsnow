# Code Design Simplification Research

状态：Design Review；research 已由用户核实属实
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

### 2.1 `code-simplification` 方法约束

本 backlog 必须遵守 `code-simplification` 的以下约束：

- Preserve behavior exactly：只改变表达方式，不改变输入、输出、副作用、错误行为、执行顺序或边界条件。
- Chesterton's Fence：任何抽取、移动、删除或重命名前，必须先理解代码为什么这样写。
- Follow project conventions：简化必须贴合当前仓库的 TypeScript、route adapter、service、database DAO 和测试风格。
- Prefer clarity over cleverness：不追求更短代码，优先让下一位工程师或 agent 更快理解。
- Scope to what changed：优先处理性能重构新增 / 大改代码，不做无关 drive-by refactor。
- Incremental verification：每个简化项必须有 focused test 或 characterization test 证明行为未变。

### 2.2 不属于简化的变更

下面内容不允许被包装成“代码简化”：

- 调整外部 API request / response contract。
- 调整数据库 schema、projection 语义或 index 语义。
- 调整 investment semantics 计算位置或含义。
- 调整 news fallback / refresh 的可见行为。
- 为了减少行数删除错误处理、fallback、日志或验证路径。
- 把多个不相关 refactor 混成一个不可审查的大改动。

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

Chesterton's Fence：

- 当前重复可能来自历史上 latest / search / entity routes 独立演进，以及旧 canonical query path 到 Investment Query Service 的增量迁移。
- route 层保留 parsing 是合理的 adapter 责任，但重复 parsing helper 不再有明显收益。

简化信号：

- 属于 repeated conditionals / duplicated logic。
- 适合抽成局部 route adapter helper，而不是放入 backend investment semantics 层。

行为保持要求：

- `sort=changed/latest/investment` 和 `latest=true` 语义不变。
- `changed_since` 与 `lifecycle_after` 的优先级不变。
- `limit` clamp 范围不变。
- focus 和 event family 的后置过滤行为不变。
- 缺少 `q` / `entity` 时的错误行为不变。

### R2：`NewsQueryService` 同时承担多条读取路径

涉及文件：

- `server/services/news-query/service.ts`

复杂点：

- `getSource` 同时处理 fresh snapshot、stale snapshot、legacy fallback、force refresh、fetch error fallback。
- `getSourcesBatch` 重复了 snapshot / legacy cache 的部分 response 组装逻辑。
- fresh / stale 判断和 background refresh 触发分散在多个分支。

风险：

- 新闻读取行为已经正确，但未来改 fallback 或 refresh 时容易漏掉 single-source 或 batch-source 其中一侧。

Chesterton's Fence：

- 当前分支复杂度来自明确的兼容迁移：News Snapshot Model 是目标 read model，legacy cache 仍是 migration fallback。
- 不能因为要简化而删除 legacy fallback，也不能把 stale refresh 恢复成同步上游 fetch。

简化信号：

- `getSource` 是 long function，且存在多段重复 response shaping。
- `getSource` 与 `getSourcesBatch` 存在重复 stale / legacy 判断。
- 适合抽私有 helper，不适合拆出新的跨业务公共 abstraction。

行为保持要求：

- fresh snapshot 返回 `success`。
- stale snapshot 返回 `cache` 并提交 neutral refresh intent。
- legacy fresh 返回 `success` 并持久化 snapshot。
- legacy stale 返回 `cache` 并提交 neutral refresh intent。
- `forceRefresh` 仍走同步 getter。
- getter 失败时优先 fallback snapshot，再 fallback legacy cache，最后才抛错。
- `waitUntil` 异步持久化语义不变。

### R3：`EventProjectionTable` 的 persistence 方法承担过多职责

涉及文件：

- `server/database/event-projections.ts`

复杂点：

- `upsertProjection` 同时负责 SQL 字段列表、参数序列化、projection upsert、旧索引清理和新索引写入。
- `insertIndexEntries` 同时构造 latest / detail / search / entity / topic / source / market / watchlist / related 多类 index。

风险：

- 修改 projection schema 时，SQL 字段、VALUES 占位符、参数顺序和 update list 容易不一致。
- 新增 index 类型时容易让 `insertIndexEntries` 继续膨胀。

Chesterton's Fence：

- 当前 DAO 集中 SQL 是为了让 projection 表和 query index 的写入保持同一事务顺序和同一 owner。
- 不能把 projection schema owner 拆散到 route、query service 或 migration 脚本里。

简化信号：

- `upsertProjection` 同时承担 serialization、SQL upsert 和 index lifecycle。
- `insertIndexEntries` 包含多类 index 的构造规则，属于多责任方法。
- 适合先抽纯函数构造参数和 index entries，再保留 DAO 执行 SQL。

行为保持要求：

- `event_projection` 字段值不变。
- `event_query_indexes` 写入集合不变。
- related index 清理边界不变：删除当前 event 的普通索引和 related 出边，保留其他 event 指向当前 event 的 related 入边。
- latest ordering 的 deferred publish guard 不变。
- SQL owner declaration 不变。

### R4：`InvestmentQueryService.getRelatedEvents` 混合 query planning 与 section assembly

涉及文件：

- `server/services/investment-query/service.ts`

复杂点：

- 同一方法中完成 related lookup 规划、并发查询、去重、section label 和 display label 组装。

风险：

- 新增 related 维度时会继续扩大单个方法。
- 去重逻辑与 section 组装耦合，后续难以单独测试。

Chesterton's Fence：

- 当前实现把多个 related sources 并发查询，是为了降低 detail / related-events fan-out latency。
- 不能为了简化改成串行查询，也不能改变 section 顺序或去重顺序。

简化信号：

- 单个方法同时做 query planning、execution、dedupe、labeling 和 output assembly。
- 局部 `appendSection` 已经暗示可以进一步命名和测试。

行为保持要求：

- section 顺序保持 `entity -> topic -> market -> family`。
- indexed related 仍优先进入 entity section。
- `limitPerSection` clamp 保持 1 到 12。
- 去重必须跨 sections 生效，且当前 event 自身必须排除。

### R5：surface benchmark 脚本职责偏重

涉及文件：

- `scripts/benchmark-surface-performance.ts`

复杂点：

- 同时承担 CLI parse、HTTP probe、DB 直连 fanout 诊断和报告组装。

判断：

- 这是工具脚本，优先级低于在线业务代码。
- 后续可以在性能工具整理时拆分，不应优先占用本 backlog 的第一轮实现。

Chesterton's Fence：

- 当前脚本集中实现是为了快速形成性能重构 gate，并将 HTTP probe、worker state 和 fanout breakdown 放到一个可执行入口。
- 不能为了代码洁癖破坏 `pnpm perf:surface-baseline` 的 JSON 输出和命令行使用方式。

简化信号：

- 属于长脚本、多责任工具文件。
- 适合低优先级处理，且只在前四项完成后再判断是否值得拆分。

行为保持要求：

- CLI 参数不变。
- 输出 JSON 字段不变。
- service HTTP probe 与 DB fanout 诊断口径不变。

## 4. 优先级判断

| 优先级 | 问题 | 判断 |
| --- | --- | --- |
| P1 | R1 provider route query adapter | 三个对外 provider list routes 参数语义容易漂移，优先收敛 |
| P1 | R2 News Query Service branch simplification | news 读取 fallback 是用户热路径和 agent 热路径基础，需降低误改风险 |
| P1 | R3 Event Projection persistence decomposition | projection schema / params 对齐风险高，影响投资事件主查询模型 |
| P2 | R4 Related events method split | 影响 detail 可维护性，但当前职责边界仍可理解 |
| P3 | R5 benchmark script cleanup | 工具脚本，不在在线业务路径，优先级最低 |

## 5. 推荐执行顺序

1. R1：先收敛 provider route query adapter，因为它是外部 contract adapter，重复最明显。
2. R2：再简化 News Query Service，确保新闻业务线 fallback 行为更容易审计。
3. R3：再拆 Event Projection persistence，降低 schema 演进风险。
4. R4：再拆 related events，控制 detail query service 方法复杂度。
5. R5：最后重新评估是否纳入本 backlog；若没有明确收益，可以延期。

## 6. 测试与证明方式

每个简化项必须至少满足一个证明方式：

- 现有 focused tests 能覆盖行为，且不修改测试期望。
- 新增 characterization test 锁定当前行为，然后再 refactor。
- 如果是 route adapter，必须覆盖缺参错误、默认参数、limit clamp、sort fallback 和 timestamp parsing。
- 如果是 DAO persistence，必须覆盖 projection record、query index entries、related index 删除边界和 query result。
- 如果是 fallback service，必须覆盖 fresh / stale / legacy / force refresh / failure fallback。

完整 gate：

- `pnpm docs:check`
- `pnpm test`
- `pnpm typecheck`

## 7. 当前共识

- 本 research 结果已由用户核实属实，可以进入 decisions / product-spec / technical-design / implementation-plan 的方案化阶段。
- 简化必须严格保持行为不变。
- 不做 API contract、数据库语义、业务语义或投资语义变更。
- 不移动 backend-owned investment semantics 到 route、frontend、MCP 或 downstream prompt。
- 不追求行数减少，优先降低修改风险和理解成本。
- 不把 performance rearchitecture 的已完成成果重新设计一遍。
- 所有 refactor 必须保持小步、可回滚、可单独 review。

## 8. 待确认问题

- 是否把 R5 纳入本 backlog 的最终 DoD，还是仅作为后续低优先级候选。
- 投资事件 provider route query adapter 放在 `server/api/investment-events/` 局部，还是放到 `server/services/investment-query/` 作为 HTTP adapter 辅助。
- R1 的 route adapter 是否需要独立 test file，还是通过 route handler tests / service tests 间接覆盖。
- R3 是否只抽纯函数 helper，不移动 SQL 字符串；还是进一步把 SQL fragment 常量化。
