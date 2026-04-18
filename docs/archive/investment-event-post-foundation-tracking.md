# 投资事件后基础阶段执行记录

状态：已完成
最后更新：2026-04-18
范围：`events` 系统在 post-foundation 阶段的 latency remediation、semantic precision hardening 与 runbook closure 执行记录

> 说明：这是一份已归档的执行 tracking。
> 当前事实以顶层活文档为准，尤其是：
> - [../investment-event-delivery-board.md](../investment-event-delivery-board.md)
> - [../investment-event-workstreams.md](../investment-event-workstreams.md)
> - [../event-operations-runbook.md](../event-operations-runbook.md)

## 1. 开工前已阅读文档

在本轮代码变更前，已阅读：

1. [../investment-event-foundation-roadmap.md](../investment-event-foundation-roadmap.md)
2. [../investment-event-workstreams.md](../investment-event-workstreams.md)
3. [../investment-event-delivery-board.md](../investment-event-delivery-board.md)
4. [../event-operations-runbook.md](../event-operations-runbook.md)

从 roadmap 中确认的 post-foundation 入口点：

- 用 diagnostics 去消化 priority-source latency blocker
- 不再使用单一平坦阈值，而是 stratified latency thresholds
- semantic hardening 先打高价值 source family
- 长尾 fallback 不能污染 canonical entity truth
- 运维必须 runbook-driven，且留在仓内

## 2. 架构红线

本轮 tranche 的不可妥协边界：

- `initial canonical latency` 与 `full semantic enrichment latency` 必须分开
- 优化 time-to-first-truth 时，不能写脏 canonical subject、entity link、market link 或 merge 结果
- 不重开、不替换已经关闭的 foundation 模型
- 不允许长尾 fallback 污染 canonical entity registry 或 subject truth
- backend event engine 仍然是 events、facts、evidence、entity linkage、investment semantics 的唯一事实源

## 3. 动态基线采集计划

第一轮 live baseline 采集必须同时抓到当前 latency 和当前 gate 状态。

命令：

- `pnpm events:ops-report -- --hours 24 --limit 20`
- `pnpm events:check-quality`
- `curl http://127.0.0.1:3000/api/ops/events/status`

基线至少记录：

- 最慢的 source kinds
- 最慢的 source ids
- 每个慢源属于哪个 latency tier
- 当前 quality-gate 失败是由 latency、semantic fallback 还是其他回归触发
- 当前 diagnostics 是否已经区分 `initial canonical latency` 和 `full semantic enrichment latency`

## 4. Tranche 1

目标：

- 建立真实的 post-foundation baseline，并在不回退 foundation semantics 的前提下，把 stratified latency thresholds 编进 quality-gate 路径

范围：

- 检查最近 24 小时的 live slow-source breakdown
- 将当前高价值 source kinds 映射到 Tier A / Tier B / Tier C
- 更新 SLO 与 quality-gate 代码，使 latency checks 从 flat aggregate blocker 变成 tier-aware
- 保持 validation 与 runbook 引用和新的分层契约一致

不在范围内：

- 在 tiering contract 还没稳定前，就对各 source 做大面积 worker 重写
- 与高价值 source family 无关的长尾 semantic cleanup
- 任何 frontend-only 的 latency 或 semantics workaround

## 5. 启动时已知 blocker

基线跑之前就已知：

- foundation roadmap 关闭时，`prioritySourceIngestLatencyP95Ms` 在真实数据上仍未达标
- recent diagnostics 已指出 `official_policy_notice`、`official_macro_release`、`official_central_bank_operation`、`official_rate_fixing`、`cninfo-hk-gem` 是慢源候选
- entity precision、false merge、missed merge、replay consistency 的 manual review 仍未完全制度化

## 6. 执行日志

### 2026-04-18 — Tracking 初始化

- 按要求顺序完成文档阅读
- 记录架构红线和 baseline 采集计划
- 打开 Tranche 1，开始 baseline capture 与 stratified latency threshold 实现

### 2026-04-18 — Live baseline 已采集

执行命令：

- `pnpm events:ops-report -- --hours 24 --limit 20`
- `pnpm events:check-quality`
- `curl http://127.0.0.1:3000/api/ops/events/status`

观察到的 baseline：

- 当前自动化 blocker 仍是扁平的 `prioritySourceIngestLatencyP95Ms`
- 当前 runtime snapshot 在结构化与 fallback 上基本健康：
  - `highValueStructuredCoveragePct = 100`
  - `highValueGenericFallbackSharePct = 0`
- 当前阻断型 latency：
  - `prioritySourceIngestLatencyP95Ms = 4489015 ms`
- 最近 24 小时最慢的高价值 source kinds：
  - `official_policy_notice`
  - `official_macro_release`
  - `official_central_bank_operation`
  - `official_rate_fixing`
  - `exchange_disclosure`
- 最明显的慢 source ids：
  - `cninfo-hk-gem`
  - `nhsa-dynamic`
  - `miit-industry`
  - `szse-news`
  - `mof-news`
  - `gov-latest`
  - `pbc-news`
  - `sasac-latest`
  - `stats-industry`
  - `pbc-omo`
  - `chinamoney-shibor`
  - `chinamoney-fdr007`

