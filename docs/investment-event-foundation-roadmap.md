# 投资事件基础路线图

状态：使用中基线
最后更新：2026-04-19
范围：`newsnow` 的 `events` 系统从当前 canonical event engine 演进为专业、可靠、投资级结构化事件基座的分阶段路线图
文档角色：架构基线与已关闭 foundation 阶段的正式记录
更新时机：长期边界规则、终态假设或基础阶段结论发生变化时

## 1. 目的

这份 roadmap 用来定义：`events` 系统如何从当前 canonical event engine，继续演进成能支撑真实投资工作流的专业数据基座。

这份文档刻意只讨论 `events` 系统本身，不讨论 thesis、订阅分发、组合管理、提醒策略或执行系统。

## 2. 边界

`events` 系统负责：

- canonical event truth
- structured facts
- evidence linkage
- canonical entity registry 与 nomenclature
- entity / market / topic linkage
- 事件身份、merge、lifecycle、series 关系
- event-native investment interpretation
- 稳定的 read / query surface
- replay、repair、backfill、metrics、operational quality

`events` 系统不负责：

- thesis state
- variable evaluation
- subscription consumers
- alerting policy
- portfolio positions
- order execution

## 3. 终态定义

目标不是“做一个更好的新闻页”，而是做一个能安全支撑 discretionary investing 和未来下游系统的专业事件底座。

这套底座最终应当能够：

- 用 facts-first 的结构化记录表达高价值事件域
- 明确区分 lifecycle event 与 periodic series event，避免语义漂移
- 保持 security、issuer、institution、market、industry 身份稳定且干净
- 以投资者可读的方式保留 evidence 和事件演进
- 支持按 entity、market、family、direction、materiality、tradability、authority、freshness 的投资扫描
- 在 replay、backfill、repair 后仍保持 canonical consistency
- 将存储和查询实现细节藏在稳定 contract 之后，为未来数据库升级留出空间

## 4. 运行规则

下面这些规则在所有 phase 都成立。

### 4.1 先把语义做稳，再谈分发

在事件基座本身还不够稳定前，不要把 subscription 或下游 delivery mechanics 当成主动工作流。

### 4.2 facts 优先于 summary

高价值事件应先以 structured facts 表达。human-readable summary 是 projection，不是主数据契约。

### 4.3 事件意义必须保持客观

`events` 可以计算 investment-native interpretation，但不能吸收 thesis-specific、portfolio-specific 或 user-private 逻辑。

### 4.4 可 repair 性是设计的一部分

只要某个阶段改变了语义，就必须同时留下 replay 路径、验证路径和 repair 路径。

### 4.5 存储必须可替换

当前数据库形态可以保留，但 contract、repository logic 和 query semantics 不能被 SQLite JSON 当前行为绑死。

### 4.6 只允许 bounded LLM use

LLM 只允许用作有限辅助，用于模糊、长文本、低结构场景。
在 authoritative structured source 已存在时，不能用 LLM 替代 deterministic extraction。

任何 LLM-assisted 路径都必须：

- schema constrained
- evidence linked
- confidence bounded
- 带 deterministic fallback

### 4.7 canonical entity registry 是基座的一部分

entity normalization 不能靠零散正则和临时 heuristics 撑着。
canonical entity registry / nomenclature layer 必须作为事件基座的一部分存在，并被 extractor、resolver、merge、query 共同使用。

## 5. 阶段总览

| Phase | 名称 | 核心目标 | 核心设计问题 | 退出信号 |
| --- | --- | --- | --- | --- |
| 1 | Semantic Baseline | 先把“发生了什么”说对 | entity、subject、family、market 边界是否稳定 | 高价值 source family 的基础语义收口 |
| 2 | Facts-First Depth | 让高价值事件有足够的结构化深度 | 系统是只知道有事件，还是知道事件的关键事实 | 高价值 families 的 structured facts 能支撑投资阅读 |
| 3 | Identity and Series Model | 区分 lifecycle 与 periodic series | “同一事件更新”和“同类新一期发布”有没有被混淆 | series / period / cadence 模型稳定 |
| 4 | Merge and Timeline Hardening | 让事件演进低噪、可读 | merge 和 timeline 会不会误导投资者 | timeline 更像投资演进，而不是 debug 日志 |
| 5 | Query and Scan Foundation | 建立稳定的投资扫描面 | 下游能否按投资语义稳定读取事件 | query / API / MCP scan semantics 稳定 |
| 6 | Quality Gates and SLOs | 把质量门槛变成发布门槛 | 是否能用指标而不是感觉判断质量 | gate 与质量快照可执行 |
| 7 | Repair, Backfill, and Operations | 让系统长期可运营 | 语义升级后是否还能持续维护 | repair / backfill / ops 流程闭环 |

