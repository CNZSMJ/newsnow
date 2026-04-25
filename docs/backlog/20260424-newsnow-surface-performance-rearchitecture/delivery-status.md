# Delivery Status

状态：执行中
最后更新：2026-04-25
范围：`newsnow` 双业务线系统性性能重构的实施状态、blocker、验证记录和下一步

## 1. 当前状态

- Sprint 1 已完成：Baseline 与 Shared Source Runtime 设计落地
- Sprint 2 已完成：News Snapshot Model 与新闻 Surface 收敛
- Sprint 3 执行中：Investment Event Query Model 主查询收敛
- 阶段 0 已完成：文档、关键代码和现有验证命令已确认
- 已创建单一 backlog 主题
- 已完成前期代码审查和文档边界校正
- Sprint 1 Step 1.1-1.6 已完成；Sprint 1 gate 的 benchmark、SQL plan、MCP transport、frontend request-count 和 worker active / inactive 基线入口已补齐
- Sprint 1 gate 已通过：`pnpm test`、`pnpm typecheck`、`pnpm build` 均通过，本地服务已按规范重启
- Sprint 2 Step 2.1-2.6 已完成；Sprint 2 code gate 已通过
- Sprint 3 Step 3.1-3.3 已完成；Step 3.4 准备补 watchlist / related-events 索引策略

## 2. 已完成内容

- 按 `docs/README.md` 读取文档治理规则
- 补读当前生效文档：
  - `docs/product-direction.md`
  - `docs/roadmap.md`
  - `docs/architecture.md`
  - `docs/api-contract.md`
  - `docs/event-operations-runbook.md`
- 确认当前性能方案必须覆盖两条业务线：
  - 新闻业务线
  - 投资事件业务线
- 确认每条业务线都有：
  - user-facing frontend surface
  - agent-facing interface
- 确认采用单一 backlog 管理，不拆多个治理主题
- 确认后续允许拆成多个 sprint 实施
- 完成 `technical-design.md` 表达准确性审查：
  - 统一当前架构图和目标架构图的箭头语义
  - 明确 source fetch state 是共享数据采集状态，不是新闻线私有状态
  - 明确 provider HTTP、compatibility HTTP 和 MCP tools 都是 surface adapter
  - 明确 `/api/watchlists` 是当前 compatibility path，目标是与 `/api/investment-watchlists` 和 MCP tools 共享 query model
