# 投资事件引擎升级方案 — 评审意见

状态：评审版 v1
评审者：AI Code Review
日期：2026-04-11
目标文档：[investment-event-engine-upgrade-plan.md](./investment-event-engine-upgrade-plan.md)

## 总体评价

这是一份质量相当高的升级方案。文档结构清晰、目标明确、原则正确、分阶段合理。能看出作者对投资领域数据工程有深刻理解，特别是在"确定性逻辑优先于 LLM"、"事实优先于文本"这些设计原则上。

以下按维度逐一评审。

## 1. 现状分析 — 准确且诚实

### 肯定

文档对现有系统的优势和局限分析是准确的。经过代码验证：

- `eventType` 确实完全依赖前缀推断（`event-bus.ts` 的 `getEventType`），`chinamoney` 被错误归类为 `news` 而非 `macro`，`szse` 不在 `ANNOUNCEMENT_SOURCE_PREFIXES` 中
- `classifyEventSubType` 确实是关键词扫描，没有利用源头自带的结构化元数据（如 cninfo 的 `announcementTypeName`）
- 事件合并确实过度依赖标题归一化 + 时间桶 + MD5
- `market_move` 和 `sentiment` 已定义在类型系统和 MCP 中，但从未被生产管道赋值

### 建议

补充一个遗漏：当前 `listLatestEvents` 默认会触发 ingestion（读写耦合），这个问题值得在"当前局限"中提及，因为它影响了系统的可扩展性和运维可预测性。

## 2. 设计原则 — 方向正确，缺少一条关键原则

### 肯定

五条原则（声明式语义、事实一等公民、确定性优先、投资导向输出、可交接性）都是正确且必要的。

### 建议

增加第六条原则：**读写路径分离**。当前系统中"查询最新事件"会触发"重新抓取数据"，这在升级后会成为更严重的问题。新架构应该明确声明 ingestion 和 query 是独立路径。

## 3. 目标架构 — 模块划分合理，有几个盲区

### 肯定

管道设计 `Source Adapters → Source Profiles → Evidence Extractors → Resolver → Merger → Impact Engine → Event Store → APIs` 是合理的，模块职责清晰。

### 问题 3.1：缺少 Entity Resolution 的独立模块

方案中多次提到实体链接（公司、行业、市场），但目标模块列表中没有独立的 `entity-resolver.ts`。当前代码里实体提取逻辑（正则 + TDX API 查询）散落在 `event-bus.ts` 中，升级后应该有独立模块。`resolver.ts` 描述中包含了"entity resolution"，但这和"event classification"是两个不同的关注点，耦合在一起会导致模块职责过重。

**建议：** 增加 `server/services/event-engine/entity.ts` 作为独立模块。

### 问题 3.2：缺少对 Source Adapter 层的约束

当前每个 source getter 返回 `NewsItem[]`，这个格式是"展示导向"的。如果 extractor 仍然从 `NewsItem` 中提取结构化事实，那瓶颈就从 event-bus 转移到了 extractor——因为 cninfo 等源头的 API 原始返回有更丰富的字段（`announcementTypeName` 等），但被 getter 丢掉了。

**建议：** 方案应明确说明是否要求 source adapter 在 `NewsItem.extra` 中透传更多原始字段，或者在 extractor 中重新请求原始 API。这是一个影响工作量和数据质量的关键决策。

### 问题 3.3：缺少错误处理和降级策略的显式设计

当某个 extractor 解析失败，是丢弃事实、还是降级到旧的关键词分类？当 TDX API 不可用，实体解析如何处理？这些在投资场景中极为重要。

## 4. 数据模型 — 设计扎实，有少量建议

### 肯定

6 张核心表（`event_sources`, `event_evidences`, `event_facts`, `events`, `event_links`, `event_timeline`）的设计是合理且完整的。

### 问题 4.1：JSON 字段查询能力

当前数据库是 SQLite（本地）/ D1（CF），JSON 查询能力弱。`affected_markets_json` 和 `topic_tags_json` 用 JSON 字符串存储，当前的 `LIKE '%topic%'` 查询已经是个问题。升级后字段更多，这个问题会更严重。

**建议：** 方案应该表态——是继续用 SQLite + JSON 字符串（加关联表做索引），还是考虑迁移到支持 JSON 查询的数据库。这会影响所有阶段的实现。

### 问题 4.2：`event_timeline` 表缺少详细字段定义

其他 5 张表都有字段列表，唯独 `event_timeline` 只有一句描述。作为"事件生命周期状态变更和修订"的载体，它需要至少说清楚以下字段：

- `event_id`
- `state_from`
- `state_to`
- `changed_at`
- `trigger_evidence_id`
- `metadata_json`

### 问题 4.3：评分字段缺少值域和语义定义

`materiality_score`, `directional_confidence`, `tradability_score`, `authority_score`, `freshness_score`, `surprise_score` 这些字段的取值范围（0-1？0-100？）、计算方式的概要说明应在方案中给出，否则不同实现者会用不同的尺度。

## 5. Source Profile 模型 — 设计优秀，细节待完善

### 肯定

`EventProfile` 接口设计是方案的亮点，直接解决了前缀推断的核心问题。

### 问题 5.1：`parserFamily` 和 `sourceKind` 区别不够清晰

比如 `sourceKind: "official_central_bank_operation"` 和 `parserFamily: "central_bank_operation"`——这两个维度的区分度不高。

**建议：** 在方案中明确——`sourceKind` 是语义分类（影响事件路由和权重），`parserFamily` 是技术分类（决定用哪个 extractor 代码路径）。

### 问题 5.2：缺少 `sourceKind` 到 `defaultEventType` 的映射约束