## 6. 各阶段设计

### Phase 1：Semantic Baseline

设计重点：

- 收紧 `security / issuer / institution / market / industry` 边界
- 引入并使用 canonical entity registry
- 压缩高价值 source family 的 `general_news / other` fallback
- 把投资者默认能看到的 subject / entity / family 先说对

完成标准：

- 高价值 source 不再大面积输出错主体、错 market、错 tradable subject
- entity alias / ticker / code / full code 能收敛到稳定 canonical identity

### Phase 2：Facts-First Depth

设计重点：

- 对高价值 source family 提高 structured fact completeness
- 公告、政策、宏观、行业数据从“标题驱动”推进到“事实驱动”
- `whyItMatters`、`whatToWatchNext` 开始建立在 facts 之上

完成标准：

- 高价值事件默认就有可消费的 structured facts
- detail 页不再需要依赖自由文本才能理解关键变化

### Phase 3：Identity and Series Model

设计重点：

- 明确 `lifecycle event` 与 `periodic series event` 的模型差异
- 对周期发布类事件补齐 `series_key / period_key / release_cadence`
- 避免“新一期发布”被误并进“同一事件更新”

完成标准：

- 周期数据能正确作为同系列不同期次存在
- 同一事件更新与新一期数据发布不再混淆

### Phase 4：Merge and Timeline Hardening

设计重点：

- 提高 duplicate merge 的质量
- 压缩 timeline 中的低价值 churn
- 保留真正值得投资者看到的确认、补充、修正、撤回

完成标准：

- timeline 对投资者可读
- 重复“首次识别”“事件确认”“维护性刷新”被明显压低

### Phase 5：Query and Scan Foundation

设计重点：

- 建立稳定的 query / scan semantics
- 支持按 entity、market、family、direction、authority、materiality、tradability、freshness 扫描
- 支持 `changed_since`、`series_key`、`period_key` 这类投资级读取语义

完成标准：

- backend / frontend / MCP 能用统一扫描语义消费事件
- 列表与详情的 projection 保持一致

### Phase 6：Quality Gates and SLOs

设计重点：

- 将 structured coverage、generic fallback、latency 变成显式 gate
- 区分 automated runtime gate 与 manual sample / replay review gate
- 暴露统一 quality snapshot 和 release gate 结果

完成标准：

- `events:check-quality` 可执行
- `/api/ops/events/status` 能展示 snapshot、blocking gates、release readiness

### Phase 7：Repair, Backfill, and Operations

设计重点：

- 增加 ops triage surfaces
- 标准化 repair / backfill / replay 流程
- 让历史脏数据可以被修，而不是只能靠投影遮盖

完成标准：

- `events:ops-report` 可执行
- runbook 成为仓内标准流程
- 语义升级与 repair/backfill 可以闭环

## 7. 持续执行节奏

每个阶段或每一批语义改动，都必须遵循同样的 cadence：

1. 先明确本批要提升的是哪类能力
   例如：提速、提准、提深度、提投资可用性、提运维可靠性
2. 先补 replay / targeted tests / fixtures
3. 再改 extractor / resolver / merger / impact / query
4. 必跑：
   - targeted tests
   - 必要的 replay / shadow
   - `pnpm typecheck`
   - `pnpm build`
5. 如果涉及 repair 或 backfill，要在 runbook 里有明确流程

## 8. 执行日志

### 2026-04-17 — Phase 1 完成，Phase 2 开始

Phase 1 完成内容：

- 建立 entity registry 与核心 nomenclature 规则
- 收紧 source profile、resolver、entity normalization
- 修正多类主体、市场、tradable subject 误识别问题

