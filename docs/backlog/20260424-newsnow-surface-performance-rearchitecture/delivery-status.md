# Delivery Status

状态：执行中
最后更新：2026-04-25
范围：`newsnow` 双业务线系统性性能重构的实施状态、blocker、验证记录和下一步

## 1. 当前状态

- Sprint 1 已完成：Baseline 与 Shared Source Runtime 设计落地
- Sprint 2 执行中：News Snapshot Model 与新闻 Surface 收敛
- 阶段 0 已完成：文档、关键代码和现有验证命令已确认
- 已创建单一 backlog 主题
- 已完成前期代码审查和文档边界校正
- Sprint 1 Step 1.1-1.6 已完成；Sprint 1 gate 的 benchmark、SQL plan、MCP transport、frontend request-count 和 worker active / inactive 基线入口已补齐
- Sprint 1 gate 已通过：`pnpm test`、`pnpm typecheck`、`pnpm build` 均通过，本地服务已按规范重启

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

## 3. 进行中

- Sprint 2 Step 2.1：`Cache.getEntire` parameterized query 安全修复
- Sprint 2 Step 2.2：News Snapshot Model 测试与基础实现
- Sprint 2 Step 2.3：`/api/s` 常规路径收敛到 snapshot
- Sprint 2 Step 2.4：`/api/s/entire` 明确为 News Query Service batch read
- Sprint 2 Step 2.5：新闻 MCP tool 与新闻前端初步治理
- Sprint 2 Step 2.6：`source_fetch_runs` shared-source contract 与 SQL owner declaration 规则

## 4. Blockers / 风险

- 新闻 source getter 的上游 latency / error rate / cache hit ratio 尚未量化
- docs 当前生效文档偏 investment event 线，后续如果要更新顶层事实，需要单独达成共识
- 后续实现必须持续检查跨业务线 import、跨业务线 SQL join、跨业务线 fallback，避免短期共享基础设施演变成长期业务耦合
- 后续 sprint 设计必须写明它推进的最终目标模块、临时兼容路径退出条件和 backlog-level definition of done 影响
- `/api/s/entire` / `Cache.getEntire` 存在字符串拼接 SQL，Sprint 2 必须作为安全问题修复
- `investment-view.ts` 函数级 write-time vs query-time 分类尚未完成，必须作为 Sprint 3 前置条件
- SQL owner declaration 规则尚未工程化落地
- projection consistency check 尚未设计
- Sprint 3 / Sprint 4 的 route-level 切换顺序尚未在具体 sprint 设计中细化

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

尚未完成：

- query model shadow validation
- `Cache.getEntire` parameterized query 修复验证
- `investment-view.ts` write-time vs query-time 分类
- SQL owner declaration 检查机制
- projection consistency check
- Sprint 3 / Sprint 4 route-level 切换清单

## 6. 下一步

1. Sprint 2 Step 2.1：先写 `Cache.getEntire` parameterized query 测试，再修复实现
2. Sprint 2 Step 2.2：先写 News Snapshot Model CRUD / freshness / batch / fallback 测试，再实现模型
3. Sprint 2 Step 2.3-2.5：按 News Query Service 收敛 `/api/s`、`/api/s/entire`、新闻 MCP 和前端重复 refetch
4. Sprint 2 Step 2.6：建立新增 SQL owner declaration 规则
5. 在 Sprint 3 实施前完成 `investment-view.ts` write-time vs query-time 分类
6. Sprint 3 前补 projection consistency check 设计
