# Implementation Plan

状态：已完成；作为本 backlog 的 TDD 实施记录和后续 agent 恢复入口
最后更新：2026-04-26
范围：`20260424-newsnow-surface-performance-rearchitecture` 从 technical design 到 Sprint-by-Sprint TDD 执行的实施计划

## 1. 执行原则

- 从 `delivery-status.md` 恢复当前进度，避免重复执行已完成工作。
- 从 `technical-design.md` 读取目标架构、模块边界、route 边界和数据流。
- 每个 sprint 必须按 TDD red -> green -> refactor -> validation 推进。
- 每完成一个 step，必须更新 `delivery-status.md`。
- 不允许留下临时文件、临时分支状态、未说明的兼容层或未关闭的验证缺口。

## 2. Sprint Plan

### Sprint 0：文档与基线恢复

目标：

- 读取 `docs/README.md`、当前生效文档和 backlog 六件套。
- 确认单一 backlog、双业务线范围和最终 Definition of Done。
- 初始化执行状态和验证入口。

TDD / 验证：

- Red：确认缺少可执行 baseline 或验证入口时，不进入实现。
- Green：确认 `pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm events:ops-report`、`pnpm events:check-quality` 可运行。
- Validation：记录到 `delivery-status.md`。

状态：已完成。

### Sprint 1：Baseline 与 Shared Source Runtime Foundation

目标：

- 建立 surface benchmark、SQL query plan、MCP transport smoke 和 frontend request-count 基线。
- 明确 schema owner baseline。
- 落地第一阶段 in-process `SharedSourceRuntime`。

TDD / 验证：

- Red：新增 source runtime priority、dedupe、concurrency、fetch state、非法 intent 测试。
- Green：实现 `SharedSourceRuntime` neutral refresh intent。
- Refactor：保持 shared-source contract 不依赖 news 或 investment event 私有模型。
- Validation：`pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm perf:surface-baseline`、`pnpm perf:mcp-smoke`、`pnpm perf:query-plans`。

状态：已完成。

### Sprint 2：News Snapshot Model 与新闻 Surface 收敛

目标：

- 修复 `Cache.getEntire` SQL 拼接风险。
- 新增 News Snapshot Model。
- `/api/s`、`/api/s/entire`、新闻 MCP 和新闻前端读取收敛到 News Query Service。
- `source_fetch_runs` 从 event database module 分离到 shared-source contract。

TDD / 验证：

- Red：先写 cache parameterized query、news snapshot、news query service、news MCP、source fetch runs ownership 测试。
- Green：实现 `source_snapshots` / `source_items`、News Query Service 和 route adapter。
- Refactor：`cache` 只保留 migration fallback，不作为最终 news query model。
- Validation：focused tests、`pnpm test`、`pnpm typecheck`、`pnpm build`、service restart、live API smoke、MCP smoke、surface baseline。

状态：已完成。

### Sprint 3：Investment Event Query Model 主查询收敛

目标：

- 定义 investment view helper 的 write-time / query-time / presentation 边界。
- 新增 `event_projection` 与 `event_query_indexes`。
- 建立 canonical -> projection 写入管线和 consistency check。
- 将 latest / search / entity provider routes 切到 Investment Query Service。

TDD / 验证：

- Red：先写 event projection table、projection pipeline、investment query service、shadow comparator 测试。
- Green：实现 projection DAO、pipeline、query service、route adapter 和 backfill 入口。
- Refactor：保持 canonical event store 作为 backend truth，online query model 只做受控投影。
- Validation：focused tests、projection backfill、live API smoke、shadow comparison、query plan、MCP smoke、surface baseline。

状态：已完成。

### Sprint 4：Detail / Watchlist / Related-events / MCP 收敛

目标：

- detail 读取 `event_projection.detail_json`。
- related-events 通过 query service 和 projection index 生成。
- watchlist event-read 路径通过 Investment Query Service。
- metadata routes 与 event-read routes 解耦。
- 删除 route-level related-events fan-out helper。

TDD / 验证：

- Red：先写 projection detail、related sections、watchlist matching、watchlist metadata-only storage 测试。
- Green：切换 `/api/investment-events/[id]`、`/api/investment-watchlists/*`、`/api/watchlists/[id]?detail=true`、`/api/watchlists/[id]/events`。
- Refactor：禁止 route 层重新计算投资语义或绕过 query model。
- Validation：focused tests、full test、typecheck、build、service restart、MCP smoke、surface baseline、query plan、ops / quality gates。

状态：已完成。

### Sprint 5：Frontend Cleanup、Ops Decoupling 与最终 Gate

目标：

- `/watchlists/$watchlistId` 单次 detail 请求，不再因 focus mode 触发双请求。
- `/api/ops/events/status` 默认 lightweight，重型 diagnostics 仅显式触发。
- benchmark 不依赖重型 diagnostics。
- 当前生效文档同步 lightweight status 和 diagnostics 入口。

TDD / 验证：

- Red：先确认 frontend request-count、ops light / diagnostics 行为和 benchmark 口径。
- Green：实现 frontend cleanup、ops decoupling 和 benchmark 修正。
- Refactor：避免 ops diagnostics 进入 user-facing / agent-facing 热路径。
- Validation：`pnpm test`、`pnpm typecheck`、`pnpm build`、service restart、light / diagnostics live smoke、MCP smoke、surface baseline、query plan、events ops report、events quality gate。

状态：已完成。

### Review Follow-up：审查问题闭环

目标：

- 修复新闻 stale refresh intent 只入队不执行的问题。
- 修复 watchlist 从 bounded global latest slice 过滤导致漏匹配的问题。
- 修复 `sort=latest` deferred publication 排序回归。
- 同步技术方案、交付状态和 query plan。

TDD / 验证：

- Red：新增 news background drain、business-line drain、watchlist indexed seed、deferred latest ordering 测试。
- Green：实现 `drainSourceRuntime`、`scheduleNewsRefreshDrain`、watchlist entity / topic / source / market seed merge、latest ordering guard。
- Refactor：保持新闻线和事件线只共享 neutral source runtime，不共享业务 query model。
- Validation：focused regression、full test、typecheck、build、service restart、MCP smoke、surface baseline、query plan、ops / quality gates。

状态：已完成。

## 3. Final Definition of Done

- 所有已发现性能问题已被最终架构吸收，而不是留下临时绕过。
- 新闻 user-facing、新闻 agent-facing、投资事件 user-facing、投资事件 agent-facing 四类 surface 均有验证入口。
- News Query Model、Investment Event Query Model、Shared Source Runtime、Observability / Ops 边界清晰。
- metadata routes 与 event-read routes 已拆分。
- route、MCP、frontend 不重新计算 backend-owned investment semantics。
- `delivery-status.md` 记录最终 gate、review follow-up 和关闭说明。
- 工作区无临时垃圾，代码已提交并推送。

状态：已完成。
