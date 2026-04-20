# 投资事件分层推进计划

状态：执行中基线
最后更新：2026-04-19
范围：`event` 前四层能力的对象设计、推进顺序、当前状态与阶段 gate
文档角色：分层推进设计与状态
更新时机：任一层的 contract、阶段状态、量化 gate、依赖顺序或下一阶段计划发生变化时

## 1. 目的

这份文档不负责解释 `newsnow` 最终想成为什么，也不负责维护长期 backlog 全貌。

它只负责一件事：

> 管理 `event` 前四层的分层设计、推进顺序和当前状态，让后续重构可以按层稳步启动，而不会把高层结论建立在脏事实和脏关系之上。

文档边界如下：

- 高层定位、产品架构、技术架构、终态路线：看 [investment-event-foundation-roadmap.md](./investment-event-foundation-roadmap.md)
- 长期 backlog：看 [investment-event-workstreams.md](./investment-event-workstreams.md)
- 当前 tranche / 执行状态：看 [investment-event-delivery-board.md](./investment-event-delivery-board.md)
- 每层设计、状态、gate 与推进顺序：看这份文档

## 2. 前四层总览

前四层不是 4 个并列功能，而是一条严格有依赖顺序的分层系统：

`第一层 factual state -> 第二层 relation / causal hypotheses -> 第三层 impact pathways / assessments -> 第四层 investment mappings`

四层分别回答：

1. 发生了什么事
2. 这个事为什么会发生
3. 这个事会影响什么
4. 这个事背后的关联标的是什么

统一执行规则：

- 后层不能回写前层 truth
- 每层必须有独立对象合同
- 每层必须有独立 scorecard
- frontend / MCP / prompt / 脚本只能消费，不能重算核心语义
- LLM 只能做 bounded assistive work，不能成为任一层的最终 truth source
- 每层重构的第一交付物必须是 backend schema contract，而不是数据库列或页面字段
- 每一轮正式分层重构，都必须先创建对应 iteration package，见 [iterations/README.md](./iterations/README.md)

这份文档不是某一轮迭代的 `PRD` 或 `TD`。
它负责维护每一层的长期推进设计与当前状态，但不能替代逐次实现所需的迭代文档包。

## 3. 第一层：事件收敛与事实状态机层

### 3.1 目标

把混杂、重复、冲突、带噪的输入，持续收敛成一个可验证、可修正、带状态的 canonical event factual state。

### 3.2 核心对象

- `CanonicalEventFactualState`
- `EventClaim`

### 3.3 关键边界

- 第一层不是 `whatHappened` 文案层
- 第一层不是一次性 extractor 输出
- 第一层必须显式区分 `factualStatus` 和 `confidence`
- 第一层是真相锚点，后层只能引用，不能改写

### 3.4 当前状态

- 已完成首轮闭环
- `Tranche H` 已关闭并归档
- 主链路已有：
  - 主体裁决
  - 最小事实模板
  - blind review
  - merge conflict / correction guard
  - `tranche-h-scorecard-v1`

### 3.5 当前 gate

- `tranche-h-scorecard-v1`
- 主要来源：
  - `manual_sample`
  - `runtime_snapshot`
  - `ci_replay`

### 3.6 下一阶段缺口

- `whatHappened` 投影准确度
- 时间语义准确率
- `eventSubType` 精度
- 证据相关性
- 状态迁移质量

### 3.7 启动下一轮重构前提

- 继续保持 `scorecards.trancheH` 绿灯
- 明确第一层 backend schema contract
- replay / repair / blind review 三条验证链继续可用

### 3.8 退出信号

- 第一层不再只覆盖“事实骨架”，而能稳定观测“状态演进质量”

## 4. 第二层：时间关系与原因假设层

### 4.1 目标

基于时间关系、事件关系、背景驱动和证据约束，输出可审计的原因假设与反证信息。

### 4.2 核心对象

- `EventRelation`
- `CausalHypothesis`

### 4.3 关键边界

- 第二层不是最终因果真相层
- 不是所有 relation 都能升级成因果
- 时间关系先于因果假设
- 原始观察事实与原因判断必须分开

### 4.4 LLM 边界

LLM 可以：

- 提出 relation 候选
- 提出 hypothesis 候选
- 提供简要机制说明和反证提示

LLM 不可以：

- 直接宣称最终因果真相
- 跳过 evidence / provenance
- 覆盖第一层 factual state

### 4.5 当前状态

- 已完成架构定义
- 已完成外部研究借鉴整理
- 尚未进入正式 tranche

### 4.6 当前前置依赖

