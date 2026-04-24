# NewsNow Surface Performance Rearchitecture Research

状态：规划中
最后更新：2026-04-25
范围：`newsnow` 双业务线的系统性性能问题调研、方案背景、证据和待确认问题

## 1. 背景

本 backlog 来自一次全项目性能审查后的方向修正。

初始审查主要集中在 investment event 系统，重点发现了事件查询读放大、watchlist fan-out、详情页 related-events fan-out、请求期语义补算、worker 与在线请求争用、ops 状态接口过重、前端重复派生计算等问题。

后续讨论确认：`newsnow` 不是只有 investment event 一条业务线。当前系统至少存在两条业务线：

- 面向新闻的业务线
- 面向投资事件的业务线

两条业务线分别都有：

- user-facing frontend surface
- agent-facing interface

因此，系统性性能优化不能只围绕 investment event query model 展开。它必须覆盖整个 `newsnow` 的 surface performance architecture。

## 2. 当前业务线与 surface 盘点

### 2.1 新闻业务线

User-facing frontend：

- `/`
- `/c/$column`
- source column / card / DnD 列流

主要代码：

- `src/routes/index.tsx`
- `src/routes/c.$column.tsx`
- `src/components/column/index.tsx`
- `src/components/column/dnd.tsx`
- `src/components/column/card.tsx`
- `src/hooks/query.ts`
- `src/hooks/useAutoRefresh.ts`

HTTP API：

- `GET /api/s?id=<source_id>`
- `POST /api/s/entire`

主要代码：

- `server/api/s/index.ts`
- `server/api/s/entire.post.ts`
- `server/database/cache.ts`

Agent-facing interface：

- MCP tool `get_hotest_latest_news`

主要代码：

- `server/mcp/server.ts`

### 2.2 投资事件业务线

User-facing frontend：

- `/events`
- `/events/$eventId`
- `/watchlists`
- `/watchlists/$watchlistId`

主要代码：

- `src/routes/events.tsx`
- `src/routes/events.$eventId.tsx`
- `src/routes/watchlists.tsx`
- `src/routes/watchlists.$watchlistId.tsx`

Provider / agent-facing HTTP API：

- `GET /api/investment-events/latest`
- `GET /api/investment-events/search`
- `GET /api/investment-events/entity`
- `GET /api/investment-events/:id`
- `GET /api/investment-watchlists/:id`
- `GET /api/investment-watchlists/:id/events`
- compatibility watchlist routes under `/api/watchlists`

主要代码：

- `server/api/investment-events/*`
- `server/api/investment-watchlists/*`
- `server/api/watchlists/*`
- `server/services/event-engine/query.ts`
- `server/services/event-engine/investment-view.ts`
- `server/services/event-engine/related-events.ts`
- `server/database/events.ts`
- `server/database/watchlists.ts`

Agent-facing interface：

- MCP tools `event_scan`
- MCP tools `event_get_latest_events`
- MCP tools `event_search_events`
- MCP tools `event_get_entity_events`
- MCP tools `event_get_detail` / `event_get_event`
- MCP watchlist tools

主要代码：

- `server/mcp/server.ts`
- `server/mcp/projection.ts`

## 3. 共享基础设施

两条业务线共享的关键基础设施包括：

- source registry：`shared/sources.ts`、`shared/pre-sources.ts`
- source metadata / columns：`shared/metadata.ts`
- source getter：`server/getters.ts` 与 `server/sources/*`
- Nitro server runtime：`nitro.config.ts`
- 本地 SQLite / db0 database：`nitro.config.ts` 中的 `better-sqlite3`
- cache table：`server/database/cache.ts`
- event tables：`server/database/events.ts`
- watchlist table：`server/database/watchlists.ts`
- MCP transport：`server/api/mcp.post.ts`
- MCP server：`server/mcp/server.ts`

这意味着性能问题不能只按单接口处理。新闻 source refresh、事件 worker ingest、MCP tool 调用、前端页面请求和 ops diagnostics 会共享进程、数据库和上游 source fetch 能力。

## 4. 已发现的性能问题

### 4.1 投资事件业务线

已确认的问题：

