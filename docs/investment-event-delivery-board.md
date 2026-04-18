# 投资事件执行看板

状态：执行中
最后更新：2026-04-19
范围：投资事件系统升级的项目管理视图
文档角色：当前执行面
更新时机：当前 tranche、里程碑状态或近期执行重点发生变化时

相关文档：

- [docs/investment-event-foundation-roadmap.md](./investment-event-foundation-roadmap.md)
- [docs/README.md](./README.md)

## 1. 总原则

这份 board 的存在，是为了持续对齐一个架构原则：

> backend event engine 是唯一的事实源，也是唯一的投资语义源
> frontend investor view 和 agent-facing interface 都只是同一事实的 projection

任何任务都不允许把业务语义挪到 frontend 或 agent 包装层里。

## 2. 工作流状态快照

| 工作流 | 当前阶段 | 状态 | 已经成立的事实 | 下一里程碑 |
| --- | --- | --- | --- | --- |
| Backend unified engine | post-foundation tranche 已关闭，backend hardening 持续推进 | Active | canonical events、facts、evidence、impact、replay、shadow、observability、investment projection、series scan semantics、quality gates、分层 latency gates、基于 poll history 的 backlog 判定、ops triage surface 都已经到位 | 在不破坏已关闭 latency/runbook 纪律的前提下，继续提升高价值 source family 的语义精度和 extractor 深度 |
| Frontend investor surface | Investor workbench v1 | In progress | `/events`、`/events/:id`、`/watchlists`、`/watchlists/:id` 已上线，使用 provider-facing investment routes，并支持 action bucket 扫描 | 继续增强 workbench 行为和高频使用场景 |
| Agent/provider interface | Provider contract v2 | In progress | 显式 provider routes 已存在，本地 MCP 已通过同一 projection 暴露任务型 scan/detail 工具 | 继续硬化 provider schema，并减少下游自行重建语义的负担 |

## 3. 已完成的 foundation

### Backend

- [x] Event engine Phase 1-4 完成
- [x] Canonical event / fact / evidence / timeline 存储完成
- [x] Source profiles 与 first-class extractors 完成
- [x] Replay、shadow、metrics、backfill 能力完成
- [x] Canonical investment projection（`investment-view.ts`）完成

### Frontend

- [x] 事件列表页
- [x] 事件详情页
- [x] Watchlist 列表页
- [x] Watchlist 详情页
- [x] 面向投资者语言的 detail sections
- [x] Action buckets：`actionable / watch / noise`
- [x] 按 entity / topic / market / family 的 related-event 导航
- [x] Frontend 投资页面已切换到显式 provider routes

### Agent/provider

- [x] 本地 MCP 已切换到 investment projection
- [x] 事件工具返回 structured content
- [x] facts、evidence、investment interpretation 一起暴露
- [x] investment events / watchlists 的显式 provider routes 已增加
- [x] 任务型 MCP 工具已增加：`event_scan`、`event_get_detail`、`watchlist_scan`

## 4. 近期执行 tranche

### Tranche A：projection 质量提升

目标：

- 在增加新消费面之前，先让 canonical investment projection 更有决策价值

任务：

- [x] 在 canonical investment projection 中加入 `actionBucket`
- [x] 将 action bucket 推到 frontend 列表和详情页
- [x] 将 action bucket 推到本地 MCP summary
- [x] 提升更多 event family 的 `whyItMatters` 质量
- [x] 提升更多 event family 的 `whatToWatchNext` 质量
- [x] 提升更多 event family 的 `riskOfMisread` 质量
- [x] 在 canonical projection 中加入显式 `whatHappened`
- [x] 在 canonical projection 中加入显式 `whoIsAffected`
- [x] 将 `eventFamily` 做成 API / frontend / MCP 的一等过滤项

### Tranche B：investor workbench

目标：

- 将 frontend 从“事件浏览”推进到“决策支持”

任务：

- [x] 按 action bucket 分组事件列表
- [x] 在事件详情加入 related events
- [x] 增加按 market 的 related events 作为第三层 fallback
- [x] 在适当场景下补 same-family context
- [x] 在列表层增加按 action bucket 和 market 的 summary counts
- [x] 提高高频会话下的列表扫描速度
- [x] 在事件详情里显式展示“发生了什么”和“谁受影响”
- [x] 在事件扫描器里暴露 event-family filtering

### Tranche C：provider contract hardening

目标：

- 让 provider-facing MCP contract 更稳定、更可审计

任务：

- [x] 保持 `structuredContent` 与 canonical projection 对齐
- [x] 在 MCP summary output 中加入 action bucket
- [x] 在 MCP summary output 中加入 misread risk
- [x] 更严格地区分 default-safe 与 debug-only event fields
- [x] 增加围绕 projected investment object 的 MCP contract tests
- [x] 为 `nexus-fi-mcp` 准备显式 provider handoff 文档
- [x] 将 related-event assembly 收到 backend canonical service 后面
- [x] 将 watchlist detail 统一到 investment projection 之后
- [x] 增加 investment events / watchlists 的显式 provider routes
- [x] 为 actionable / watchable 扫描增加 provider-level focus filtering
- [x] 基于 provider contract 增加任务型 MCP scan/detail 工具

### Tranche D：workbench convergence

目标：

- 让 investor surface 和本地 MCP 都直接消费 provider contract，并复用 backend-owned focus semantics

任务：

