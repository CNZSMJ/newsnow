# 投资事件执行看板

状态：执行中
最后更新：2026-04-19
范围：投资事件系统升级的项目管理视图
文档角色：当前执行面
更新时机：当前 tranche、里程碑状态或近期执行重点发生变化时

相关文档：

- [docs/investment-event-foundation-roadmap.md](./investment-event-foundation-roadmap.md)
- [docs/iterations/README.md](./iterations/README.md)
- [docs/README.md](./README.md)

## 1. 总原则

这份 board 的存在，是为了持续对齐一个架构原则：

> backend event engine 是唯一的事实源，也是唯一的投资语义源
> frontend investor view 和 agent-facing interface 都只是同一事实的 projection

任何任务都不允许把业务语义挪到 frontend 或 agent 包装层里。

这份 board 只维护当前执行面和近期里程碑。
它不是长期 backlog，也不是某一轮迭代的 `PRD` / `TD` / `Tracking` 容器。

如果某轮工作已经进入正式实施，应在：

- [docs/iterations/README.md](./iterations/README.md)

定义的迭代文档包中维护该轮的产品设计、技术设计和执行跟踪。

## 2. 工作流状态快照

| 工作流 | 当前阶段 | 状态 | 已经成立的事实 | 下一里程碑 |
| --- | --- | --- | --- | --- |
| Backend unified engine | post-foundation tranche 与 Tranche H 已关闭；当前进入后续 semantic precision hardening | Active | canonical events、facts、evidence、impact、replay、shadow、observability、investment projection、series scan semantics、quality gates、分层 latency gates、基于 poll history 的 backlog 判定、ops triage surface、Tranche H scorecard、blind review、subject arbitration、minimal fact template、merge conflict/correction guard 都已经到位 | 继续在高价值 source family 上提升 precision / depth，同时用 blind review、replay 与 runbook 守住已关闭 tranche |
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

### Tranche H：把“发生了什么事”做到 95 分（已完成）

目标：

- 让系统对事件本身的表达达到投资可依赖水平，也就是用户看到一条事件时，基本不用回原文，就能确信系统对“到底发生了什么”说对了

范围：

- 只覆盖“发生了什么事”这一层
- 不扩 thesis、订阅、告警、组合管理
- 不提前展开“为什么发生 / 现在怎么做 / 接下来还要看什么”的新能力建设

95 分门限：

- `wrong merge rate <= 1%`
- `missed merge rate <= 2%`
- `primary subject precision >= 98%`
- `false tradable subject rate <= 1%`
- `event family precision >= 97%`
- `high-value generic fallback share <= 2%`
- `structured fact coverage >= 90%`
- `key fact completeness >= 85%`
- `evidence-linked fact rate >= 95%`
- `timeline noise ratio <= 5%`

执行顺序：

1. 先定样本、goldens、replay fixtures 和 scorecard
2. 先打主体识别 / 后续跟踪对象 / `primarySubject` 这条高杠杆链路
3. 再打 `eventFamily / eventSubType / 最小事实集`
4. 最后收 merge / timeline / repair

Sprint 0：基线、样本和门限

- [x] 建立“发生了什么事”专项 scorecard，并挂进 quality review 流程
- [x] 为高价值 source family 建立专项 goldens、sample review 集和 replay fixtures
- [x] 将错误拆成统一标签：wrong merge、missed merge、伪主体、伪标的、family 错分、最小事实缺失、timeline 噪音

Sprint 1：主体识别与后续跟踪对象重构

- [x] 重构 `primarySubject / affectedEntities / whoIsAffected` 生成链路
- [x] 引入“LLM 理解角色 + TDX / entity registry 验实体 + backend 裁决输出”的主体识别模式
- [x] 禁止 `primary-entity-fallback` 直接进入 investor-facing `affectedEntities`
- [x] 为 `market_move / policy / announcement / industry_data` 建立 family-specific subject policy
- [x] 将“标题概括句、事件壳词、情绪描述、媒体署名”列为显式非实体