- `listEvents` / `countEvents` 存在读放大
- 主查询依赖 JSON `LIKE`
- lifecycle 过滤和排序依赖相关子查询
- `topic` 场景存在 SQL 后的 Node 二次过滤
- 请求期存在分类、topic、impact 归一或补算
- `latest/search/entity` 路由取出事件后仍会逐条投影和过滤
- watchlist 查询通过多 seed 调用 `listEvents`，再在 JS merge / filter / sort
- watchlist detail 在部分前端交互中产生二次请求
- event detail 会同步构建 related events，并触发多次 related 查询
- ops status 会串起多套重型统计
- events / watchlists 页面存在重复派生计算
- 部分 `useMount` cleanup 误用会导致 listener / timer 泄漏

证据类型：

- 代码审查确认
- 本地 SQLite 样本计时曾显示 topic / lifecycle count 已进入可感知慢路径
- 仍需要在后续 sprint 中建立正式 benchmark baseline

### 4.2 新闻业务线

已确认的问题和风险：

- `/api/s` 在 cache miss、cache stale 或 force refresh 时，会在用户请求内直接调用 source getter
- 新闻前端会先走 `useEntireQuery` 批量读缓存，再由 card 级 `useQuery(["source", id])` 触发单 source 更新
- ultra-fast source 会按前端 interval 周期触发刷新
- cache 以 source-level JSON blob 存储，缺少 item-level snapshot / freshness state / source runtime status
- `getEntire` 当前按传入 source 列表拼接 SQL 条件，属于安全漏洞和可靠性问题，不能只作为性能重构的长期优化项处理
- news MCP tool 直接复用 `/api/s`，因此 agent-facing 调用也继承 cache miss 和上游 fetch 风险

证据类型：

- 当前阶段主要是代码结构风险确认
- 尚未完成新闻线 live endpoint 压测
- 尚未量化各 source getter 的上游 latency、error rate 和 cache hit ratio

## 5. 系统性根因

本次性能问题的核心不是某一个慢函数，而是缺少一套覆盖两条业务线的 surface performance architecture。

当前系统存在四类耦合：

- user request 与 source fetch 耦合
- canonical event write model 与在线事件查询模型耦合
- agent-facing interface 与 user-facing frontend 共享同一批未隔离的热路径
- ops diagnostics 与在线查询 / 在线数据库资源耦合

这会导致局部优化容易把瓶颈迁移到另一条业务线或另一类 surface。

## 6. 备选方案

### 6.1 只优化 investment event 查询

优点：

- 能快速缓解当前最明确的慢查询问题
- 实施边界相对集中

问题：

- 无法覆盖新闻业务线
- 无法解决 shared source runtime 的争用
- 无法定义 news agent-facing / user-facing 的性能合同
- 容易把 backlog 误写成单业务线优化

结论：不适合作为本 backlog 的整体方案。

### 6.2 分成多个 backlog 分别处理

优点：

- 每个 backlog 更小
- 单项实施看起来更轻

问题：

- 会割裂系统性根因
- 无法在统一架构下处理共享 runtime 和共享 database
- 不符合当前共识：只建立一个 backlog，目标消灭已发现的性能问题

结论：不采用。

### 6.3 建立统一 surface performance architecture

核心做法：

- 保留一个 backlog
- 承认两条业务线和四类 surface
- 抽出 shared source runtime
- 分别定义 news query model 和 investment event query model
- 统一 agent-facing 和 user-facing 的性能合同
- 将 observability 同时覆盖新闻线和投资事件线
- 后续按 sprint 分段实施

结论：采用为当前主方案。

## 7. 当前共识

- 只建立一个 backlog
- 目标是系统性消灭已发现的性能问题
- 新闻业务线是一等业务线，必须与投资事件业务线同等纳入性能目标和验收
- 不把投资事件业务线视为唯一 surface
- 不做单点补丁式治理
- 方案确认后允许拆成多个独立 sprint 逐步实施
- 每个 sprint 必须服从同一个最终目标架构，不得成为阶段性短期方案

### 7.1 2026-04-25 技术设计外部审查结论

审查文件：`/Users/huangjiahao/.gemini/antigravity/brain/95e10edb-e741-48fb-a500-ed028ec630c4/technical_design_review.md.resolved`

审查结论：

