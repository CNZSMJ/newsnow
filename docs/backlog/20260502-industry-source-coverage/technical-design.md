# Industry Source Coverage Technical Design

状态：审批通过；实现进入验证阶段
最后更新：2026-05-02
范围：行业源覆盖扩展的模块边界、数据流和验证方案

## 1. 设计目标

- 扩展 source registry，但不改变 backend event engine 的 truth-source 职责。
- 为多个行业研究来源提供统一 getter adapter。
- 新增 canonical industry tags，同时保持历史 broad tags 查询兼容。
- 让 source coverage、getter coverage 和 event topic guardrail 都有测试。

## 2. 模块边界

### 2.1 Source Registry

文件：

- `shared/pre-sources.ts`
- `shared/sources.json`
- `shared/pinyin.json`

职责：

- 声明 source id、column、tags、eventProfile、home 和 interval。
- 生成 UI / API / scheduler 消费的 registry。

非职责：

- 不判断事件投资意义。
- 不重算 directional view、materiality、tradability 或 watch-next 语义。

### 2.2 Source Getter Adapter

文件：

- `server/sources/industryResearch.ts`
- `server/glob.d.ts`

职责：

- 将外部行业研究页面和 RSS 转成 `NewsItem[]`。
- 对泛页面抽取使用 source-specific keywords 做初步噪音过滤。

非职责：

- 不生成 canonical event semantics。
- 不替代 event engine extractor。

### 2.3 Industry Taxonomy

文件：

- `shared/industry.ts`

职责：

- 维护 canonical industry tags。
- 维护 alias 查询。
- 提供 broad tag set 判断。

### 2.4 Event Semantics Guardrail

文件：

- `server/services/event-engine/resolver.ts`
- `server/database/events.ts`

职责：

- resolver 在写入 canonical event 前抑制 broad source tags。
- EventTable 在 topic filter / count / repair 时避免历史 broad tags 误入单一行业结果。

## 3. 数据流

```text
shared/pre-sources.ts
  -> scripts/source.ts
  -> shared/sources.json / shared/pinyin.json
  -> server/getters.ts
  -> server/sources/industryResearch.ts
  -> source runtime / event scheduler
  -> event engine resolver
  -> canonical event store
  -> projection/query model
```

## 4. 一致性检查

一致性检查已完成：本设计与 `product-spec.md`、`decisions.md` 和 AGENTS.md 的 backend truth 规则一致。

本设计不把投资语义推出 backend event engine，也不让 frontend 或 downstream agent 重新计算行业意义。
