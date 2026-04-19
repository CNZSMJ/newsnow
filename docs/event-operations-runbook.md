# 事件运维手册

状态：使用中
最后更新：2026-04-19
范围：`events` 系统在 post-foundation 阶段的 latency remediation、repair、backfill、manual review 运维流程
文档角色：运维流程与发布验证手册
更新时机：运维命令、triage 步骤、repair 流程或验证规则变化时

相关文档：

- [docs/investment-event-foundation-roadmap.md](./investment-event-foundation-roadmap.md)
- [docs/investment-event-delivery-board.md](./investment-event-delivery-board.md)
- [docs/README.md](./README.md)

## 1. 目的

这份 runbook 定义 post-foundation 阶段 `events` 的默认运维流程。

它的职责是让 slow-source triage、semantic repair、backfill、manual review 这些动作都能在仓库内重复执行，而不是依赖临时 shell 历史或一次性 debug 经验。

## 2. 运行规则

### 2.1 Canonical truth 必须留在 backend

所有 triage、repair、backfill 动作，都必须保持 backend event engine 仍然是 canonical events、facts、evidence、entity linkage 和 investment semantics 的唯一事实源。

### 2.2 Trade-critical latency 优先级最高

Latency remediation 要优先处理那些直接影响盘中或开盘决策的 source family，再处理低频或长文档 source。

### 2.3 长尾 source 可以保守，但不能写错

长尾 source 可以比高价值 source 更保守地使用 generic fallback，但绝不能把错误的 canonical subject、entity link 或 market link 写进事件基座。

### 2.4 Runbook 必须跟代码一起演进

只要运维流程变化，就必须在同仓库、同版本控制下更新这份文档。不要把运维真相拆到仓外的独立手册里。

### 2.5 `initial canonical latency` 只能使用可信 publication clock

分钟级 latency automation 只对那些发布时间足够精确、能支撑分钟级判断的 source family 有意义。

规则：

- 如果 source 暴露了精确发布时间，就把它用于自动化 `initial canonical latency` gate
- 如果 source 只有 day-level 的发布日期，就不要让这种粗时间戳污染分钟级 release blocking
- coarse-clock source 必须继续在 diagnostics 里可见，并为未来 timestamp enrichment 保留追踪，但不能污染 Tier A automation

### 2.6 `ingested_at` 表示首次 canonical detection，不是最新 refresh

`events.ingested_at` 表示事件第一次被可信地识别进 canonical event store 的时间。
`events.last_seen_at` 表示后续轮询时再次看到它的 refresh marker。

不要在 routine refresh 时覆盖 `ingested_at`。
如果旧数据被 refresh overwrite 污染过，就在信任 latency diagnostics 之前先做 repair。

### 2.7 稳态 latency automation 必须排除 outage catch-up batch

分钟级 latency automation 测量的是稳态 pipeline 表现，而不是系统长时间停摆后重启时的 backlog catch-up。

规则：

- 如果 precise-clock source 在经历异常长的 fetch gap 后才被抓取，这批事件应标记为 `backlog catch-up`
- `backlog catch-up` 仍然要出现在 diagnostics 和 ops review 里
- `backlog catch-up` 不进入自动化 Tier A release blocking sample
- backlog 判定必须基于 source-specific fetch interval，并保留足够保守的 grace window
- backlog 判定必须基于持久化的 source poll history，而不是 `raw_items` arrival gap
- 即使某次 poll 返回 0 条，也必须记录 source fetch run；否则 sparse precise-clock source 会被误判成 outage catch-up
- 对于 `source_fetch_runs` 出现前的 legacy 历史，只允许对高密度 exchange-disclosure family 使用 `raw_items` batch-gap fallback；不要把这个 fallback 重新用于 central-bank operations、rate fixings 这类 sparse precise-clock source

这样既能保留真实运行可见性，又不会让恢复阶段的 catch-up batch 长期污染稳态 release gate。

## 3. Latency tiers

不要使用一个平的统一目标，必须按层分治。

### Tier A：Trade-critical

典型 source：

- exchange disclosures
- intraday market flashes
- central-bank operations
- rate fixings

目标：

- `initial canonical latency P95 <= 5 分钟`

### Tier B：High-value non-intraday

典型 source：

- key macro releases
- important policy notices

目标：

- `initial canonical latency P95 <= 10-15 分钟`

### Tier C：Long-form / heavy parsing

典型 source：

- 长政策通稿
- 复杂表格/深解析 source

目标：

- `initial canonical latency P95 <= 30 分钟`

### 双 latency 口径

所有 tier 都必须分开看两类 latency：

- `initial canonical latency`
- `full semantic enrichment latency`

这样可以保证：time-to-first-truth 的速度，不会被复杂 enrichment 的耗时掩盖。

## 4. 标准 triage 循环

### Step 1：先看当前运行状态

默认先跑下面 4 个入口：