Sprint 2：事件类型与最小事实集

- [x] 提高高价值 source family 的 `eventFamily / eventSubType` 精度
- [x] 为公告、政策、宏观、市场异动建立最小事实集模板
- [x] 确保 detail 默认能回答“谁、对谁、做了什么、关键数值/时间是什么”

Sprint 3：事件身份与时间语义收口

- [x] 继续压 `wrong merge / missed merge / series-vs-lifecycle` 错误
- [x] 继续清理重复首次识别、重复确认、维护性刷新污染
- [x] 将 repair、backfill、sample review 固化进 runbook

实现方案：

总体实现原则：

- 不再让标题 heuristics 直接产出 investor-facing `affectedEntities`
- `LLM` 负责识别文本里的语义角色，不直接写 canonical entity truth
- `TDX / entity registry` 负责验证证券、公司、机构、行业、市场等可落地对象
- backend 最终裁决哪些对象可以进入 `primarySubject / affectedEntities / whoIsAffected`
- 所有新逻辑都必须遵守 roadmap 的 bounded LLM 规则：`schema constrained`、`evidence linked`、`confidence bounded`、`deterministic fallback`
- 必须区分 `verified entities` 与 `high-confidence unmapped roles`，不能让未映射主体污染 canonical entity truth，也不能因为暂时没映射就从事件语义里消失
- 必须区分 `initial canonical path` 与 `semantic enrichment path`；任何 LLM / TDX 增强都不能阻塞 Tier A 的初始 canonical 入库

Sprint 0 的实现设计：

- 在 `server/services/event-engine/quality-gates.ts`、`slo.ts` 或相邻质量快照路径中增加“发生了什么事”专项 scorecard 输出
- 建立一组高价值 source family goldens，覆盖公告、政策、宏观、市场异动、媒体快讯
- 在 `server/services/event-engine/replay.test.ts` 之外增加或扩展专项 fixture，使下列错误能单独统计：
  - wrong merge
  - missed merge
  - 伪主体
  - 伪标的
  - family 错分
  - 最小事实缺失
  - timeline 噪音
- 所有后续 sprint 都只能在这套 scorecard 与 replay 基线之上推进
- 增加日常在线盲测机制，而不是只依赖静态 goldens：
  - 每日固定抽样线上新事件进入 review 队列
  - 样本必须同时覆盖随机样本与高风险样本
  - 高风险样本至少包括：`generic fallback`、`unmapped roles`、`merge conflict`、`新 family`、`低置信 LLM 输出`
- 在线盲测结果必须反哺 scorecard 与 goldens，避免测试集老化后出现“测试全绿、线上失真”

Sprint 1 的实现设计：主体识别与后续跟踪对象重构

- 重点模块：
  - `server/services/event-engine/resolver.ts`
  - `server/services/event-engine/text.ts`
  - `server/services/event-engine/entity.ts`
  - `server/services/event-engine/entity-registry.ts`
  - `server/services/event-engine/investment-view.ts`
- 新增一层 backend-owned 角色抽取逻辑，建议以独立 service 承载，例如 `subject-resolution.ts` 或 `entity-role-extraction.ts`
- 新角色模型至少要区分：
  - `eventPhrase`
  - `explicitCompanies`
  - `explicitTickers`
  - `institutions`
  - `industries`
  - `markets`
  - `nonEntityPhrases`
  - `causalDrivers`
- `LLM` 只负责输出上述角色槽位，不能直接输出 canonical company/security 结果
- `TDX / entity registry` 只对明确候选做 grounding，成功后才允许进入 canonical entity truth
- 对于高置信角色但暂未映射的组织/机构/主体，引入 `high-confidence unmapped role` 过渡态：
  - 允许以 provisional institution / provisional subject 进入 backend-owned 投影层
  - 不允许直接写成 canonical company/security
  - 必须生成一条待审核的 registry candidate，供后续人工或异步流程补齐映射