- 确认两条业务线必须面向未来可拆分为两套独立系统解耦，并写入 decisions、product spec 和 technical design
- 确认本 backlog 必须是可持续执行到最终目标的实施方案，sprint 只作为执行切片，不作为阶段性短期目标
- 读取外部技术设计审查报告，并将 6 条审查建议写入 research、decisions、product spec 和 technical design
- 读取最新 `technical-design-review.md`，并将当前/目标差异、gate 优先级、验证入口、物理形态输出、SQL owner、projection 校验和 source 优先级要求写入方案
- 读取二次技术设计审查报告，核实 `pnpm events:ops-report` 与 `pnpm events:check-quality` 存在，并将 Sprint 3 / Sprint 4 路由边界、schema ownership baseline 要求写入方案
- 已在 `technical-design.md` 增加当前 schema ownership baseline 草案
- 按最新 review findings 修正 `technical-design.md`：拆分 `/api/watchlists` metadata 与 event-read 路径、补齐 Sprint 3 planned owner baseline、修正 rollback surface group 表述
- 读取合并终稿 `technical-design-review.md`，将 `source_fetch_runs` owner 张力和 neutral priority class interface 候选要求写入方案
- 按 Sprint 执行提示词完成阶段 0 阅读：当前生效文档、backlog 五件套、技术审查记录和关键代码文件
- 确认现有验证命令可运行：`pnpm typecheck`、`pnpm build`、`pnpm test`、`pnpm events:ops-report`、`pnpm events:check-quality`
- Sprint 2 Step 2.1 完成 `Cache.getEntire` parameterized query 安全修复：空输入直接返回空数组，source ids 使用 `IN (?,...)` 参数绑定，不再拼接 SQL fragment
- Sprint 2 Step 2.2 完成 News Snapshot Model 基础实现：新增 `source_snapshots` 与 `source_items` read model，支持 source snapshot CRUD、fresh / stale / failed / missing 状态、batch read 和失败后 stale fallback item 保留
- Sprint 2 Step 2.3 完成 `/api/s` 路由收敛：常规请求优先读取 News Snapshot Model，stale / failed snapshot 走 stale response + neutral refresh intent，`latest` 只保留为受控 force refresh 兼容路径
- Sprint 2 Step 2.4 完成 `/api/s/entire` 定位收敛：该路由现在是 News Query Service batch read adapter，不再直接绕过 News Snapshot Model 读取 `cache` blob；`cache` 只作为 migration fallback
- Sprint 2 Step 2.5 完成新闻 MCP 初步收敛：`get_hotest_latest_news` 改为通过 News Query Service 读取，并返回 `structuredContent`
- Sprint 2 Step 2.5 完成新闻前端初步治理：首页 `useEntireQuery` 批量结果直接写入 `["source", id]` query cache，卡片单源 query 在 preload pending 时不再重复发起 `GET /api/s?id=...`
- Sprint 2 Step 2.6 完成 `source_fetch_runs` shared-source contract 第一阶段分离：新增 `SourceFetchRunsTable`，`EventTable` 仅保留 migration bridge 委托，不再内联维护该表的 DDL / DAO
- Sprint 2 Step 2.6 完成 SQL owner declaration 工程化规则：新增 `sql-ownership` baseline / declaration / assertion，新增 `source_snapshots`、`source_items`、`source_fetch_runs` 访问声明和测试
- Sprint 3 前置条件完成第一步：新增 `investment-view-classification`，按函数级别声明 `investment-view.ts` 当前 exported helpers 的 write-time / query-time / presentation 分类和目标 projection contract
- Sprint 3 Step 3.1 完成 projection / index schema 第一阶段：新增 `event_projection` 与 `event_query_indexes` DAO，覆盖 latest / search / entity / watchlist / detail / related 六类目标 index name
- Sprint 3 Step 3.2 完成 canonical -> projection 写入管线：新增 `projection-pipeline`，从 canonical `EventDetail` 调用 backend-owned investment projection helper 写入 `event_projection` 与 query indexes
- Sprint 3 Step 3.2 完成 projection consistency check：以 canonical detail 的 deterministic checksum 判定 `missing` / `stale` / `ok`
- Sprint 3 Step 3.2 完成事件生产链路挂接：`persistResolvedEvent` 在 canonical event transaction 完成后刷新 Investment Event Projection
- Sprint 3 Step 3.3 完成 Investment Query Service：latest/search/entity 读取 `EventProjectionTable`，返回 backend-owned `InvestmentEventBrief`
- Sprint 3 Step 3.3 完成 provider 主查询切换：`/api/investment-events/latest`、`/api/investment-events/search`、`/api/investment-events/entity` 已改为消费 Investment Query Service
- Sprint 3 Step 3.3 完成 projection migration backfill 入口：新增 `pnpm events:backfill-projections`，用于把已有 canonical events 补齐到 `event_projection`
- Sprint 3 Step 3.3 完成 shadow validation helper：新增 projection query result 与 legacy canonical query result 的 ID drift comparator

## 3. 进行中

- Sprint 3 Step 3.4：Watchlist / related-events 索引策略

## 4. Blockers / 风险

- 新闻 source getter 的上游 latency / error rate / cache hit ratio 尚未量化
- docs 当前生效文档偏 investment event 线，后续如果要更新顶层事实，需要单独达成共识
- 后续实现必须持续检查跨业务线 import、跨业务线 SQL join、跨业务线 fallback，避免短期共享基础设施演变成长期业务耦合
- 后续 sprint 设计必须写明它推进的最终目标模块、临时兼容路径退出条件和 backlog-level definition of done 影响
- SQL owner declaration 已对 Sprint 2 新增 news / shared-source SQL 落地；Sprint 3 起必须扩展到 event projection / query indexes / watchlist match / related-events query model
- Sprint 4 的 detail / watchlist / related-events route-level 切换顺序仍需在具体 sprint 实施中细化
- 额外运行 `pnpm events:check-quality` 当前失败，blocker 是既有 Tier A 初始 canonical 延迟 P95 24,023,959ms > 300,000ms；这不是 Sprint 2 code gate 项，但必须在后续事件线性能 sprint 中处理

