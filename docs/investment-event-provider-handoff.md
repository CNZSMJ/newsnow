# 投资事件提供方交接说明

状态：使用中
最后更新：2026-04-19
范围：`nexus-fi-mcp` 消费 `newsnow` investment event outputs 时的 handoff 说明
文档角色：当前 provider 消费说明
更新时机：稳定 provider routes、canonical 字段或下游消费约定变化时

## 1. 目的

这份文档是 `newsnow -> nexus-fi-mcp` 边界的实操 handoff 说明。

它不重复整套架构，而是回答下面 4 个问题：

- `newsnow` 现在已经保证了什么
- 哪些 HTTP / MCP 输出已经稳定到可以消费
- 哪些字段是 canonical investment semantics
- 哪些字段默认安全，哪些字段只应该放在 debug 模式下

## 2. 边界规则

`newsnow` 是 provider。

它负责：

- canonical events
- facts
- evidence
- impact 与 investment interpretation
- canonical investment projection

`nexus-fi-mcp` 是最终 public agent boundary。

它应该：

- 消费 `newsnow` 的 canonical investment projection
- 将命名规范化到自己的 public tool contract
- 避免从 raw text 重建事件意义

它不应该：

- 解析 raw `event-bus` internals
- 从 source id 或标题重新推 event family
- 自己重建 `whyItMatters`、`whatToWatchNext`、`riskOfMisread`

## 3. 稳定的 provider surface

### 3.1 HTTP

当前稳定的 provider-facing HTTP 层使用显式 provider routes，并带有 contract metadata：

- `/api/investment-events/latest`
- `/api/investment-events/search`
- `/api/investment-events/entity`
- `/api/investment-events/:id`
- `/api/investment-watchlists/:id`
- `/api/investment-watchlists/:id/events`

边界说明：

- 下游 provider consumer 应只使用显式 `/api/investment-*` routes
- 事件引擎运维接口统一放在 `/api/ops/events/*`，用于 refresh、shadow、backfill、status 等操作

### 3.2 本地 MCP

`newsnow` 仓库内的本地 MCP server 是 provider-facing adapter，不是最终 public tool boundary。

相关工具：

- 优先使用的任务型工具：
  - `event_scan`
  - `event_get_detail`
  - `watchlist_scan`
- 本地仍保留的兼容工具：
  - `event_get_latest_events`
  - `event_search_events`
  - `event_get_entity_events`
  - `event_get_event`
  - `watchlist_get_events`
  - `watchlist_get_detail`

这些工具都已经消费与 frontend 相同的 canonical investment projection，并通过显式 provider-contract routes 读取数据，而不是依赖隐式 `projection` 参数。

## 4. Canonical investment semantics

下面这些字段应被 `nexus-fi-mcp` 视为可复用的 canonical semantics：

- `eventFamily`
- `actionBucket`
- `signalDirection`
- `signalConfidence`
- `materialityScore`
- `tradabilityScore`
- `authorityScore`
- `affectedMarkets`
- `affectedEntities`
- `whyItMatters`
- `tradableNow`
- `whatToWatchNext`
- `riskOfMisread`
- `keyFacts`
- `evidence`

这些值都来自 backend event engine。
除非显式版本化并达成一致，否则下游不应自行重算。

## 5. 默认安全字段与 debug-only 字段

### 5.1 Default-safe

默认 provider payload 应包含：

- investment interpretation
- structured facts
- evidence trail
- 高层 lifecycle view
- related events

这已经足以支撑：

- morning reports
- watchlist scans
- 单事件分析
- topic / entity tracking

### 5.2 Debug-only

下面这些字段应保留为 debug-only，不应成为下游工作流的必需输入：

- 在已有用户友好 label 时仍暴露的内部 fact type id
- evidence id
- extraction status
- source kind internals
- timeline id
- resolver / merger internals

在本地 MCP 中，这些字段只有在 detail-style 工具传入 `debug=true` 时才会出现。

## 6. `nexus-fi-mcp` 的消费建议

`nexus-fi-mcp` 在映射 provider contract 时，应遵循：

1. backend interpretation 是投资语义的主来源
2. facts 和 evidence 必须保留结构化形态
3. 默认情况下不要暴露 `newsnow` 的私有实现术语
4. 优先使用 agent-facing label，而不是 engine-facing label
5. 将 `actionBucket` 视为下游优先级排序的一等信号

## 7. 最低映射建议

public tool layer 至少应保留下面这些概念：

- `what happened`
- `why it matters`
- `who is affected`
- `tradable now`
- `what to watch next`
- `risk of misread`
- `facts`
- `evidence`

如果 `nexus-fi-mcp` 需要改名或折叠字段，也不应丢失这些核心概念。

## 8. 当前 readiness

现在已经 ready 的部分：

- provider-side investment projection
- provider-side 显式 HTTP contract routes
- provider-side contract metadata（`investment-provider-v1`）
- provider-side related event sections
- provider-side action bucket
- provider-side investment interpretation 与 evidence
- 本地 MCP detail-style 输出的 debug gating

仍留给下游的工作：

- `nexus-fi-mcp` 中最终 public `event.*` contract 的归一化
- 多个 event provider 共存时的跨 provider 组合规则
- `nexus-fi-mcp` 仓库内自己的 public MCP tests