- `primary-entity-fallback` 不再允许直接进入 investor-facing `affectedEntities`
- 对下列 family 建立不同的主体裁决规则：
  - `market_move`：优先 `market / industry / explicit security`，禁止标题概括句落成 company
  - `policy`：优先 `institution / market`
  - `announcement`：优先 `security / issuer`
  - `industry_data`：优先 `industry`，没有显式公司时不强造公司主体
- 显式把这些短语列入非实体：
  - 新闻概括句
  - 事件容器词
  - 情绪描述
  - 媒体署名
  - “量价齐升 / 全球爆单 / 集体走高”类摘要短语
- 架构要求：
  - 主体角色抽取与最小事实集提取优先考虑单次 schema 约束交互，避免多轮串行 LLM 往返
  - `initial canonical path` 只允许使用有严格 timeout 的增强步骤
  - 一旦 LLM / TDX 超时或失败，必须立即回退到 deterministic path，并在后续 enrichment 中补齐

Sprint 2 的实现设计：事件类型与最小事实集

- 重点模块：
  - `server/services/event-engine/profiles.ts`
  - `server/services/event-engine/resolver.ts`
  - `server/services/event-engine/extractors/*`
  - `server/services/event-engine/impact.ts`
  - `server/services/event-engine/investment-view.ts`
- 为高价值 source family 建立最小事实集模板：
  - 公告：谁发起、对谁、做了什么、金额/比例/价格/时间
  - 政策：谁发布、约束对象、政策动作、执行窗口、影响市场
  - 宏观：指标名、现值、前值、方向、时间、口径
  - 市场异动：异动对象、涨跌幅、驱动线索、可验证对象
- `eventFamily / eventSubType` 的调优必须与最小事实集一起推进，避免“分类是对的但 detail 依然空心”
- `detail` 的默认阅读目标必须是：不用回原文，也能回答“谁、对谁、做了什么、关键数值/时间是什么”

Sprint 3 的实现设计：事件身份、timeline 和 repair 收口

- 重点模块：
  - `server/services/event-engine/merger.ts`
  - `server/database/events.ts`
  - `server/services/event-engine/investment-view.ts`
  - `scripts/repair-*.ts`
  - `docs/event-operations-runbook.md`
- 把主体链路改造后的新 truth 回灌到 merge、timeline 和 repair 逻辑里，避免“前面说对了、后面又被旧 merge/timeline 写脏”
- 收紧：
  - 同一事件误拆
  - 不同事件误并
  - 周期事件误并入 lifecycle
  - 重复首次识别
  - 重复确认
  - 维护性刷新污染
- 增加 `merge conflict / correction` 策略，避免新证据静默覆写已发布事件的核心身份：
  - 加性更新：允许直接并入原事件
  - 同主体、高权威纠错：以显式 `Correction / 更正` 生命周期呈现
  - 核心主体冲突、family 冲突、方向反转：禁止静默覆盖，降级成 `merge conflict candidate`
  - 明显已经不是同一事件：拆成新的 canonical event
- 对已暴露给用户的事件，任何核心主体或事件方向变化都必须在 timeline 中可见，不能只做无提示覆写
- 所有历史脏数据修复都必须提供 repo-owned repair 脚本和 runbook 步骤，不能只靠投影层遮盖

每个 sprint 的验证要求：

- 必跑 targeted `vitest`
- 必跑必要的 replay / shadow
- 必跑 `pnpm events:check-quality`
- 必跑 `pnpm events:ops-report`
- 必跑 `pnpm typecheck`
- 必跑 `pnpm build`
- 任何 sprint 如果专项 scorecard 未过子目标，不进入下一 sprint

Tranche 完成定义：

1. 上述 95 分门限全部达到或进入明确可控区间
2. 主体链路不再把摘要短语、事件容器词、媒体署名写进 canonical entity truth
3. 高价值 source family 默认能说清“谁发生了什么”
4. 新增 goldens、replay、sample review 与 repair 路径全部闭环

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