- [x] 将事件列表切到 `/api/investment-events/latest`
- [x] 将事件详情切到 `/api/investment-events/:id`
- [x] 将 watchlist 详情切到 `/api/investment-watchlists/:id`
- [x] 将 focus filtering（`all / actionable / watchable`）移到 provider routes
- [x] 让 event / watchlist scans 复用 provider focus semantics，而不是 client 侧 overfetch
- [x] 增加更丰富的 watchlist workflow summary 和 monitoring cues
- [x] 在能提升导航体验的地方增加 provider-backed search / entity flows

### Tranche E：investor workbench quality

目标：

- 让 investor surface 更像决策工作台，而不是过滤后的事件浏览器

任务：

- [x] 在 watchlist 层增加 dominant families、markets、next checks、misread risks 的 summary cards
- [x] 为 `/events` 增加 workbench search modes：default scan、keyword search、entity search
- [x] 让 search / entity flows 保持在显式 provider routes 上，而不是兼容 projection path
- [x] 在能改善监控流程的地方增加 scan results 和 watchlists 之间的快速跳转
- [x] 为高优先级事件增加更强的“为什么现在可操作”表达
- [x] 为忙碌交易时段增加更紧凑的 high-volume mode

### Tranche F：semantic precision hardening

目标：

- 收紧投资语义，让 investor / agent surface 继承更清晰的主体、更干净的 family、以及更少的 research/news 混杂

任务：

- [x] 将 `actionReason` 做成 backend projection 的一等字段
- [x] 增加 backend-owned `subjectSummary` 和 `publisherInstitution`，替代 frontend 自行重建主体
- [x] 为 research/report 类 source 将 `industry_report` 与 `industry_data` 拆开
- [x] 在需要时继续将 `policy_signal`、`disclosure_signal` 从更宽泛的 fallback family 中拆出来
- [ ] 在更多 source family 中继续提高 `issuer / institution / market` 展示精度
- [ ] 继续降低高价值 source 中剩余的 `general_news` 泛化 fallback

### Tranche G：post-foundation latency remediation 与 runbook discipline

目标：

- 通过降低高价值 source latency、将 semantic hardening 限定在高价值 source family、并固化可重复的 repair/backfill 流程，让事件基座在真实投资使用中具备可运营性

执行规则：

- 使用分层 latency thresholds，而不是单一 aggregate target
- 对 trade-critical source family 保持硬约束：`P95 <= 5 分钟`
- 对非盘中 macro 和长文档政策源允许更慢阈值，但必须明确分类并单独衡量
- 语义硬化优先打高价值 source family
- 长尾 source 可以保守，但不能污染 canonical entity truth
- 运维流程文档必须留在仓内，见 [`docs/event-operations-runbook.md`](./event-operations-runbook.md)

Latency tiers：

- Tier A `Trade-critical`：交易所公告、盘中快讯、央行操作、利率定价；目标 `initial canonical event P95 <= 5 分钟`
- Tier B `High-value non-intraday`：关键宏观发布、重要政策通知；目标 `initial canonical event P95 <= 10-15 分钟`
- Tier C `Long-form / heavy parsing`：长政策文档、复杂深解析源；目标 `initial canonical event P95 <= 30 分钟`
- 所有 tier 都要单独跟踪 `full semantic enrichment latency`，避免深解析吞掉 time-to-first-truth 表现

任务：

- [x] 将高价值 source family 分类到 latency tiers，并在 quality-gate 路径中暴露 tier-aware thresholds
- [x] 将 Tier A latency 拉回可控 steady-state gate
- [x] 让 Tier B / Tier C 保持可见，但不让 heavy parsing 主导 Tier A 告警
- [x] 按高价值 source family 优先继续做 `issuer / institution / market` 精度硬化
- [x] 确保长尾 fallback 保守且不能写脏 canonical subject / entity link
- [x] 落地 repo-owned event operations runbook，并从 roadmap / delivery docs 链过去
- [x] 要求每一批 latency 或 semantic remediation 都跑 replay、targeted tests、quality checks、以及 runbook 记录的 operator review

## 5. Foundation phase 状态

- [x] Phase 1 `Semantic Baseline` 于 2026-04-17 完成
- [x] Phase 2 `Facts-First Depth` 于 2026-04-17 完成
- [x] Phase 3 `Identity and Series Model` 于 2026-04-17 完成
- [x] Phase 4 `Merge and Timeline Hardening` 于 2026-04-17 完成
- [x] Phase 5 `Query and Scan Foundation` 于 2026-04-17 完成
- [x] Phase 6 `Quality Gates and SLOs` 于 2026-04-17 完成
- [x] Phase 7 `Repair, Backfill, and Operations` 于 2026-04-17 完成

## 6. 最近已关闭 tranche 的完成定义

post-foundation tranche 完成的标准是：

1. quality gates 使用分层 Tier A / Tier B / Tier C latency，而不是单一 aggregate blocker
2. `events.ingested_at` 与 duplicate merge 的 ingest 语义保留首次 canonical detection，而不是 refresh time
3. backlog catch-up 判定基于持久化 poll history，且不会污染 steady-state Tier A release gate
4. `events:ops-report`、`events:check-quality` 和 ops status route 已暴露足够的操作真相，能支持 live slow-source triage
5. runbook 在仓内，并且整批改动通过 targeted tests、repair validation、typecheck、build

## 7. 验证节奏

每个活跃 tranche 或 remediation batch 完成时，都必须通过：

- 有针对性的单测
- 语义改动时的 replay / shadow 敏感测试
- `pnpm build`

如果改动会改变事件语义，还应在 tranche 关闭前通过 replay fixtures 做回归核验。

backend 运维批次的操作规范见：

- [docs/event-operations-runbook.md](./event-operations-runbook.md)