## 5. 验证记录

当前已完成：

- 文档治理规则确认
- 双业务线入口代码审查
- investment event 线已知瓶颈代码审查
- news 线结构性风险代码审查
- shared runtime / database / MCP 共享路径审查
- `technical-design.md` 图例、分层、adapter 边界、生产链路、消费链路一致性审查
- 双业务线解耦矩阵已补入 `technical-design.md`
- 最终目标定义和 backlog-level definition of done 已补入 `technical-design.md`
- 外部技术设计审查建议已纳入 sprint gate
- 最新 technical design review 的 Sprint 1 前置修正已纳入 `technical-design.md`
- 二次技术设计审查建议已纳入 sprint 约束
- 已核实 `pnpm events:ops-report` 和 `pnpm events:check-quality` 存在于 `package.json`，对应脚本文件存在
- schema ownership baseline 草案已补入 `technical-design.md`
- 最新 3 条 technical design review findings 已纳入 `technical-design.md`
- 合并终稿 2 条残留观察已纳入 `technical-design.md` 和 `decisions.md`
- 阶段 0 验证：`pnpm typecheck` 通过
- 阶段 0 验证：`pnpm build` 通过；存在既有 duplicate import / chunk size / Browserslist 警告
- 阶段 0 验证：`pnpm test` 通过，28 个 test files / 238 tests
- 阶段 0 验证：`pnpm events:ops-report` 可运行，当前事件质量样本中 Tier A latency 因 backlog catch-up 被排除，latency sample count 为 0
- 阶段 0 验证：`pnpm events:check-quality` 可运行，release status 为 `insufficient_data`，无 blocking failure
- 阶段 0 验证：`./scripts/service.sh status` 显示本地服务通过 launchd 运行
- Sprint 1 Step 1.1 完成 benchmark 验证框架：新增 `server/services/performance/surface-baseline.ts` 与测试，覆盖 P50/P95 汇总、四类 surface 覆盖校验、worker state 分组和 event detail fan-out breakdown
- Sprint 1 Step 1.1 完成可执行入口：新增 `pnpm perf:surface-baseline`
- Sprint 1 Step 1.1 baseline 结果：四类 surface 覆盖通过；`news_user` P50 16.23ms / P95 323.28ms，`news_agent` P50/P95 2.74ms，`investment_user` P50 109.01ms / P95 379.07ms，`investment_agent` P50 16.96ms / P95 102.50ms
- Sprint 1 Step 1.1 event detail fan-out baseline：样本事件 `evt_b86a60db4f4dbcfdd29de79c074dc553`，HTTP detail 109.01ms，main detail query 7.08ms，related-events fan-out 176.47ms，related query count 4，scanLimit 120
- Sprint 1 Step 1.1 worker 对照口径：首轮样本全部在 worker `active` 状态下采集；后续已通过同一命令在受控 worker inactive 服务窗口补齐对照样本
- Sprint 1 Step 1.2 完成 active DB schema 校正：`cache`、`raw_items`、`source_fetch_runs`、`events`、`event_evidence`、`event_sources`、`event_facts`、`event_timeline`、`event_metrics`、`entity_links`、`watchlists` 11 张表已映射 owner
- Sprint 1 Step 1.2 完成 `source_fetch_runs` owner 张力处理清单：当前 DDL / indexes / writes / reads 仍在 `server/database/events.ts`，标记为 `shared-source` target owner 下的 migration bridge
- Sprint 1 Step 1.2 完成 cross-owner 标记：`getQualitySnapshot()` 与 `getOperationalLatencyDiagnostics()` 中的 `LEFT JOIN source_fetch_runs` 标记为 `cross-owner: ops reads shared-source collection status`
- Sprint 1 Step 1.3 完成四个物理形态推荐：News Query Model 采用 `source_snapshots` + `source_items`；Investment Event Query Model 采用 `event_projection` + `event_query_indexes`；Shared Source Runtime 先采用 in-process neutral refresh intent interface；Observability 采用 benchmark output + lightweight status + diagnostics snapshot
- Sprint 1 Step 1.4 完成 `/api/s/entire` performance contract 草案：soft limit 80 sources、hard limit 160 sources、snapshot hit P50 <= 50ms / P95 <= 150ms、hard batch P95 <= 250ms、partial failure 不同步触发 getter、stale snapshot 以 `cache` fallback 返回
- Sprint 1 Step 1.5 / 1.6 完成 in-process Shared Source Runtime foundation：`server/services/source-runtime/runtime.ts` 支持 `backfill_catch_up` / `force_refresh` / `routine_fetch` 排序、dedupe、max concurrency、fresh/stale/refreshing/failed 状态和 neutral interface 隔离
- Sprint 1 Step 1.5 / 1.6 完成测试：`server/services/source-runtime/runtime.test.ts` 覆盖 priority、同 physical source 跨业务线 dedupe、concurrency、source fetch state、非法 priority 和跨业务线 hot-path hint 拒绝
- Sprint 1 Step 1.6 完成 neutral priority class interface 候选对比和推荐方案：推荐 in-process service first，保留 persistent queue table 与 event-bus / worker queue 迁移路径
- Sprint 1 gate 完成 SQL query plan 脚本化入口：新增 `pnpm perf:query-plans`，覆盖 news cache、investment latest/search/entity 和 shared-source `source_fetch_runs`
- Sprint 1 query plan 结果：news cache single / batch 命中 `sqlite_autoindex_cache_1`；investment latest/search 扫 `idx_events_recency_anchor`；entity lookup 扫 `idx_entity_links_unique`；`source_fetch_runs` 命中 `idx_source_fetch_runs_source_fetched`
- Sprint 1 gate 完成 actual MCP transport smoke：新增 `pnpm perf:mcp-smoke`，真实连接 `POST /api/mcp` Streamable HTTP；`get_hotest_latest_news` 成功 13.53ms，`event_get_latest_events` 成功 129.6ms
- Sprint 1 gate 完成 frontend request-count 基线：DevTools navigation capture 覆盖 `/`、`/events`、`/watchlists`、`/events/:eventId`；本地 API 请求数分别为 6、3、2、3
- Sprint 1 frontend request-count 发现：新闻首页为 `POST /api/s/entire` 后追加 4 次 `GET /api/s?id=...`；事件列表和事件详情都会额外读取 `/api/watchlists` metadata；空 watchlist 列表只读 `/api/watchlists`，不应并入 event query model
- Sprint 1 gate 完成 worker inactive 对照 benchmark：通过临时 `EVENT_BUS_WORKER=false` 受控服务窗口采集，采样后已恢复 worker enabled；inactive 样本四类 surface 覆盖通过
- Sprint 1 worker inactive 结果：`news_user` P50 4.45ms / P95 4.6ms，`news_agent` 0.83ms，`investment_user` P50 60.11ms / P95 137.27ms，`investment_agent` P50 16.67ms / P95 70.42ms
- Sprint 1 服务恢复验证：`.env.server` 已移除临时 `EVENT_BUS_WORKER=false`，`./scripts/service.sh restart` 后 `/api/ops/events/status?diagnosticLimit=1` 返回 `worker.enabled=true`
- Sprint 1 收尾验证：`pnpm test` 通过，31 个 test files / 250 tests
- Sprint 1 收尾验证：`pnpm typecheck` 通过
- Sprint 1 收尾验证：`pnpm build` 通过；仍存在既有 duplicate import、chunk size、Browserslist 和 npm config warning
- Sprint 1 收尾服务验证：build 后已通过 `./scripts/service.sh restart` 重启，`./scripts/service.sh status` 显示 launchd 服务运行中
- Sprint 2 Step 2.1 TDD red：`server/database/cache.test.ts` 新增空输入与 SQL fragment 防御测试后，旧 `Cache.getEntire` 对空数组抛 `SQLITE_ERROR`，恶意 source id 可读出 `safe-source`
- Sprint 2 Step 2.1 TDD green：`Cache.getEntire` 改为参数化 `IN (?,...)` 后，`pnpm test -- server/database/cache.test.ts` 通过，32 个 test files / 253 tests
- Sprint 2 Step 2.1 类型验证：`pnpm typecheck` 通过
- Sprint 2 Step 2.2 TDD red：新增 `server/database/news-snapshots.test.ts` 后，缺失 `#/database/news-snapshots` 模块导致测试失败
- Sprint 2 Step 2.2 TDD green：实现 `NewsSnapshotTable` 后，`pnpm test -- server/database/news-snapshots.test.ts` 通过，33 个 test files / 257 tests
- Sprint 2 Step 2.2 类型验证：`pnpm typecheck` 通过
- Sprint 2 Step 2.3-2.5 TDD red：新增 `server/services/news-query/service.test.ts` 后缺失 `./service` 模块；新增 `server/mcp/news-tools.test.ts` 后缺失 `./news-tools` 模块
- Sprint 2 Step 2.3-2.5 TDD green：实现 `NewsQueryService`、News Query Service factory、新闻 MCP helper 和路由 adapter 后，`pnpm test -- server/mcp/news-tools.test.ts server/services/news-query/service.test.ts server/database/news-snapshots.test.ts server/database/cache.test.ts` 通过，35 个 test files / 264 tests
- Sprint 2 Step 2.3-2.5 类型验证：`pnpm typecheck` 通过
- Sprint 2 Step 2.3-2.5 build 验证：`pnpm build` 通过；仍存在既有 duplicate import、chunk size、Browserslist 和 npm config warning
- Sprint 2 Step 2.3-2.5 服务验证：`./scripts/service.sh restart` 后 launchd 服务运行，pid 75239
- Sprint 2 Step 2.3-2.5 live API smoke：`GET /api/s?id=wallstreetcn-quick` 返回 200 / `cache` / 30 items；`POST /api/s/entire` 三源 batch 返回 200 / 3 rows / 全部 `cache`
- Sprint 2 Step 2.5 actual MCP transport smoke：`pnpm perf:mcp-smoke` 通过；`get_hotest_latest_news` 10.12ms，`hasStructuredContent=true`；`event_get_latest_events` 675.4ms，`hasStructuredContent=true`
- Sprint 2 Step 2.5 frontend request-count 复测：首页导航总请求 28，本地 API 请求 2 个：`/api/enable-login` 与 `POST /api/s/entire`；基线中的 4 个重复 `GET /api/s?id=...` 已消除
- Sprint 2 Step 2.3-2.5 surface benchmark：`pnpm perf:surface-baseline -- --iterations 1` 四类 surface 覆盖通过；`news_user` P50 23.77ms / P95 63.88ms，`news_agent` 1.42ms，`investment_user` P50 18.84ms / P95 137.37ms，`investment_agent` P50 10.14ms / P95 83.48ms
- Sprint 2 Step 2.6 TDD red：新增 `server/database/sql-ownership.test.ts` 与 `server/database/source-fetch-runs.test.ts` 后缺失 `#/database/sql-ownership` 和 `#/database/source-fetch-runs` 模块
- Sprint 2 Step 2.6 TDD green：实现 `sql-ownership`、`SourceFetchRunsTable`、News Snapshot SQL declarations，并将 `EventTable` 的 `source_fetch_runs` DDL / DAO 委托到 shared-source contract 后，`pnpm test -- server/database/sql-ownership.test.ts server/database/source-fetch-runs.test.ts server/database/news-snapshots.test.ts server/database/events.test.ts server/services/performance/sql-plan.test.ts` 通过，37 个 test files / 270 tests
- Sprint 2 gate：`pnpm test` 通过，37 个 test files / 270 tests
- Sprint 2 gate：`pnpm typecheck` 通过
- Sprint 2 gate：`pnpm build` 通过；仍存在既有 duplicate import、chunk size、Browserslist 和 npm config warning
- Sprint 2 gate：build 后通过 `./scripts/service.sh restart` 重启，`./scripts/service.sh status` 显示 launchd 服务运行中，pid 11192
- Sprint 2 gate：`pnpm perf:mcp-smoke` 通过；`get_hotest_latest_news` 13.82ms，`hasStructuredContent=true`；`event_get_latest_events` 694.32ms，`hasStructuredContent=true`
- Sprint 2 gate：`pnpm perf:surface-baseline -- --iterations 1` 四类 surface 覆盖通过；`news_user` P50 3.51ms / P95 5.2ms，`news_agent` 3.03ms，`investment_user` P50 19.19ms / P95 144.01ms，`investment_agent` P50 8.89ms / P95 16.49ms
- Sprint 2 gate：`pnpm perf:query-plans` 通过；`source_fetch_runs` 仍命中 `idx_source_fetch_runs_source_fetched`
- Sprint 2 额外事件线检查：`pnpm events:ops-report` 通过；`pnpm events:check-quality` 失败，release blocker 为既有 `tradeCriticalInitialCanonicalLatencyP95Ms`
- Sprint 3 前置 TDD red：新增 `server/services/event-engine/investment-view-classification.test.ts` 后缺失 `./investment-view-classification` 模块
- Sprint 3 前置 TDD green：实现 `investment-view-classification` 后，`pnpm test -- server/services/event-engine/investment-view-classification.test.ts` 通过，38 个 test files / 272 tests
- Sprint 3 Step 3.1 TDD red：新增 `server/database/event-projections.test.ts` 后缺失 `#/database/event-projections` 模块
- Sprint 3 Step 3.1 TDD green：实现 `EventProjectionTable`、`event_projection` / `event_query_indexes` schema、SQL owner declarations 和 index read/write 后，`pnpm test -- server/database/event-projections.test.ts` 通过，39 个 test files / 274 tests
- Sprint 3 Step 3.1 类型验证：`pnpm typecheck` 通过
- Sprint 3 Step 3.2 TDD red：新增 `server/services/event-engine/projection-pipeline.test.ts` 后缺失 `#/services/event-engine/projection-pipeline` 模块
- Sprint 3 Step 3.2 TDD green：实现 `projection-pipeline` 后，`pnpm test -- server/services/event-engine/projection-pipeline.test.ts` 通过，40 个 test files / 277 tests
- Sprint 3 Step 3.2 集成验证：`pnpm test -- server/services/event-engine/projection-pipeline.test.ts server/database/event-projections.test.ts server/services/event-engine/replay.test.ts` 通过，40 个 test files / 277 tests
- Sprint 3 Step 3.2 类型验证：`pnpm typecheck` 通过
- Sprint 3 Step 3.2 build 验证：`pnpm build` 通过；仍存在既有 duplicate import、chunk size、Browserslist 和 npm config warning
- Sprint 3 Step 3.3 TDD red：新增 `server/services/investment-query/service.test.ts` 后缺失 `#/services/investment-query/service` 模块
- Sprint 3 Step 3.3 TDD green：实现 `InvestmentQueryService`、`EventProjectionTable.listProjections/countProjections` 和 route 切换后，`pnpm test -- server/services/investment-query/service.test.ts server/database/event-projections.test.ts server/services/event-engine/projection-pipeline.test.ts` 通过，41 个 test files / 280 tests
- Sprint 3 Step 3.3 migration 验证：`pnpm events:backfill-projections --limit 400` 成功，扫描 400，写入 400，缺失 canonical 0
- Sprint 3 Step 3.3 类型验证：`pnpm typecheck` 通过
- Sprint 3 Step 3.3 build 验证：`pnpm build` 通过；仍存在既有 duplicate import、chunk size、Browserslist 和 npm config warning
- Sprint 3 Step 3.3 服务验证：`./scripts/service.sh restart` 后 launchd 服务运行，监听 `http://[::]:3000`
- Sprint 3 Step 3.3 live API smoke：`GET /api/investment-events/latest?limit=5` 返回 5 items / totalCount 446；`GET /api/investment-events/search?q=AI&limit=3` 返回 3 items / totalCount 43；`GET /api/investment-events/entity?entity=贵州茅台&limit=3` 返回 1 item / totalCount 1
- Sprint 3 Step 3.3 shadow helper 验证：`pnpm test -- server/services/investment-query/service.test.ts server/services/investment-query/shadow.test.ts server/database/event-projections.test.ts server/services/event-engine/projection-pipeline.test.ts` 通过，42 个 test files / 283 tests
- Sprint 3 Step 3.3 shadow helper 类型验证：`pnpm typecheck` 通过

尚未完成：

- Sprint 3 gate 的 live-data shadow comparison 汇总
- Sprint 3 / Sprint 4 route-level 切换清单

## 6. 下一步

1. 提交 Sprint 3 Step 3.3 Investment Query Service 与 route 切换，保持 `data.db` 等无关本地文件不入库
2. Sprint 3 Step 3.4：补 watchlist / related-events 索引策略测试
3. Sprint 3 gate：运行完整 code gate、事件线质量 gate 与性能 baseline 对比
4. Sprint 4：继续切换 detail / watchlist / related-events / MCP read tools
