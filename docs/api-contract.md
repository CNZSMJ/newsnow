# 投资事件 API 协议

状态：使用中
最后更新：2026-04-20
范围：`newsnow` 当前实际对外暴露的事件、watchlist、ops 与本地 MCP API
文档角色：当前生效的对外 API 协议清单
更新时机：新增、删除、重命名、改参、改响应或改鉴权边界时

## 1. 目标

这份文档不讨论 API 的抽象定位，只记录**当前真实存在的对外 API**：

- 哪些路由存在
- 使用什么 method
- 当前请求参数是什么
- 当前响应合同是什么
- 当前鉴权边界是什么

## 2. 当前对外 API 总表

| Surface | Method | Path | 用途 | 当前鉴权 |
| --- | --- | --- | --- | --- |
| Provider HTTP | `GET` | `/api/investment-events/latest` | 扫描最新事件 | Public |
| Provider HTTP | `GET` | `/api/investment-events/search` | 按关键词搜索事件 | Public |
| Provider HTTP | `GET` | `/api/investment-events/entity` | 按实体查询事件 | Public |
| Provider HTTP | `GET` | `/api/investment-events/:id` | 读取事件详情 | Public |
| Provider HTTP | `GET` | `/api/investment-watchlists/:id` | 读取 watchlist 详情 | Public |
| Provider HTTP | `GET` | `/api/investment-watchlists/:id/events` | 读取 watchlist 事件 | Public |
| Compatibility HTTP | `GET` | `/api/watchlists` | 列出 watchlists | Public |
| Compatibility HTTP | `POST` | `/api/watchlists` | 创建或更新 watchlist | Public |
| Compatibility HTTP | `GET` | `/api/watchlists/:id` | 读取 watchlist record / detail | Public |
| Compatibility HTTP | `GET` | `/api/watchlists/:id/events` | 读取 watchlist 事件 | Public |
| Ops HTTP | `GET` | `/api/ops/events/status` | 查看 worker / quality / llm / ops 状态 | Public |
| Ops HTTP | `GET` | `/api/ops/events/shadow` | 跑 shadow comparison | Non-public route；当前未在 route 内要求 JWT |
| Ops HTTP | `POST` | `/api/ops/events/refresh` | refresh / replay ingest | JWT required |
| Ops HTTP | `POST` | `/api/ops/events/backfill` | backfill 历史事件 | Route requires user context；当前实现下会 401 |
| MCP Transport | `POST` | `/api/mcp` | 本地 MCP transport 入口 | Public |

## 3. Provider HTTP API

### 3.1 `GET /api/investment-events/latest`

用途：

- 读取事件扫描列表

查询参数：

- `limit`
- `sources`
- `event_type`
- `event_subtype`
- `source_id`
- `topic`
- `market`
- `directional_view`
- `focus`
- `event_family`
- `min_materiality_score`
- `min_authority_score`
- `changed_since`
- `lifecycle_after`
- `series_key`
- `period_key`
- `sort`：`investment | latest | changed`

响应合同：

- TypeScript：`InvestmentProviderEventListResponse`
- `contract.surface = "event_list"`

当前实现：

- Route: [server/api/investment-events/latest.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/investment-events/latest.ts)

### 3.2 `GET /api/investment-events/search`

用途：

- 按关键词搜索事件

查询参数：

- `q`（必填）
- `limit`
- `focus`
- `event_family`
- `market`
- `directional_view`
- `min_materiality_score`
- `min_authority_score`
- `changed_since`
- `lifecycle_after`
- `series_key`
- `period_key`
- `sort`：`investment | latest | changed`

响应合同：

- TypeScript：`InvestmentProviderEventListResponse`
- `contract.surface = "event_list"`

当前实现：

- Route: [server/api/investment-events/search.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/investment-events/search.ts)

### 3.3 `GET /api/investment-events/entity`

用途：

- 按实体维度读取相关事件

查询参数：

- `entity`（必填）
- `limit`
- `focus`
- `event_family`
- `market`
- `directional_view`
- `min_materiality_score`
- `min_authority_score`
- `changed_since`
- `lifecycle_after`
- `series_key`
- `period_key`
- `sort`：`investment | latest | changed`

响应合同：

- TypeScript：`InvestmentProviderEventListResponse`
- `contract.surface = "event_list"`

当前实现：

- Route: [server/api/investment-events/entity.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/investment-events/entity.ts)

### 3.4 `GET /api/investment-events/:id`

用途：

- 读取单个事件的完整投资视图

路径参数：

- `id`

响应合同：

- TypeScript：`InvestmentProviderEventDetailResponse`
- `contract.surface = "event_detail"`

当前实现：

- Route: [server/api/investment-events/[id].ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/investment-events/[id].ts)

### 3.5 `GET /api/investment-watchlists/:id`

用途：

- 读取 watchlist 详情与近期事件

路径参数：

- `id`

查询参数：

- `limit`
- `latest`
- `sort`：`investment | latest`

响应合同：

- TypeScript：`InvestmentProviderWatchlistDetailResponse`
- `contract.surface = "watchlist_detail"`

当前实现：

- Route: [server/api/investment-watchlists/[id].ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/investment-watchlists/[id].ts)

### 3.6 `GET /api/investment-watchlists/:id/events`

用途：

- 读取 watchlist 事件列表

路径参数：

- `id`

查询参数：

- `limit`
- `latest`
- `sort`：`investment | latest`
- `focus`
- `event_family`

响应合同：

- TypeScript：`InvestmentProviderEventListResponse`
- `contract.surface = "watchlist_events"`

当前实现：

- Route: [server/api/investment-watchlists/[id]/events.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/investment-watchlists/[id]/events.ts)

