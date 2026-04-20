# 投资事件路线图

状态：使用中
最后更新：2026-04-20
范围：`newsnow` 事件系统的长期演进路径与当前阶段判断
文档角色：当前生效的高层 roadmap
更新时机：长期阶段划分、主线优先级或系统终态发生变化时

## 1. 目标

路线图只回答一件事：

> 这个系统接下来沿什么主线演进，先后顺序是什么。

它不负责每轮设计，也不负责执行跟踪。

## 2. 当前阶段判断

当前系统已经完成 canonical event engine 的 foundation 闭环，具备：

- canonical event / fact / evidence / entity linkage 存储
- source profiles、分类与 extractor 主链路
- merger、timeline、quality gates、replay、shadow、runbook
- provider-facing investment projection
- 主体识别与观察标的候选的 LLM-assisted v1

当前不再处于“从 0 到 1 的事件引擎搭建期”，而处于：

> 在既有 canonical engine 上，继续逐层深化投资语义的阶段。

## 3. 长期主线

### 3.1 第一主线：把 5 个核心问题逐层做深

优先顺序固定为：

1. 发生了什么事
2. 这个事为什么会发生
3. 这个事会影响什么
4. 这个事背后的关联标的是什么
5. 后续建议是什么

前层不稳，后层不能强行起飞。

### 3.2 第二主线：把 provider contract 持续做稳

系统对外必须持续提供稳定、结构化、可审计的 provider-facing contract，避免下游自己重建事件意义。

### 3.3 第三主线：把 investor-facing projection 做实用

frontend 和 agent 不是新的语义源，而是围绕同一套 backend truth 持续优化呈现与扫描体验。

## 4. 分阶段路线

### 阶段 A：Foundation 已完成

目标：建立单一 canonical event engine，并完成基础质量门禁、运维与投影能力。

当前判断：已完成。

### 阶段 B：Layered Semantics Hardening

目标：围绕前四层逐层深化，而不是继续堆平面功能。

当前主方向：

- 第一层 steady-state 守护与精度提升
- 第二层 relation / causal hypothesis 起步
- 第三层 impact pathway 抽象成正式对象
- 第四层 investment mapping 从 v1 子能力扩成正式层

### 阶段 C：Action Layer

目标：在前四层足够稳的前提下，把“后续建议是什么”做成有边界、有量化约束的行动层。

当前判断：尚未启动。

## 5. 当前优先级

当前优先级不是继续平铺新页面或新接口，而是：

1. 守住第一层已关闭 tranche 的质量
2. 启动第二层与第三层的正式建模
3. 将第四层从局部能力提升为正式层
4. 让对外 contract 与 investor projection 始终跟随 backend truth

## 6. 路线图边界

这份文档不负责：

- backlog 主体管理
- hotfix 管理
- 单轮实施设计
- sprint 执行状态

这些内容应分别落在 `backlog/`、`hotfix/` 或对应主题文档中。