工程决策：

- Tranche 1 先把 flat latency blocker 换成 stratified tier-aware gates，并引入 dual-latency visibility
- Tranche 2 只有在 tier-aware gate 实现并验证后才允许开始

当前 blocker：

- 现有 quality-gate contract 还没有编码 Tier A / Tier B / Tier C 阈值，所以 `events:check-quality` 实际上仍在对一个过时 aggregate latency contract 进行失败判定

### 2026-04-18 — Tranche 1 完成：runtime gate 已编码 stratified latency thresholds

关闭的代码：

- `server/services/event-engine/slo.ts`
- `server/services/event-engine/quality-gates.ts`
- `server/database/events.ts`
- `server/api/ops/events/status.ts`

工程决策：

- 直接在 runtime snapshot 与 release gating 里编码 Tier A / Tier B / Tier C
- Tier A 保持 automated blocking
- Tier B / Tier C 在 publication clock 还不够精确前，保持 visible 但 non-blocking
- runtime contract 显式分成 `initial canonical latency` 和 `full semantic enrichment latency`

验证：

- `pnpm exec vitest run server/services/event-engine/slo.test.ts server/services/event-engine/quality-gates.test.ts server/database/events.test.ts`

### 2026-04-18 — Tranche 2 完成：latency remediation 让 Tier A gate 稳定下来

确认的根因：

- `events.ingested_at` 在 refresh loop 里被覆盖，抬高了 canonical latency
- duplicate merge survivor 没有保留最早 ingest timestamp
- 一部分 precise-clock Tier A row 实际属于长 fetch gap 之后的 backlog catch-up

代码与数据闭环：

- `server/database/events.ts` 现在在 upsert 与 duplicate merge 中都保留 first-ingest 语义
- `scripts/repair-event-ingested-at.ts` 成为历史 repair 的标准路径
- 自动 latency sample 现在会排除长 fetch gap 之后到来的 precise-clock row，并把它们记录为 `backlog catch-up`

Repair 执行：

- `pnpm events:repair-ingested-at`
- `scannedEvents = 51907`
- `updatedEvents = 1220`

修复后的 runtime baseline：

- `tradeCriticalInitialCanonicalLatencyP95Ms = 273961`
- `highValueStructuredCoveragePct = 100`
- `highValueGenericFallbackSharePct = 0`
- `highValueBacklogCatchupEventCount = 469`
- `releaseStatus = ready`

关键判断：

- backlog catch-up 继续在 diagnostics 和 runbook triage 中可见
- backlog catch-up 不允许污染 steady-state Tier A automated release gating
- coarse-clock Tier B / Tier C 继续保持 visible，但在 timestamp 质量提升前不进入分钟级自动 gate

### 2026-04-18 — Tranche 3 完成：高价值 source family 的 semantic precision 保持为绿

对 recent high-value families 的 audit 结果：

- 最近审查窗口内，高价值 `general_news / other` fallback 污染：`0`
- 最近审查窗口内，将事件容器词或媒体署名误写为 primary entity 的污染：`0`
- 最近审查窗口内，将 broad-market descriptor 误写为 canonical subject fallback 的污染：`0`

决策：

- 这轮在 latency / ingest 修正后，不需要新增 semantic code patch
- semantic hardening 继续只优先打高价值 family；长尾 source 允许保守，但绝不能污染 canonical truth

### 2026-04-18 — Tranche 4 完成：runbook 与验证闭环关闭

Runbook 更新内容：

- 明确了 precise-clock gate 与 coarse-clock visibility 的边界
- 明确 `ingested_at` 是 first canonical detection，`last_seen_at` 是 refresh marker
- 将 backlog catch-up exclusion 定义为一等 triage 与 gating 概念
- 将 `pnpm events:repair-ingested-at` 固化为标准 repair 命令

最终验证：

- `pnpm exec vitest run server/services/event-engine/slo.test.ts server/services/event-engine/quality-gates.test.ts server/database/events.test.ts`
- `pnpm events:repair-ingested-at`
- `pnpm events:ops-report -- --hours 24 --limit 20`
- `pnpm events:check-quality`
- `pnpm typecheck`
- `pnpm build`

最终状态：

- Tranche 1：green
- Tranche 2：green
- Tranche 3：green
- Tranche 4：green

### 2026-04-18 — 关闭后修正：backlog classification 改为使用持久化 poll history

后续 review 发现两类问题：

1. `raw_items` arrival gap 会把健康的 sparse precise-clock source 误判成 backlog catch-up
2. 固定 `7 天 lookback` 会让长周期 source 和长停机恢复再次失真

最终修正：

- 引入 `source_fetch_runs`
- poll 即使返回 0 item 也会落 run
- query 不再临时回溯 7 天 `raw_items` 来推 gap
- backlog 判定改为消费持久化 poll history
- legacy fallback 仅允许用于 dense exchange-disclosure family

这一步让 post-foundation tranche 的 latency gate 真正站稳。
