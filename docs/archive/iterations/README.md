# 迭代文档包治理

状态：使用中
最后更新：2026-04-20
范围：`newsnow` 仓库内所有需要跨模块、跨 contract 或跨层语义改动的迭代文档包
文档角色：迭代级 PRD / TD / Tracking 治理规则
更新时机：迭代文档包结构、命名规则、启动门槛、归档方式或执行纪律发生变化时

## 1. 目的

这份文档只解决一个问题：

> 当系统越来越复杂时，如何保证每一次迭代都有清楚的产品目标、技术设计、执行状态和验证记录，而不是直接从 backlog 跳到代码。

它不是 roadmap，也不是 backlog。

它定义的是：

- 什么时候必须创建迭代文档包
- 迭代文档包必须包含什么
- 这些文档分别承担什么角色
- 迭代完成后如何归档

它不负责替代：

- 活文档中的当前基线
- `decisions/` 中的 accepted decisions

## 2. 什么时候必须创建迭代文档包

出现下面任一情况时，必须先创建迭代文档包，再开始实施：

- 改动跨越多个模块
- 改动会引入或修改 backend contract
- 改动会改变某一层的业务语义
- 改动会引入新的 scorecard、gate、replay 或 rollout discipline
- 改动会影响 frontend、agent 或 provider projection 的上游语义
- 改动不是单纯的 bugfix / test fix / 文案修正 / 局部维护

换句话说：

- `roadmap` 只告诉你长期方向
- `workstreams` 只告诉你长期 backlog
- 真正允许开始一轮迭代实施的，是迭代文档包

## 3. 目录结构

每一轮迭代都应创建独立目录：

`docs/iterations/<iteration-id>/`

推荐命名：

`YYYY-MM-<stream>-<short-slug>`

例如：

- `2026-04-a9-relation-layer-v1`
- `2026-04-a10-impact-pathway-foundation`
- `2026-05-provider-contract-v3`

每个迭代目录最少包含 3 份文档：

- `prd.md`
- `td.md`
- `tracking.md`

允许附加：

- `assets/`
- `fixtures/`
- `notes.md`

但这些附加文件不能替代 `prd.md`、`td.md` 和 `tracking.md`。

## 4. 三份核心文档的职责

### 4.1 `prd.md`

`PRD` 解决：

- 为什么做这轮迭代
- 它要解决哪个用户/投资问题
- 范围与非目标是什么
- 验收标准和量化方式是什么

它不负责展开技术模块设计。

### 4.2 `td.md`

`TD` 解决：

- 目标架构和模块边界
- contract、数据流和依赖关系
- 测试、replay、shadow、rollout、migration、rollback
- LLM 边界、fallback 边界和模块耦合约束

它不负责替代 PRD 的产品目标说明。

### 4.3 `tracking.md`

`Tracking` 解决：

- 当前状态
- 已完成内容
- blocker
- 关键设计决策
- 验证记录
- 下一步

它不是临时聊天记录，而是正式执行记录。

## 5. 启动门槛

任何一轮正式迭代在开始编码前，至少要满足：

1. 对应 backlog/workstream 已明确
2. `prd.md` 已写清范围、非目标和验收标准
3. `td.md` 已写清模块边界、合同和验证方案
4. `tracking.md` 已初始化
5. 文档角色没有冲突：
   - roadmap 不写实现细节
   - backlog 不写当前状态
   - tracking 不替代 TD

如果这 5 条不满足，就不应开始大规模改代码。

## 6. 模块化纪律

所有迭代文档包都必须把下面这条作为硬约束写进 `td.md`：

> 任何设计与实现都必须优先通过模块化实现业务领域的高内聚与模块间的低耦合。

至少要明确：

- 模块 ownership
- contract 边界
- 哪些逻辑只能 backend 计算一次
- 哪些层只允许消费，不允许重算
- 如何避免 prompt、projection、脚本、frontend formatter 各自再算一遍

## 7. 归档规则

一轮迭代完成后：

- 其被接受的关键变化应先沉淀为 `decision record`
- 然后再吸收到 roadmap / workstreams / layer evolution plan / runbook / delivery board 中的对应活文档
- 该迭代目录随后移到 `docs/archive/`

原则是：

- 活文档保留当前事实
- decision docs 保留为什么当前事实会变成现在这样
- 迭代文档包保留某一轮执行的完整上下文
- 已完成的迭代文档包不长期堆在活文档区

## 8. 推荐模板

新建迭代文档包时，优先使用：

- [../templates/iteration-prd-template.md](../templates/iteration-prd-template.md)
- [../templates/iteration-td-template.md](../templates/iteration-td-template.md)
- [../templates/iteration-tracking-template.md](../templates/iteration-tracking-template.md)