- 第一层 factual state 稳定可用
- 时间语义与 canonical identity 足够稳定

### 4.7 下一阶段交付顺序

1. `EventRelation` backend schema contract
2. 时间关系 replay / shadow / scorecard
3. typed relation replay / shadow / scorecard
4. `CausalHypothesis` contract 与 projection

### 4.8 退出信号

- 第二层默认输出 relation object 和 hypothesis object，而不是模板化解释文本

## 5. 第三层：影响传导与对象映射层

### 5.1 目标

基于暴露关系、网络结构、价格传导、资金约束、预期反应与政策反馈，输出可审计的 impact pathway、impact object 与 impact assessment。

### 5.2 核心对象

- `ImpactObject`
- `ImpactPathway`
- `ImpactAssessment`

### 5.3 关键边界

- 第三层不是情绪标签层
- 第三层必须区分：
  - `real operating impact`
  - `market pricing impact`
- 价格表现只能作为 evidence，不能直接覆盖 impact truth

### 5.4 LLM 边界

LLM 可以：

- 提出 `ImpactObject` 候选
- 提出 `ImpactPathway` 候选
- 提供方向、时间跨度、state dependencies 与反证提示

LLM 不可以：

- 直接成为最终 `ImpactAssessment` truth
- 跳过 registry / network data
- 用价格表现替代经营影响判断

### 5.5 当前状态

- 已完成架构定义
- 已完成前沿研究借鉴整理
- 尚未进入正式 tranche

### 5.6 当前前置依赖

- 第一层 factual state 稳定可用
- 第二层 relation layer 可用

### 5.7 下一阶段交付顺序

1. `ImpactObject` backend schema contract
2. exposure grounding contract 和回放样本
3. `ImpactPathway` contract 和 pathway scorecard
4. `ImpactAssessment` contract 和 projection

### 5.8 退出信号

- 第三层默认输出影响对象、传导路径和影响判断，而不是单个 `bullish/bearish` 标签

## 6. 第四层：投资映射层

### 6.1 目标

基于第一层 factual state、第三层 impact assessments 和 registry grounding，输出确认主体、受影响对象与观察标的候选的投资映射结果。

### 6.2 核心对象

- `MappedInvestmentSubject`
- `WatchTargetCandidate`

### 6.3 关键边界

第四层必须严格区分：

- `confirmed subject`
- `impacted object`
- `watch target candidate`

并且：

- `watch target candidate` 不等于事实主体
- 最终证券映射必须经过 registry / backend arbiter

### 6.4 LLM 边界

LLM 可以：

- 提出 candidate names
- 给出 candidate-to-event 关系说明
- 给出 why-this-target 的简要理由

LLM 不可以：

- 直接产出 canonical security truth
- 跳过 registry resolve
- 单靠常识脑补具体股票

### 6.5 当前状态

- 已有落地子能力：`watchTargetCandidates`
- 当前链路：
  - `LLM candidate hypotheses`
  - `registry resolve`
  - `backend dedupe / confidence / fallback`
- 但完整第四层尚未闭环

### 6.6 当前前置依赖

- 第一层 factual state 稳定可用
- 第三层 impact objects / pathways / assessments 可用

### 6.7 下一阶段交付顺序

1. `MappedInvestmentSubject` backend schema contract
2. 完整区分 `confirmed subject / impacted object / watch target candidate`
3. 增强版 `WatchTargetCandidate` contract
4. 第四层 scorecard 与 explanation object

### 6.8 退出信号

- 第四层默认输出的是有边界的投资映射对象，而不是“可能受益股”散列表

## 7. 跨层推进顺序

后续逐层重构，必须严格按这个顺序推进：

1. 第一层剩余缺口与 scorecard
2. 第二层 contract + replay + scorecard
3. 第三层 contract + replay + scorecard
4. 第四层 contract + replay + scorecard

不允许：

- 第一层没稳就强推第二层因果
- 第二层 contract 未成型就推进第三层传导判断
- 第三层 impact objects / pathways 未成型就直接扩第四层 watch target 结论

## 8. 文档维护规则

这份文档需要持续维护的内容包括：

- 每层当前状态
- 每层下一阶段交付
- 每层当前 gate
- 每层是否已具备进入下一层的前置条件

如果未来某一层完成独立 tranche 并稳定闭环，应将阶段性执行记录继续回收进：

- [investment-event-delivery-board.md](./investment-event-delivery-board.md)
- [investment-event-workstreams.md](./investment-event-workstreams.md)
- [event-operations-runbook.md](./event-operations-runbook.md)