## 4. Compatibility HTTP API

这组路由仍然对外存在，但不是推荐的 provider-facing contract。

### 4.1 `GET /api/watchlists`

用途：

- 列出现有 watchlists

响应合同：

- `{ status, updatedTime, items?: WatchlistRecord[] }`

### 4.2 `POST /api/watchlists`

用途：

- 创建或更新 watchlist

请求体：

- `watchlistId?`
- `name`
- `description?`
- `query?`
  - `entities?`
  - `topics?`
  - `eventTypes?`
  - `eventSubTypes?`
  - `sourceIds?`
  - `markets?`
  - `directionalViews?`
  - `minMaterialityScore?`
  - `minAuthorityScore?`

响应合同：

- `{ status, updatedTime, item?: WatchlistRecord }`

### 4.3 `GET /api/watchlists/:id`

用途：

- 读取 watchlist record，或按 query 切到 detail / investment projection

路径参数：

- `id`

查询参数：

- `detail=true`：返回 detail
- `projection=investment`：返回 investment projection
- `limit`
- `latest`
- `sort`：`investment | latest`

响应合同：

- `WatchlistRecord | WatchlistDetail | InvestmentWatchlistDetail`

### 4.4 `GET /api/watchlists/:id/events`

用途：

- 读取 watchlist 下的事件列表

路径参数：

- `id`

查询参数：

- `projection=investment`
- `event_family`
- `limit`
- `latest`
- `sort`：`investment | latest`

响应合同：

- `EventListResponse | InvestmentEventListResponse`

当前实现：

- [server/api/watchlists/index.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/watchlists/index.ts)
- [server/api/watchlists/[id].ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/watchlists/[id].ts)
- [server/api/watchlists/[id]/events.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/watchlists/[id]/events.ts)

## 5. Ops HTTP API

### 5.1 `GET /api/ops/events/status`

用途：

- 读取当前 worker、版本、保留、ops、LLM、quality、health、metrics 状态

查询参数：

- `windowHours` 或 `hours`
- `diagnosticLimit` 或 `limit`
- `staleThresholdMinutes` 或 `staleMinutes`

响应主体：

- `worker`
- `versions`
- `retention`
- `operations`
- `llm`
- `quality`
- `health`
- `metrics`

当前实现：

- Route: [server/api/ops/events/status.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/ops/events/status.ts)

### 5.2 `GET /api/ops/events/shadow`

用途：

- 跑 shadow comparison，比较新旧事件语义输出差异

查询参数：

- `limit`
- `hours`
- `sources`

响应主体：

- `status`
- `updatedTime`
- `summary / diffs / comparisons`（来自 `compareEventShadow()`）

当前实现：

- Route: [server/api/ops/events/shadow.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/ops/events/shadow.ts)

当前鉴权现实：

- middleware 没把这个路由列为 public
- route 自身也没有要求 JWT
- 所以它当前是否可访问，取决于全局 auth 配置与 middleware 行为，而不是 route 层显式 contract

### 5.3 `POST /api/ops/events/refresh`

用途：

- 手动触发 refresh / replay ingest

请求体：

- `sources?`
- `force?`
- `replayRecentHours?`
- `replayLimit?`
- `replayRawIds?`

响应主体：

- `status`
- `updatedTime`
- `ingestedSources`
- `replayedRawItems`
- `removedEvents`

当前实现：

- Route: [server/api/ops/events/refresh.post.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/ops/events/refresh.post.ts)

当前鉴权现实：

- middleware 会对该路径解析并强制 JWT
- route 自身也要求 `event.context.user.id`

### 5.4 `POST /api/ops/events/backfill`

用途：

- 回填历史事件

请求体：

- `sources?`
- `hours?`
- `limit?`

响应主体：

- `status`
- `updatedTime`
- 以及 `backfillEventHistory()` 返回内容

当前实现：

- Route: [server/api/ops/events/backfill.post.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/ops/events/backfill.post.ts)

当前鉴权现实：

- route 自身要求 `event.context.user.id`
- 但 middleware 当前没有为该路径解析 JWT
- 因此在当前实现下，这个接口会在登录开启时直接 401

## 6. 本地 MCP API

### 6.1 `POST /api/mcp`

用途：

- 本地 MCP 的 Streamable HTTP transport 入口

协议：

- MCP over HTTP

当前实现：

- Route: [server/api/mcp.post.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/api/mcp.post.ts)
- Server: [server/mcp/server.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/mcp/server.ts)

### 6.2 当前 MCP tools

当前 server 中注册的外部工具包括：

- `get_hotest_latest_news`
- `event_scan`
- `event_get_latest_events`
- `event_search_events`
- `event_get_entity_events`
- `event_get_detail`
- `event_get_event`
- `watchlist_list`
- `watchlist_upsert`
- `watchlist_scan`
- `watchlist_get_events`
- `watchlist_get_detail`

## 7. 当前核心响应合同

核心 provider contract 类型定义位于：

- [shared/types.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/shared/types.ts)

当前最重要的响应对象包括：

- `InvestmentEventBrief`
- `InvestmentEventDetail`
- `InvestmentEventFact`
- `InvestmentEventEvidence`
- `InvestmentEntityRef`
- `InvestmentProviderEventListResponse`
- `InvestmentProviderEventDetailResponse`
- `InvestmentProviderWatchlistDetailResponse`

provider metadata 当前由：

- [server/services/event-engine/provider.ts](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/server/services/event-engine/provider.ts)

统一生成：

- `version = investment-provider-v1`
- `projection = investment`

## 8. 边界说明

这份文档记录的是**当前真实对外 API**，不是未来理想边界。

如果后续新增、删除、改名、改参、改鉴权，必须直接更新这份文档。 
