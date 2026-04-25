# NewsNow Surface Performance Rearchitecture Product Spec

状态：已完成；验收标准已通过最终 gate 验证
最后更新：2026-04-25
范围：`newsnow` 双业务线系统性性能优化的产品目标、范围、非目标和验收标准

## 1. 目标

本 backlog 的目标是让 `newsnow` 的两条业务线都具备稳定、可预测、可观测的 user-facing 和 agent-facing 性能。

具体目标：

- 新闻浏览体验在多 source 列流下保持快速、稳定、可刷新
- 新闻 agent-facing 调用不因 cache miss 或上游慢源变成不可预测阻塞
- 投资事件列表、搜索、主体查询、详情和 watchlist 查询具备稳定低延迟
- 投资事件 agent-facing 工具消费稳定 provider projection，而不是触发重复重型查询
- 后台 source fetch、event ingest、semantic enrichment 和 ops diagnostics 不再无边界干扰在线 surface
- frontend 不再通过重复请求、重复派生计算或资源泄漏放大后端性能问题
- 两条业务线的业务模型、查询模型和 surface contract 面向未来可拆分为两套独立系统
- 整体方案可持续执行到最终目标，不以阶段性短期优化作为完成标准

## 2. 用户价值

### 2.1 新闻用户

新闻用户需要快速扫过多个 source 和栏目，判断当前热点和时间线变化。

性能优化应带来的价值：

- 首屏 source cards 更快稳定出现
- refresh 行为可预测
- 慢源或失败源不会拖垮整个列流
- 热点和实时 source 的更新状态清楚，不需要用户反复手动刷新

### 2.2 新闻 agent 用户

agent 需要读取某个 source 的最新或最热新闻。

性能优化应带来的价值：

- 工具调用延迟稳定
- cache 状态和 freshness 语义明确
- 上游 source 慢或失败时有可审计 fallback
- 不要求 agent 自己理解 source refresh 细节

### 2.3 投资事件用户

投资事件用户需要围绕事件、主体、市场和 watchlist 快速判断投资意义。

性能优化应带来的价值：

- `/events` 筛选、搜索和加载更多响应稳定
- `/events/$eventId` 详情不被 related-events fan-out 拖慢
- `/watchlists/$watchlistId` 不再因多 seed 查询产生结构性读放大
- 页面展示的是 backend truth 的稳定投影，不因前端临时计算而出现语义偏差

### 2.4 投资事件 agent 用户

agent 需要结构化、可审计地读取事件和 watchlist。

性能优化应带来的价值：

- `event_*` 和 `watchlist_*` 工具走稳定 query model
- 返回结构与 provider contract 保持一致
- agent 不需要从 raw provider field 或 markdown 文本重建投资意义
- 工具调用不会触发不可控重型 diagnostics 或重复 fan-out

## 3. 范围

In scope：

- shared source runtime 的性能边界设计
- 新闻业务线的 query model / snapshot / freshness 设计
- 投资事件业务线的 online query model 设计
- news 和 investment event 的 agent-facing 接口性能治理
- news 和 investment event 的 user-facing frontend 性能治理
- ops / diagnostics 与在线查询路径的解耦
- 两条业务线的解耦边界、允许共享基础设施和禁止耦合项定义
- 现有性能问题的 baseline、benchmark 和验收指标设计
- 后续多 sprint 实施计划

Out of scope：

- 新增与性能无关的新闻产品功能
- 新增与性能无关的投资语义能力
- 将 investment semantics 移到 frontend、prompt、MCP formatter 或外部 agent
- 替代 `nexus-fi-mcp` 成为最终 public MCP boundary
- 重写整个 UI 视觉系统
- 在没有 baseline 的情况下宣称性能问题已经解决
- 只交付不能继续演进到最终架构的短期临时方案

## 4. 产品约束

- 新闻业务线是一等业务线，不能被方案默认忽略或降级为附属体验
- 投资事件业务线不是唯一边界，不能用它代表整个 `newsnow`
- 两条业务线必须按未来可拆分为两套独立系统来设计
- 两条业务线只允许共享中立基础设施和 contract，不能共享业务 query model、业务语义或 frontend 状态模型
- shared source runtime 可以共享，但它只能暴露 source config、source fetch state 和 normalized source result 等中立能力
- 运行时进程、database hosting、MCP transport 的短期共享不能形成长期业务耦合
- 同一业务线内部的 agent-facing 和 user-facing 可以共享语义投影，但必须避免共享无边界热路径；不同业务线之间不能共享业务语义投影
- 投资事件所有语义仍必须由 backend event engine 统一产出
- 性能优化必须保留证据链、审计性、repair 和 backfill 能力
- sprint 是执行切片，不是阶段性产品目标；任何 sprint 产物都必须能继续演进到最终目标架构

