# 投资事件工作流

状态：使用中 backlog
最后更新：2026-04-19
范围：投资事件系统的长期执行工作流
文档角色：backend / frontend / agent 三条线的长期 backlog
更新时机：长期 backlog 结构或工作流优先级发生变化时

## 1. 目的

这份文档的目标，是把已经达成一致的架构，落成一份可持续推进的 backlog。

它存在的核心原因只有一个：

> backend event engine 是唯一的事实源，也是唯一的投资语义源
> frontend investor surface 和 agent interface 都只是同一事实的 projection

工作被拆成三条长期工作流：

1. backend unified event engine
2. frontend investor surface
3. agent-facing interface

如果你要看当前执行状态、当前 tranche 和近期里程碑，请优先看：

- [docs/investment-event-delivery-board.md](./investment-event-delivery-board.md)
- [docs/investment-event-foundation-roadmap.md](./investment-event-foundation-roadmap.md)
- [docs/event-operations-runbook.md](./event-operations-runbook.md)

这些工作流可以并行推进，但顺序必须保持：

- backend semantics first
- frontend investor usability second
- agent contract hardening third

## 2. 跨工作流约束

### 2.1 不允许复制业务逻辑

frontend 和 agent 层都不能自己再做一套事件分类、direction、materiality 或 tradability 逻辑。

### 2.2 facts 和 evidence 必须一直是一等公民

任何任务都不能用纯文本摘要替代 structured facts 与 evidence。

### 2.3 是否有投资价值，是唯一验收标准

每个改动都应该至少提升下面一项：

- 信号和噪音的区分度
- “发生了什么”的清晰度
- “谁受影响”的清晰度
- “现在可操作还是只能观察”的清晰度
- “接下来要确认什么”的清晰度

### 2.4 engine internals 不能成为默认用户契约

像 parser family、merge reason、lifecycle reason code 这类内部标签，可以保留给 debug，但不能成为默认的人类或 agent 契约。

## 3. Workstream A：Backend unified event engine

目标：

- 维护单一 canonical event engine
- 维护单一 canonical investment semantics layer
- 在 backend 一次性产出 facts、evidence、impact 和 event interpretation

当前基础阶段：

- Phase 1 `Semantic Baseline` 已于 2026-04-17 完成
- Phase 2 `Facts-First Depth` 已于 2026-04-17 完成
- Phase 3 `Identity and Series Model` 已于 2026-04-17 完成
- Phase 4 `Merge and Timeline Hardening` 已于 2026-04-17 完成
- Phase 5 `Query and Scan Foundation` 已于 2026-04-17 完成
- Phase 6 `Quality Gates and SLOs` 已于 2026-04-17 完成
- Phase 7 `Repair, Backfill, and Operations` 已于 2026-04-17 完成
- Foundation roadmap 已于 2026-04-17 关闭
- 第一轮 post-foundation tranche 已于 2026-04-18 关闭
- 当前 backend 主线转向：继续打高价值 source family 的 semantic precision、extractor/fact depth，以及更有决策价值的 impact semantics，同时保住已经关闭的 latency / runbook 纪律

### A1. Canonical investment projection

目标：

- 为所有消费者定义并维护单一 canonical investment projection

任务：

- 维护 `investment-view.ts`
- 维护 `InvestmentEventBrief`
- 维护 `InvestmentEventDetail`
- 维护 `InvestmentEventFact`
- 维护 `InvestmentEventEvidence`
- 维护人类可读和机器可读的 entity projection

完成标准：

- frontend 和 agent 能消费同一投影视图
- 没有消费者需要从 raw engine 字段重新拼业务语义

### A2. Source profile refinement

目标：

- 在 source 注册阶段尽量减少语义模糊

任务：

- 继续把 source kinds 拆成更有投资意义的 families
- 继续区分：
  - industry statistics
  - industry policy
  - industry news
  - industry reports
  - rumor clarification
  - market move
  - policy signal
  - disclosure signal
- 只要能更窄、更准，就继续减少粗粒度 fallback 分类