当前方案让每个源自行声明两者，但如果没有约束（比如 `official_central_bank_operation` 的 `defaultEventType` 必须是 `macro` 或 `policy`），未来新增源时可能出现不一致。

**建议：** 增加一张 `sourceKind → allowedEventTypes` 的映射表或校验规则。

## 6. LLM 策略 — 方案中最成熟的部分

### 肯定

8.1-8.4 节对 LLM 使用的边界定义极为清晰。"Where LLM should not be primary"和"Where LLM has clear value"的划分完全正确。8.3 节的六条约束（规则优先、JSON Schema 输出、置信度、理由、证据引用、降级兜底、审计日志）是生产级 LLM 应用的最佳实践。

### 建议

增加成本和延迟预算的约束。投资场景对时效性要求高，如果一个 LLM 调用需要 3-5 秒，对于央行操作这类需要快速分发的事件，要明确在什么场景下可以"先发布确定性结果，异步补充 LLM 增强结果"。

## 7. 分阶段计划 — 合理但偏乐观

### 肯定

四个阶段的划分是合理的，从基础到扩展到 LLM 到生产加固，逻辑通顺。

### 时间线评估

| 阶段 | 预估 | 评估 | 风险点 |
| --- | --- | --- | --- |
| Phase 1 (10 天) | 基础架构 + 5 个源家族 | **偏紧** | DB 迁移 + 5 个 extractor + resolver + merger + impact + API 改造，单人 10 天非常紧 |
| Phase 2 (10 天) | 6 个行业源 + 4 类公告 | 合理 | 行业数据结构差异大，可能超时 |
| Phase 3 (10 天) | LLM 集成 | 合理 | 前提是 prompt 工程和 schema 设计不反复迭代 |
| Phase 4 (10 天) | 生产加固 | **偏乐观** | 回填 + shadow comparison + 监控 + 下游适配，10 天很紧 |

### 问题 7.1：Phase 1 范围偏大

同时做 schema 设计、DB 迁移、3 个 extractor 家族（macro-rate、central-bank-operation、exchange-announcement，实际覆盖 Shibor/FDR007/FR007/LPR/OMO/MLF + 停牌/财报/融资/回购/分红）、resolver v2、merger v2、impact v1、API 改造。

**建议：** 将 Phase 1 拆成 1a（schema + 迁移 + profile + resolver/merger）和 1b（extractors + impact + API），各一周。

### 问题 7.2：DB 迁移策略未说明

是新建表并行运行（双写），还是原地改造？考虑到线上已有数据，迁移策略需要明确。

### 问题 7.3：Phase 4 "回填历史数据"可能比预期复杂

历史 `raw_items` 里可能没有足够信息来重新提取结构化事实，回填的范围和质量预期需要定义。

## 8. 反模式和不变量 — 优秀

### 肯定

第 14 节（What must not happen）和第 15 节（Implementation invariants）写得极好。特别是：

- "不得将媒体评论与官方权威事件混为一谈"
- "`news` 层必须保持独立可用"
- "结构化事实永远优先于文本启发式"

这些约束会有效防止实现偏离。

## 9. 方案缺失项

### 9.1 可观测性设计

方案在 Phase 4 提到了"monitoring"，但缺少对整个管道的可观测性设计——每个阶段应该输出什么 metrics（ingestion 延迟、extractor 成功/失败率、merge 冲突率、fact 提取数量等）。建议在架构层面就内置，不要推迟到 Phase 4。

### 9.2 并发和幂等性

当前系统 `upsertEvent` 使用 `ON CONFLICT DO UPDATE`，这在 SQLite 单写者场景下没问题。但如果未来要支持多 worker 并行 ingestion（比如不同 source family 并行处理），需要讨论并发控制。

### 9.3 版本策略

方案提到"审计日志记录 prompt 版本"，但更广泛地——extractor 逻辑、resolver 规则、impact 评分模型的版本管理如何做？当规则变更导致历史事件评分不一致时怎么处理？

### 9.4 测试策略

完成标准中提到"regression tests cover at least the in-scope source families"，但没有说明测试方案——是用 fixture replay（快照测试）？还是 integration test？建议在 Phase 1 就明确 fixture 格式和测试框架。

### 9.5 Edge/Serverless 部署兼容性

当前系统已有 CF Pages / Vercel 部署路径（虽然 event worker 被禁用了）。新架构的 SQLite 依赖、LLM 调用、多表事务等对 serverless 环境的兼容性需要明确表态。

## 评审总结

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 问题定义 | ★★★★★ | 对现状的分析准确，升级目标清晰 |
| 架构设计 | ★★★★☆ | 管道设计合理，缺少实体解析独立模块和降级策略 |
| 数据模型 | ★★★★☆ | 扎实，但 JSON 查询、timeline 字段、评分语义待完善 |
| LLM 策略 | ★★★★★ | 业界最佳实践水平 |
| 实施计划 | ★★★☆☆ | 阶段划分合理，但时间偏乐观，Phase 1 范围偏大 |
| 可操作性 | ★★★★☆ | 反模式和不变量很好，缺测试策略和迁移策略细节 |

## 核心建议清单

1. Phase 1 拆分为 1a / 1b，降低单阶段风险
2. 明确 Source Adapter 层的数据透传策略（是否扩展 `NewsItem.extra`）
3. 增加实体解析独立模块 `entity.ts`
4. 明确 DB 迁移策略（双写 vs 原地改造）
5. 在架构层面内置可观测性（不要推迟到 Phase 4）
6. 定义评分字段的值域和语义
7. 明确 fixture-based 测试方案
8. 增加"读写路径分离"设计原则
9. 明确 LLM 调用的延迟预算和异步增强策略
10. 补充 `event_timeline` 表字段定义