- `pnpm events:ops-report -- --hours 24 --limit 20`
- `pnpm events:check-quality`
- `pnpm events:blind-review -- --hours 24 --scan-limit 20 --random 2 --high-risk 3`
- `curl http://127.0.0.1:3000/api/ops/events/status`

最低限度要看清楚：

- 当前是哪个 gate 在失败
- 哪些 source kind / source id 最慢
- 慢的是 `initial canonical latency` 还是 `full semantic enrichment latency`
- 是否已经被标记成 `backlog catch-up`
- 是否同时伴随 semantic fallback、entity precision 或 merge regression
- blind review 的高风险桶当前覆盖了哪些：`generic_fallback`、`unmapped_role`、`merge_conflict`、`new_family`、`low_confidence_llm`

### Step 2：对问题分类

把问题先分到下面几类之一：

- `latency regression`
- `publication clock issue`
- `backlog catch-up`
- `semantic fallback regression`
- `entity precision regression`
- `merge / lifecycle regression`
- `tranche-h blind review regression`
- `repair-needed historical pollution`

如果分类不清，先不要动代码。

### Step 3：决定 remediation 范围

按最小闭环处理，不要一次改太散：

- 只修单个 source family
- 或只修单类 extractor / resolver / merge 问题
- 或只修一类历史 repair 污染

不要在一次 batch 中同时重写调度、extractor、frontend 逻辑。

### Step 4：在 rollout 前验证

每个 remediation batch 至少要通过：

- 对应的 targeted test
- 必要时的 replay / shadow 相关测试
- `pnpm events:ops-report`
- `pnpm events:check-quality`
- `pnpm typecheck`
- `pnpm build`

如果质量门限是红的，视为阻断，不允许带着红灯进入下一个 batch。

## 5. Repair 与 backfill 流程

### 什么时候跑 repair

满足下面任意一条，就应该先考虑 repair：

- 历史数据已经污染 canonical latency 指标
- 历史 entity / subject / merge 脏数据会继续漏到当前 projection
- 新逻辑已经修好，但历史 store 还残留旧错误

### 什么时候跑 backfill

满足下面任意一条，就应该考虑 backfill：

- source profile / extractor 语义发生了实质升级
- 某个 source family 以前被粗分类，现在需要重新生成更深的 facts 或更准的 family
- 历史数据要重新进新 merge / impact / projection 逻辑

### 必须遵循的顺序

标准顺序：

1. 先通过 `events:ops-report` 或 ops status 诊断
2. 先补或跑 targeted tests / replay tests
3. 先做 repair，再做需要的 backfill
4. 再跑 `events:check-quality`
5. 最后再决定是否视为 tranche 关闭

### 标准 repair 命令

当前标准 repair 命令：

- `pnpm events:repair-ingested-at`

如果未来新增 repair 脚本，也要在这里补充用途和使用边界。

如果 repair / backfill 触及主体识别、最小事实集或 merge 语义，必须额外确认：

- 没有把 provisional institution 回写成伪 canonical company / security
- 没有吞掉 `merge_conflict_candidate` 或 `event_correction` timeline 节点
- blind review 与 replay fixture 在 repair 之后仍然可复现

## 6. Manual review 流程

自动化 gate 不覆盖全部质量问题，所以 sampled review 仍然必要。

最少要抽查：

- entity precision
- false merge
- missed merge
- replay consistency
- high-value fallback pollution
- Tranche H blind review 风险桶覆盖情况

建议抽样对象：

- 最近 24 小时的高价值 source family
- 本批代码实际触碰过的 source family
- diagnostics 已经暴露为慢源或歧义源的 family
- `pnpm events:blind-review` 生成的随机样本与高风险样本

Tranche H 默认抽样入口：

- `pnpm events:blind-review -- --hours 24 --scan-limit 20 --random 2 --high-risk 3`
- 高风险样本至少覆盖：`generic_fallback`、`unmapped_role`、`merge_conflict`、`new_family`、`low_confidence_llm`
- 如果命中 `merge_conflict_candidate` 或 `event_correction`，先确认是否需要 repair / backfill，再决定是否扩大抽样

Manual review 结果至少要记录：

- 抽样范围
- 抽样时间
- 发现的问题类型
- 是否需要 repair / backfill / code patch

## 7. Post-foundation tranche 的退出标准

当下面几件事都成立时，post-foundation tranche 才算真正关闭：

- quality gates 已经采用 stratified latency thresholds，而不是单一 aggregate gate
- Tier A gate 回到可控范围
- Tier B / Tier C 保持可见，但不污染 Tier A automation
- `ingested_at` / merge survivor / backlog catch-up 这些 latency 语义已经被修正
- runbook 已经成为 repo 内默认操作流程
- 验证命令能稳定跑通：
  - `pnpm events:ops-report`
  - `pnpm events:check-quality`
  - targeted tests
  - `pnpm typecheck`
  - `pnpm build`
