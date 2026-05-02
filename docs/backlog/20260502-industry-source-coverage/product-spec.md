# Industry Source Coverage Product Spec

状态：已完成；默认启用来源 live smoke gate 通过
最后更新：2026-05-02
范围：面向投资事件系统的行业数据源覆盖扩展

## 1. 目标

提升投资事件系统对关键产业链信息的覆盖能力，让事件引擎更早获得行业研究、统计、供需和政策信号。

## 2. 用户价值

严肃投资用户需要快速识别产业链变化和高质量研究信号。

本次扩展带来的价值：

- 关键产业来源进入统一事件采集入口。
- 新产业标签能在事件列表、搜索、主体查询和 watchlist 语义中被 backend truth 消费。
- 综合政策/宏观来源不会因为标签变多而被误投到单一行业。

## 3. 范围

In scope：

- 新增 canonical industry tags。
- 扩展 source registry。
- 新增 industry research generic getter。
- 新增 source coverage 和 generic extraction 测试。
- 维护 generated `sources.json`、`pinyin.json` 和 favicon assets。
- 维护 broad-tag guardrail。

Out of scope：

- 不重写事件抽取器。
- 不改变 frontend 投资语义展示规则。
- 不把行业语义迁移到 downstream prompt、skill 或 MCP formatter。
- 不把 `newsnow` 改造成最终公共 MCP boundary。

## 4. 验收标准

- 每个默认启用的 source id 都存在于 generated source registry。
- 不稳定候选来源必须在配置中保留但禁用，不能进入默认调度集合。
- 每个新增 investment-facing source 都有 `eventProfile`。
- 新增 source getter 能被 `#/getters` 聚合。
- 新增 canonical tags 能通过 alias 查询命中。
- broad-tag guardrail 兼容 legacy 8-tag 集合和新增 tag 集合。
- `pnpm test`、`pnpm typecheck`、`pnpm docs:check`、`pnpm sources:smoke-industry` 通过。