完成标准：

- 新接入的高价值 source 能带着更清晰的事件语义进入引擎
- 更少事件落进 `other` 这类泛桶

### A3. Extractor strengthening

目标：

- 提高 structured fact coverage 和 fact 质量

优先 source families：

- `pbc-*`
- `chinamoney-*`
- `cninfo-*`
- `sse-*`
- `hkexnews-*`
- 高价值行业源
- 高价值媒体澄清源

任务：

- 提高 numeric fact extraction coverage
- 提高 event fact precision
- 减少空洞或占位性质的 fact payload
- 更可靠地将 facts 映射到受影响 entity 和 market

完成标准：

- 高价值事件大多能用有意义的 structured facts 表达
- detail view 默认不再充斥大量低价值空字段

### A4. Impact engine refinement

目标：

- 让投资解释层更有决策价值

任务：

- 继续标准化：
  - `whyItMatters`
  - `tradableNow`
  - `whatToWatchNext`
  - `riskOfMisread`
- 减少模板化、泛化 summary
- 确保 summary 能反映 facts、source authority 和 event family

完成标准：

- impact interpretation 能直接回答投资者问题
- summary 不再泄露 engine internals

### A5. Entity resolution and linking

目标：

- 提升 event 与 entity/theme 的相关性质量

任务：

- 将 publisher identity 与 tradable entity identity 明确分开
- 提高 security、issuer、market、industry、institution 映射质量
- 去掉噪音型 placeholder entity 输出
- 提高 cross-market entity consistency

完成标准：

- 默认 entity 展示对投资者有意义
- watchlist 和 related-event retrieval 更准确

### A6. Merger and lifecycle refinement

目标：

- 让事件在时间维度上既稳定又可读

任务：

- 提高 same-event merge 逻辑质量
- 压缩低价值重复 lifecycle churn
- 保留真正有意义的事件演化
- 让 timeline 更像投资复盘材料，而不是 engine debug 日志

完成标准：

- timeline 低噪且易理解
- 重复、低价值的 update spam 变少

### A7. Replay, shadow, and observability

目标：

- 在持续演进中保持引擎可验证

任务：

- 维护 replay fixtures
- 扩大 shadow comparison 覆盖面
- 跟踪 extractor 与 merge 质量指标
- 跟踪 directional coverage 与 confidence distribution
- 跟踪 entity resolution success rates

完成标准：

- 大的语义改动在 rollout 前都能 replay 验证
- 质量回退不需要靠人工浏览才会发现

## 4. Workstream B：Frontend investor surface

目标：

- 让事件界面对真实 discretionary investing 有用
- 用投资者语言呈现同一份 backend 事件真相

### B1. Event list as an opportunity scanner

目标：

- 让 `/events` 成为快速识别“今天什么最值得处理”的页面

任务：

- 保持 investment-first sort 为默认排序
- 支持清晰分层：
  - actionable
  - watch
  - noise
- 提高按 market、industry、event family、direction 的过滤体验
- 清楚展示 affected markets 和 key entities

完成标准：

- 投资者能快速从列表里筛出今天最高价值的事件

### B2. Event detail as an investment analysis card

目标：

- 让详情页围绕投资决策问题组织，而不是围绕 engine 字段组织

任务：

- 让页面顶部先回答：
  1. 发生了什么
  2. 为什么重要
  3. 谁受影响
  4. 现在能不能交易
  5. 接下来要确认什么
- 默认只展示真正有意义的 fact fields
- 以可信 source 的方式展示 evidence
- 压缩或隐藏低价值 engine lifecycle 细节

完成标准：

- detail page 读起来像投资 brief，而不是 engine console

### B3. Related event navigation

目标：

- 让用户从单条事件跳转到可投资的上下文

任务：

- 增加按 entity 的 related events
- 增加按 market 的 related events
- 增加按 industry/theme 的 related events
- 在合适场景下增加 same-family navigation

完成标准：

- 用户可以从一条事件顺着跳到相关信号簇

### B4. Watchlist investor workflow