- 当前技术方案事实验证成立，可以进入 Sprint 1 落地阶段
- `/api/s/entire` 的 `getEntire` 字符串拼接 SQL 是安全漏洞，应在 Sprint 2 优先修复为 parameterized query
- Sprint 1 baseline 必须单独测量 event detail endpoint，并拆出 related-events fan-out 指标
- Sprint 3 前必须完成 `server/services/event-engine/investment-view.ts` 函数级 write-time vs query-time 分类
- Sprint 2 必须明确 `/api/s/entire` 在目标架构中的定位：收敛到 News Query Service batch read，还是保留为独立 bulk read adapter
- 后续 sprint 文档必须引用 `decisions.md` 的 `PD-*` / `TD-*` 编号，保证实现追溯到已接受决策
- Sprint 3 设计 Investment Event Query Model 时必须同步考虑 watchlist 和 related-events 的索引策略，即使 surface 切换延后到 Sprint 4

### 7.2 2026-04-25 最新技术设计审查结论

审查文件：`docs/backlog/20260424-newsnow-surface-performance-rearchitecture/technical-design-review.md`

审查结论：

- 方案仍可进入 Sprint 1，但 Sprint 1 前必须补清 `Investment event production` 的当前态与目标态差异
- Sprint 3 gate 必须明确优先级：projection / index schema 兼容 watchlist 和 related-events 是硬性条件，read-time projection 只能作为例外
- 验证方案必须补可执行命令入口；新闻线缺少等效 benchmark / diagnostics 命令，Sprint 1 必须补齐
- Sprint 2 的 News Snapshot Model 必须具备 item-level 字段级索引能力，不能继续把 JSON blob 全文解析作为唯一读取方式
- `/api/s/entire` 需要在 Sprint 1 给出性能 contract 草案，为 Sprint 2 决定是否保留 compatibility bulk read adapter 提供依据
- Sprint 1 必须输出四个物理形态问题的推荐方向和 trade-off：News Query Model、Investment Event Query Model、Shared Source Runtime、Observability / Ops
- Sprint 2 起所有新增 SQL 查询必须声明访问表和 owner；跨 business line 表查询必须显式标记，否则 code review 退回
- Investment Event Query Model 必须补 canonical truth 与 online projection 的一致性校验机制
- Shared Source Runtime 必须在 Sprint 1 定义调度优先级框架，至少区分 routine fetch、force refresh、backfill catch-up

### 7.3 2026-04-25 二次技术设计审查结论

审查文件：`/Users/huangjiahao/.gemini/antigravity/brain/95e10edb-e741-48fb-a500-ed028ec630c4/technical_design_review.md.resolved`

审查结论：

- 首轮审查问题已全部闭环，方案可以进入 Sprint 1 执行
- `pnpm events:ops-report` 和 `pnpm events:check-quality` 需要确认真实存在；本次更新已核实二者均存在于 `package.json`，对应脚本文件也存在
- Sprint 3 / Sprint 4 的边界需要继续细化到 route / surface 清单，避免主查询收敛和 adapter 收敛之间出现责任空洞
- 技术方案已补充 schema ownership baseline 草案；Sprint 1 需要用真实 DB schema 校正并确认当前 table 到 `news`、`investment-event`、`shared-source`、`ops` owner 的基线映射

### 7.4 2026-04-25 合并终稿残留观察

审查文件：`docs/backlog/20260424-newsnow-surface-performance-rearchitecture/technical-design-review.md`

审查结论：

- 方案可以进入 Sprint 1，但 `source_fetch_runs` 存在当前代码位置与目标 owner 的张力；Sprint 1 必须把当前 `events.ts` 中的 DDL / DAO / writes / ops joins 标记为 migration bridge 或 cross-owner read，并给出分离 milestone
- `neutral priority class` 当前仍是机制名称，缺少接口候选；Sprint 1 必须比较 in-process service、persistent queue table、event-bus / worker queue 等候选，并给出推荐方案

## 8. 待确认问题

- 新闻业务线是否需要正式 provider HTTP contract，还是只保留 public news API contract
- 新闻 agent-facing 输出是否需要结构化 response，而不是当前简单 markdown link list
- news query model 的物理形态：继续使用 cache table 扩展，还是新增 source snapshot / source item table
- investment event query model 的物理形态：projection table、materialized snapshot、index table 或混合方案
- shared source runtime 是否需要独立 worker / queue，还是先在当前进程内做并发与刷新调度治理
- ops diagnostics 是否采用定期快照表，还是按 surface 拆出 lightweight status API
- 每条业务线的正式 SLO 指标和 baseline 数据采集方式
- Sprint 3 / Sprint 4 的最终 route-level 切换清单和验收顺序需要在 Sprint 3 设计中确认
- `source_fetch_runs` 从 event database module 迁移到 shared-source contract 的具体里程碑
- neutral priority class interface 的最终实现形态