带入 Phase 2 的残余风险：

- structured fact completeness 仍不足
- 高价值 families 的解释深度还不够

### 2026-04-17 — Phase 2 完成，Phase 3 开始

Phase 2 完成内容：

- 高价值 source family 的 facts-first 结构显著加强
- announcement / policy / macro / industry families 的 key facts 更完整
- `impact` 与 `investment-view` 开始更多消费 structured facts

带入 Phase 3 的残余风险：

- 周期事件与 lifecycle 事件仍需显式建模区分

### 2026-04-17 — Phase 3 完成，Phase 4 开始

Phase 3 完成内容：

- `series_key / period_key / release_cadence` 进入持久化与 query 语义
- 周期事件开始具备清晰 series 关系

带入 Phase 4 的残余风险：

- timeline 噪音和 duplicate merge 仍需继续打磨

### 2026-04-17 — Phase 4 完成，Phase 5 开始

Phase 4 完成内容：

- duplicate merge provenance 与 investor timeline 展示分离
- timeline 噪音显著压缩

带入 Phase 5 的残余风险：

- query / scan 语义还需要系统化

### 2026-04-17 — Phase 5 完成，Phase 6 开始

Phase 5 完成内容：

- query / scan foundation 到位
- provider route、frontend、MCP 开始稳定复用 investment projection

带入 Phase 6 的残余风险：

- 质量门槛仍更多依赖人工信心，而不是显式 gate

### 2026-04-17 — Phase 6 完成，Phase 7 开始

Phase 6 完成内容：

- 引入 event-base SLO 与 automated runtime gate
- `/api/ops/events/status` 暴露 quality snapshot、SLO、release gate
- 增加 `pnpm events:check-quality`

当时的 gate 结果：

- `highValueStructuredCoveragePct = 100`
- `highValueGenericFallbackSharePct = 0`
- `prioritySourceIngestLatencyP95Ms` 仍为 fail

带入 Phase 7 的残余风险：

- 质量门槛能看见问题，但运维流程还没形成标准动作

### 2026-04-17 — Phase 7 完成，foundation roadmap 关闭

Phase 7 完成内容：

- 增加 ops latency diagnostics
- 将 diagnostics 接入 `/api/ops/events/status`
- 增加 `pnpm events:ops-report`
- 初步形成标准 triage surface

foundation 关闭后的残余风险：

- priority-source latency 在真实数据上仍需继续治理
- sampled entity / merge / replay review 仍需要人工流程
- 下一阶段需要进入 source-by-source latency remediation 与 runbook discipline

### 2026-04-18 — Post-close correction：backlog classification 改为基于持久化 poll history

关闭后的修正内容：

- backlog 判定不再基于 `raw_items` arrival gap
- 引入 `source_fetch_runs`
- even zero-item poll 也会落 run
- `events.ingested_at` 明确回到“首次 canonical detection”的语义

这一步让 stratified latency gate 真正可被信任。

## 9. Post-foundation 执行规则

foundation 关闭后，不再以“新 phase”推进，而以连续 hardening batch 推进。

### 9.1 分层 latency thresholds

不再使用单一 aggregate latency target，而是使用：

- Tier A：trade-critical
- Tier B：high-value non-intraday
- Tier C：long-form / heavy parsing

同时必须区分：

- `initial canonical latency`
- `full semantic enrichment latency`

### 9.2 优先硬化高价值 source family

高价值 source family 是 semantic hardening 的优先对象。
长尾 source 可以保守，但绝不能写脏 canonical entity truth。

### 9.3 运维必须 runbook 化

repair、backfill、manual review、latency triage 都必须落进仓内 runbook，而不是继续依赖临时经验。

## 10. Deferred Work

下面这些工作是刻意后置的，不属于 foundation 主线：

- subscription / external delivery
- thesis integration
- alerting policy
- portfolio / execution logic
- PDF / tables / OCR / multimodal parsing 的大规模扩展
- public `event.*` contract 在 `nexus-fi-mcp` 的最终归一化

这些能力都应建立在一个已经稳定、可信、可 repair 的事件基座之上，而不是反过来驱动 `events` 的边界。
