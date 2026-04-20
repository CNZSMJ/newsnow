# 迭代 TD 模板

状态：草稿
最后更新：[日期]
范围：[本轮迭代范围]
文档角色：迭代级 TD
更新时机：模块边界、合同、测试方案、rollout 或 rollback 设计发生变化时

## 1. 问题定义

- 当前实现缺口是什么
- 当前模块边界哪里失真
- 本轮 TD 试图修复什么

## 2. 目标架构

- 目标模块图
- 数据流
- 上下游依赖

## 3. 模块边界

- 模块 A 负责什么
- 模块 B 负责什么
- 哪些能力严禁下沉/上浮

## 4. 核心合同

- backend schema / domain contract
- storage contract
- projection / API contract
- LLM 输入输出 contract

## 5. LLM、fallback 与裁决边界

- LLM 可以做什么
- LLM 不可以做什么
- registry / backend arbiter 如何落地
- fallback 如何退化而不写脏 truth

## 6. 测试与验证

- 单元测试
- replay
- shadow
- blind review
- typecheck / build / integration

## 7. 数据迁移与兼容

- 是否需要 backfill / repair
- 是否需要 schema migration
- 是否影响旧 projection

## 8. Rollout 与回滚

- rollout 步骤
- 观测点
- rollback 条件

## 9. 风险与 open questions

- 已知风险
- 未决问题