目标：

- 让 watchlist 真正服务于组合和监控工作流

任务：

- 让 watchlist hits 带着投资排序展示
- 区分：
  - new catalyst
  - new risk
  - confirmation pending
- 让 event relevance 更透明

完成标准：

- watchlist 页面帮助做决策复盘，而不是像原始 alert feed

### B5. Vocabulary hardening

目标：

- 从 investor-facing 页面中消除工程味语言

任务：

- 用投资者语言替换内部标签
- 隐藏或重命名 engine-only 术语
- 将 debug view 与默认 view 分开

完成标准：

- frontend 默认页面不再依赖 engine jargon 才能理解

## 5. Workstream C：Agent-facing interface

目标：

- 给 agent 一个稳定、可审计、结构化的投资事件契约
- 让 agent 输出建立在 backend facts 和 evidence 上

### C1. Provider-facing contract in `newsnow`

目标：

- 让 `newsnow` 成为强 provider，而不是半结构化文本源

任务：

- 将 canonical investment projection 暴露成 provider contract
- 保证 facts 和 evidence 是默认契约的一部分
- 将 debug-only 字段放到显式 debug mode 后面

完成标准：

- provider consumer 可以直接使用 `newsnow`，而不用自己解析 engine 风格的 text blob

### C2. Internal MCP projection cleanup

目标：

- 让仓库内 MCP projection 与 canonical investment contract 保持一致

任务：

- 停止依赖 ad hoc 的 summary text formatting
- 让 tool enums / schemas 和当前 event model 对齐
- 暴露结构化 investment fields
- 保留 facts 和 evidence

完成标准：

- 本地 MCP 不再只是一个 text-heavy 的 debug wrapper

### C3. Public MCP boundary through `nexus-fi-mcp`

目标：

- 保持 public agent boundary 稳定且 provider-agnostic

任务：

- 将 `newsnow` provider contract 映射成公共 `event.*` tool contract
- 避免泄露 provider-specific semantics
- 增加公共元数据与 guard semantics

完成标准：

- 技能和工作流可以消费稳定的 `event.*` contract，而不需要按 provider 分支

### C4. Agent scenario validation

目标：

- 验证这套 contract 真的能支持高价值机器工作流

优先场景：

- morning report synthesis
- watchlist scanning
- single-event attribution
- theme and industry monitoring

完成标准：

- 这些场景都能直接跑在 structured event object 上，而不是靠 prompt 侧重建事件语义

## 6. 执行顺序

默认顺序：

1. Workstream A
2. Workstream B
3. Workstream C

原因：

- backend semantics 不稳，frontend 和 agent 就一定会漂
- frontend 是最快验证“事件语义是否真有投资价值”的地方
- agent contract hardening 应该在 backend projection 稳定后推进

只有在不会制造重复业务逻辑时，才允许并行推进。

## 7. 当前 immediate backlog

下面是当前最优先的下一批任务：

1. 继续提高高价值 source family 中 `issuer / institution / market / tradable subject` 的区分精度
2. 继续加深 policy、macro、disclosure、industry 高价值 family 的 structured fact completeness
3. 提高 backend-owned 解释字段质量：
   - 为什么重要
   - 接下来要看什么
   - 容易被误读在哪里
4. 提高 mixed fast-feed 场景下的 entity / market linkage 质量，尤其是 broad market descriptor 与 tradable subject 同时出现时
5. 在扩大 precise-clock coverage 的同时，继续保持 Tier A latency 为绿色，并维持基于 poll-history 的 backlog classification
6. 对每个被修改的 source family 扩大 replay fixtures 与 targeted tests

## 8. 验收检查表

每个完成的任务都应该回答下面 6 个问题：

1. 有没有保持 backend 仍然是唯一事实源和语义源？
2. 有没有提升投资决策可用性？
3. 有没有让 facts 和 evidence 更可消费？
4. 有没有减少 engine 术语泄露？
5. 有没有减少下游 agent 的重建负担？
6. 这个改动能不能 replay、能不能观测、能不能测试？
