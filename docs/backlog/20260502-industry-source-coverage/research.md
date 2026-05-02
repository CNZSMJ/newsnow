# Industry Source Coverage Research

状态：已完成；结论已进入决策、技术方案和交付记录
最后更新：2026-05-02
范围：扩展 `newsnow` 投资事件可用行业源覆盖，并避免扩源后污染 canonical topic semantics

## 1. 背景

`newsnow` 的投资事件系统依赖 source registry 决定哪些外部来源进入事件引擎。

当前行业覆盖已经包含官方、交易所、协会和部分产业来源，但在半导体、AI 服务器/云基础设施、光通信、动力电池、光伏、机器人/工业自动化和制造业研究来源上仍有缺口。

扩源不能只增加入口。每个新增来源都必须具备：

- `column: "industry"`
- canonical industry tags
- `eventProfile`
- 对应 source getter
- generated `sources.json` / `pinyin.json`
- 事件引擎 topic 语义 guardrail

## 2. 问题

如果只把更多来源写入 source registry，会有两个风险：

- 新 source 出现在 UI 配置里，但没有 getter，用户和调度器读不到真实数据。
- 新增更多 canonical industry tags 后，旧的“全行业标签集合”判断可能失效，导致综合宏观/政策来源被当成具体行业事件。

第二个风险会破坏 AGENTS.md 中的核心约束：backend event engine 是投资语义的 single source of truth，不能让 source-level broad tags 直接污染 canonical event semantics。

## 3. 调研结论

本次扩展应保持 source registry 为声明式配置，运行时 getter 只负责把外部页面或 RSS 转成 `NewsItem[]`。

行业语义仍由 backend event engine 负责：

- source tags 只能作为输入信号。
- resolver 和 EventTable 需要识别 broad tag set。
- 查询侧不能因为历史 broad tags 而把综合宏观事件误判成特定行业事件。

## 4. 证据入口

- `shared/pre-sources.ts`
- `shared/sources.json`
- `shared/pinyin.json`
- `shared/industry.ts`
- `server/sources/industryResearch.ts`
- `server/services/event-engine/resolver.ts`
- `server/database/events.ts`
- `server/sources/__tests__/industry-research.test.ts`
- `shared/industry-source-coverage.test.ts`
