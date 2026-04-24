# Decisions

状态：规划中
最后更新：2026-04-25
范围：`newsnow` 系统性性能重构中已经接受的关键决策

## Product Decisions

### PD-1 只建立一个 backlog 主题

- 本次性能优化只建立一个 backlog：`20260424-newsnow-surface-performance-rearchitecture`
- 不拆成新闻线 backlog、事件线 backlog、前端 hotfix backlog 或 ops backlog
- 后续可以拆成多个 sprint，但必须归属于同一个 backlog 目标

### PD-2 目标是系统性消灭已发现的性能问题

- 本次目标不是修几个慢接口
- 本次目标是重构 `newsnow` 的 surface performance architecture
- 已发现的问题包括查询读放大、请求期重复计算、source fetch 与用户请求耦合、fan-out、ops 重型诊断、前端重复计算和 listener / timer 泄漏

### PD-3 `newsnow` 当前按双业务线治理

- 新闻业务线是一等业务线，不能被降级为附属体验
- 投资事件业务线是一等业务线，不视为唯一系统边界
- 两条业务线都必须被纳入性能方案

### PD-4 两条业务线都同时存在 user-facing 和 agent-facing surface

- 新闻业务线包含新闻前端和新闻 MCP tool
- 投资事件业务线包含事件 / watchlist 前端、provider HTTP API 和 event / watchlist MCP tools
- 性能验收必须覆盖四类 surface：
  - news user-facing
  - news agent-facing
  - investment event user-facing
  - investment event agent-facing

### PD-5 投资语义仍然由 backend event engine 负责

- 本 backlog 不改变 AGENTS.md 中的 backend truth 规则
- frontend、MCP、prompt formatter 和 downstream agent 不能重新计算投资语义
- 性能优化不能用牺牲证据链、审计性或 backend-owned semantics 的方式达成

### PD-6 两条业务线必须面向未来可拆分系统解耦

- 新闻业务线和投资事件业务线必须按未来可拆成两套独立系统来设计
- 允许短期共享 source runtime、runtime hosting、database hosting、observability 和 adapter 基础设施
- 不允许共享业务 query model、业务语义、热路径、frontend 状态模型或 agent response 语义
- 任何共享基础设施都必须通过中立 contract 暴露能力，不能要求某条业务线理解另一条业务线的内部模型

### PD-7 方案必须可持续执行到最终目标

- 本 backlog 不是阶段性短期优化方案
- sprint 只是执行切片，不是独立目标，也不是允许留下永久临时架构的理由
- 每个 sprint 都必须能被追溯到同一个最终目标架构和 backlog-level definition of done
- 如果某个实现只能短期缓解性能问题，但不能继续演进到最终架构，不能作为本 backlog 的正式方案

## Technical Decisions

### TD-1 性能架构必须从 shared source runtime 开始建模

- 新闻线和事件线都依赖 source config 和 source getters
- 用户请求不应长期直接承担上游 source fetch 成本
- 后续技术设计必须明确 source fetch、cache refresh、ingest、force refresh 和 agent request 的资源边界

### TD-2 新闻线需要自己的 query model

- 新闻线不能长期只依赖 source-level JSON cache blob
- 新闻前端和新闻 MCP tool 应消费稳定 source snapshot / freshness state
- 新闻线是否需要 item-level projection 仍在 technical design 中细化

### TD-3 投资事件线需要正式 online query model

- canonical event store 继续作为 backend truth
- online query model 作为 canonical truth 的受控投影
- `latest/search/entity/watchlist/detail/related` 必须收敛到同一套查询服务和索引策略
- 请求期语义补算、JSON `LIKE`、相关子查询、fan-out merge 不应继续作为热路径依赖

### TD-4 同一业务线内部的 agent-facing 与 user-facing surface 共享语义，不共享无边界热路径

- 同一业务线内部的 agent-facing 和 user-facing surface 可以共享 query service
- 它们不应绕过 query model 直接打 canonical store 或 source getter
- MCP transport 可以继续存在，但工具实现必须按业务线走明确 query service

### TD-5 Observability 必须覆盖双业务线

- 事件 ops status 只能覆盖 investment event 线，不足以作为整个 `newsnow` 的性能观测
- 后续必须补 news source cache hit ratio、source fetch latency、upstream error、refresh queue、frontend request fan-out 等指标
- ops diagnostics 不能继续无边界地压在线查询资源

### TD-6 实施可以分 sprint，但每个 sprint 都必须收敛到同一个目标架构

- sprint 可以分开做 shared runtime、news query model、event query model、frontend surface、observability
- 每个 sprint 都必须带有明确 baseline、验收指标和不破坏另一条业务线的验证

### TD-7 Query model、schema ownership 和 semantic ownership 必须按业务线分离

- News Query Model 只能依赖 shared source runtime 产出的中立 source result / source fetch state，不能依赖 investment event canonical store 或 event projection
- Investment Event Query Model 只能依赖 shared source runtime 产出的中立 source result / source fetch state 和 backend event engine 自己的 write model，不能依赖 News Snapshot Model
- observability 可以统一承载，但指标必须带 business line 维度，避免用事件线 ops status 代表整个 `newsnow`
- 当前共享 Nitro、db0 / SQLite、MCP transport 只被视为 hosting 事实；实现时必须避免跨业务线表查询、跨业务线 service import 和跨业务线 fallback

### TD-8 Sprint 实施必须采用最终架构驱动