## 5. 验收标准

### 5.1 架构验收

- backlog 技术设计明确描述两条业务线和四类 surface
- shared source runtime 有明确资源边界
- 新闻线和事件线分别有明确 query model
- 新闻线 query model 不依赖投资事件 canonical store、projection 或 investment semantics
- 投资事件 query model 不依赖新闻 snapshot、news cache blob 或新闻 frontend 状态
- agent-facing 和 user-facing surface 都有稳定 contract / query service
- ops diagnostics 不再与在线查询路径无边界耦合
- 技术设计必须定义 backlog-level final target 和关闭条件，不允许只定义短期阶段性交付

### 5.2 新闻线验收

- `/api/s` 不再让常规用户请求直接承担慢上游 source fetch
- `/api/s/entire` 不再依赖不安全或不可扩展的 SQL 拼接模式；`Cache.getEntire` 必须使用 parameterized query 或等效安全查询
- `/api/s/entire` 必须有 performance contract 草案，明确 batch size、latency budget、partial failure 和 fallback 语义
- 新闻 snapshot / item 存储不能继续把 JSON blob 全文解析作为唯一读取方式，必须具备字段级索引或等效查询能力
- 新闻 front-end 列流的请求数量、cache hit、刷新行为可测量
- 新闻 MCP tool 有明确 freshness 和 fallback 语义
- 慢源或失败源不会阻塞整个新闻列流

### 5.3 投资事件线验收

- `latest/search/entity` 热路径不再依赖请求期语义补算
- topic / market / lifecycle / entity / family / focus 查询有明确索引或投影策略
- Investment Event Query Model 迁移必须有 route-level 切换清单，明确 `latest/search/entity`、detail、watchlist、related-events、provider HTTP、compatibility HTTP 和 MCP tools 的归属 sprint
- watchlist 查询不再以多 seed fan-out + JS merge 作为长期方案
- event detail related-events 不再在 route 层触发多次无边界查询
- event detail latency 必须单独量化，并能区分主详情查询和 related-events fan-out 成本
- count 与 list 不再重复执行整套重型逻辑
- online projection 与 canonical truth 必须有一致性校验；发现偏离时必须进入 repair / fallback，而不是继续服务错误投影

### 5.4 前端验收

- 新闻列流避免请求风暴和重复刷新
- 事件页和 watchlist 页的重复派生计算被收敛
- 已知 listener / timer cleanup 问题被修复
- 页面状态变化不会触发与用户意图无关的重型 refetch

### 5.5 观测验收

- 有 baseline 数据覆盖四类 surface
- 有 source fetch latency、cache hit ratio、query latency、frontend request fan-out 指标
- Shared Source Runtime 调度优先级可观测，至少区分 routine fetch、force refresh、backfill catch-up
- Shared Source Runtime 的 refresh intent 必须通过中立 priority class contract 表达，不能让某条业务线直接抢占另一条业务线的私有 hot path
- `source_fetch_runs` 这类 collection status 数据必须明确 owner 和访问边界；如果 ops 读取 shared-source 状态，必须通过声明过的 cross-owner read、diagnostics snapshot 或 shared-source read API
- worker / enrichment 运行时，在线 surface latency 不出现不可解释抖动
- ops status / diagnostics 的运行成本可控

### 5.6 最终目标验收

- 所有已发现性能问题都被最终架构中的 shared source runtime、news query model、investment event query model、surface adapter 或 observability 层吸收
- 不存在被标记为“后续再重构”的临时热路径、临时 fan-out、临时 cross-business dependency
- 所有持久化表和新增 SQL 查询都有明确 owner；跨业务线访问必须有显式迁移理由和删除边界
- schema ownership baseline 必须经过 Sprint 1 校正，后续新增表和 SQL 不能绕过 owner declaration
- 所有 shadow path、dual-read、feature flag、compatibility fallback 都有明确保留理由、退出条件和删除边界
- backlog 关闭时，两条业务线仍可独立演进，并具备未来拆成两套系统的清晰边界

## 6. 量化方式

后续 sprint 必须补齐并记录：

- news source cache hit ratio
- `/api/s` P50 / P95 latency
- `/api/s/entire` P50 / P95 latency
- news MCP tool P50 / P95 latency
- `investment-events/latest/search/entity` P50 / P95 latency
- `investment-watchlists/:id` 和 `:id/events` P50 / P95 latency
- event detail P50 / P95 latency
- event detail related-events fan-out query count、scan limit 和 latency
- `/api/s/entire` batch size、partial failure rate 和 fallback hit ratio
- projection consistency check pass / fail count
- source fetch queue depth and priority class latency
- frontend page request count per navigation
- frontend render / derived compute hotspots where measurable
- worker active / inactive 状态下的在线查询对比
