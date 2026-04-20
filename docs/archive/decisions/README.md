# 变化决策索引

状态：使用中
最后更新：2026-04-20
范围：`newsnow` 仓库内被正式接受、会改变当前基线的关键决策
文档角色：accepted decision 索引与治理规则
更新时机：新的关键决策被接受、旧决策被 supersede、命名规则或使用方式变化时

## 1. 目的

这份文档解决的是：

> 当设计经常变化时，如何记录“最后到底接受了什么变化、为什么接受、替代了什么旧方案”。

它不是 roadmap，也不是 iteration tracking。

它只记录：

- 已被接受的关键决策
- 决策的原因
- 替代了哪些旧方案
- 哪些活文档已经因此更新

## 2. 为什么需要 decisions

如果没有独立的 decision layer，系统一复杂就会出现 3 个问题：

- `PRD/TD` 里讨论过很多方案，但没人知道最后采纳了哪一个
- 活文档被直接改写后，看不出为什么变了
- 一轮新迭代开始时，团队会重复讨论已经做过的关键取舍

所以需要单独保留：

- `Proposed Change`
  在 `iterations/<id>/`
- `Accepted Decision`
  在 `decisions/`
- `Current Baseline`
  在 roadmap / layer evolution plan / runbook / handoff 等活文档

## 3. 什么时候必须写 decision record

出现下面任一情况时，应新增一份 decision record：

- 某轮迭代正式改变了 backend contract
- 某一层的对象边界被重定义
- 某个重要 LLM / fallback / arbiter 边界被改写
- 某个 scorecard / gate / rollout discipline 被正式接受
- 某项长期执行规则被确立、替换或废弃

如果只是：

- 小 bugfix
- 测试补强
- 文案修正
- 不改变长期基线的实现细节

则通常不需要新增 decision record。

## 4. 命名规则

目录：

`docs/decisions/`

文件命名：

`YYYY-MM-DD-<slug>.md`

例如：

- `2026-04-20-iteration-package-governance.md`
- `2026-05-02-a9-relation-layer-contract-v1.md`

## 5. 生命周期

一项变化的完整路径应当是：

1. `roadmap/workstreams/layer plan` 指出长期方向或待推进工作
2. `iterations/<id>/prd.md + td.md + tracking.md` 定义并执行一轮变化
3. 变化被接受后，写入 `decisions/<date>-<slug>.md`
4. 对应活文档更新为新的当前生效版本
5. 旧 iteration 目录归档到 `archive/`

也就是说：

- `iteration docs` 记录“怎么讨论、怎么实施”
- `decision docs` 记录“最后接受了什么”
- `active docs` 记录“现在生效的是什么”

## 6. 推荐模板

新建 decision record 时，优先使用：

- [../templates/decision-template.md](../templates/decision-template.md)