- 每个 sprint 必须交付最终架构的一块可持续能力，而不是临时替代路径
- 可以用 shadow path、dual-read、feature flag 降低迁移风险，但它们必须有退出条件和删除边界
- 不允许把兼容层、fallback、临时 denormalized 字段、临时 adapter 当作最终架构
- backlog-level 完成标准高于单 sprint 完成标准；只有所有已发现性能问题都被最终架构吸收并验证后，本 backlog 才能关闭

### TD-9 外部技术审查发现必须进入对应 sprint gate

- Sprint 1 baseline 必须单独测量 event detail endpoint，并拆出 related-events fan-out 指标
- Sprint 2 必须修复 `/api/s/entire` / `Cache.getEntire` 的字符串拼接 SQL，改为 parameterized query 或等效安全查询
- Sprint 2 必须明确 `/api/s/entire` 的最终定位：News Query Service batch read，或只作为兼容 bulk read adapter
- Sprint 3 implementation 之前必须完成 `investment-view.ts` 函数级 write-time vs query-time 分类
- Sprint 3 的 Investment Event Query Model 设计必须同步覆盖 watchlist 和 related-events 的索引策略，即使 surface 切换安排在 Sprint 4
- 后续 sprint 设计文档必须引用适用的 `PD-*` / `TD-*` 决策编号

### TD-10 最新技术审查发现必须补入执行约束

- Sprint 1 前必须明确 investment event production 当前态与目标态差异，避免把目标链路误写成当前代码事实
- Sprint 1 必须输出四个物理形态问题的推荐方向和 trade-off：News Query Model、Investment Event Query Model、Shared Source Runtime、Observability / Ops
- Sprint 1 必须给出 `/api/s/entire` performance contract 草案，覆盖 latency budget、batch size、partial failure 和 fallback 语义
- Sprint 1 必须定义 Shared Source Runtime 调度优先级框架，至少区分 routine fetch、force refresh、backfill catch-up
- Sprint 2 起所有新增 SQL 查询必须声明访问表和 owner；跨 business line 表查询必须在设计和 PR 中显式标记
- Investment Event Query Model 必须具备 canonical truth 与 online projection 的一致性校验和 repair / fallback 策略

### TD-11 二次技术审查建议进入 sprint 约束

- `pnpm events:ops-report` 和 `pnpm events:check-quality` 已核实存在，后续继续作为事件线 baseline 和质量 gate 的固定验证入口
- Sprint 1 必须校正并确认当前 schema ownership baseline，至少覆盖现有 `cache`、event engine、raw ingest、source fetch run、watchlist 和 ops 相关表的 `table -> owner` 映射
- Sprint 3 设计必须列出 Sprint 3 与 Sprint 4 的 route / surface 收敛边界，明确哪些路由在 Sprint 3 切到 Investment Event Query Model，哪些路由只在 Sprint 3 完成 schema / index 兼容并由 Sprint 4 切换
- 不允许出现没有 owner、没有 sprint 归属、或落在 Sprint 3 / Sprint 4 之间的 investment event 查询路由

### TD-12 合并终稿残留观察进入 Sprint 1 约束

- `source_fetch_runs` 的目标 owner 是 `shared-source`，但当前 DDL、DAO、写入和 ops join 仍在 `server/database/events.ts`；Sprint 1 必须把这标记为 migration bridge，而不是最终 owner 边界
- 若 `source_fetch_runs` 继续短期保留在 event database 模块，Sprint 1 必须列出当前访问清单、cross-owner ops reads 和分离 milestone
- Sprint 1 必须给出 neutral priority class interface 的候选对比和推荐方案，不能只停留在 priority 名称定义
- neutral refresh intent 必须是 shared-source 的中立 contract；新闻线和投资事件线不能直接提交私有绝对优先级，也不能直接调用另一条业务线的 scheduler 或 hot path

### TD-13 Sprint 1 物理形态推荐

- News Query Model 采用 news-owned `source_snapshots` + `source_items` 方向，不把现有 `cache` JSON blob 扩展为最终读模型；`cache` 只允许作为兼容 fallback 和迁移桥
- Investment Event Query Model 采用 `event_projection` + `event_query_indexes` 方向，projection 只投影 canonical event truth，并必须带 canonical anchor / checksum / repair 状态
- Shared Source Runtime 先采用 in-process source runtime service + neutral refresh intent interface，接口字段必须兼容后续迁移到 persistent queue table 或 worker queue
- Observability 采用 lightweight status + diagnostics snapshot + benchmark script output 的组合；重型 diagnostics 只能通过显式入口运行，不能进入 user-facing 或 agent-facing 热路径

### TD-14 Neutral refresh intent interface 第一阶段实现

- Sprint 1 先在 `server/services/source-runtime/runtime.ts` 落地 in-process `SharedSourceRuntime`，作为 Shared Source Runtime 的第一阶段实现
- neutral refresh intent 只允许 `businessLine = news | investment-event` 和 `priorityClass = backfill_catch_up | force_refresh | routine_fetch`
- interface 必须包含或兼容 `businessLine`、`sourceId`、`sourceProfile`、`priorityClass`、`reason`、`requestedAt`、`dedupeKey`、`deadlineAt` / `ttlMs`、`maxConcurrency`、`fallbackPolicy`
- runtime 必须拒绝自定义绝对优先级和跨业务线 hot-path hint，避免新闻线和事件线直接调用彼此 scheduler
- 迁移路径是：in-process service → persistent queue table → worker / event-bus queue；接口字段不能绑定到当前进程内实现
