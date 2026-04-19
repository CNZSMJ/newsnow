# 文档索引

状态：使用中
最后更新：2026-04-19
范围：`newsnow` 仓库 `docs/` 目录的统一入口与文档生命周期规则

## 1. 目的

这份文件是 `docs/` 的唯一入口。

它的职责很简单：

- 让你一眼知道当前哪些文档是“活文档”
- 让你区分哪些文档是历史记录，哪些才是当前事实
- 避免随着系统演进不断新增平行文档，最后没人知道该看哪份

核心原则：

- 顶层 `docs/` 只保留当前仍在使用、仍然代表事实的文档
- 已完成的 tracking、被新文档取代的计划、一次性的 review 记录，全部移到 `docs/archive/`
- 只要现有活文档能承载，就优先更新现有文档，而不是再新建一份“补充说明”

## 2. 推荐阅读顺序

如果你要快速建立上下文，按下面顺序看：

1. [investment-event-foundation-roadmap.md](./investment-event-foundation-roadmap.md)
2. [investment-event-delivery-board.md](./investment-event-delivery-board.md)
3. [investment-event-workstreams.md](./investment-event-workstreams.md)
4. [event-operations-runbook.md](./event-operations-runbook.md)

只有在任务涉及 provider / agent 边界时，再看：

5. [investment-event-agent-interface-plan.md](./investment-event-agent-interface-plan.md)
6. [investment-event-provider-handoff.md](./investment-event-provider-handoff.md)

## 3. 当前活文档

| 文档 | 角色 | 什么时候看 | 什么时候更新 |
| --- | --- | --- | --- |
| [investment-event-foundation-roadmap.md](./investment-event-foundation-roadmap.md) | 架构基线 | 你要确认系统边界、终态定义、基础规则或 foundation 历史时 | 长期有效的边界、规则或终态假设发生变化时 |
| [investment-event-delivery-board.md](./investment-event-delivery-board.md) | 当前执行面 | 你要知道现在在做什么、当前阶段是什么、下个里程碑是什么时 | 当前 tranche、里程碑或执行状态变化时 |
| [investment-event-workstreams.md](./investment-event-workstreams.md) | 长期 backlog | 你要看 backend / frontend / agent 三条线的长期工作面时 | 长期 backlog 结构或工作流优先级变化时 |
| [event-operations-runbook.md](./event-operations-runbook.md) | 运维与验证手册 | 你要做 latency triage、repair、backfill、quality gate 验证、人工抽样时 | 运维步骤、命令、修复流程、发布验证规则变化时 |
| [investment-event-agent-interface-plan.md](./investment-event-agent-interface-plan.md) | provider / agent 边界方案 | 你要改 provider contract、agent 输出边界、`newsnow -> nexus-fi-mcp` 责任分层时 | provider schema、边界规则或 agent 暴露策略变化时 |
| [investment-event-provider-handoff.md](./investment-event-provider-handoff.md) | 当前 handoff 说明 | 你要确认当前稳定可消费的 provider route、字段和消费方式时 | 稳定 provider surface、canonical 字段或消费约定变化时 |

## 4. 已归档文档

下面这些文档保留历史价值，但不再是当前事实来源：

| 文档 | 归档原因 |
| --- | --- |
| [archive/investment-event-engine-upgrade-plan.md](./archive/investment-event-engine-upgrade-plan.md) | 已被 foundation roadmap 和后续执行文档取代 |
| [archive/investment-event-engine-upgrade-plan-review.md](./archive/investment-event-engine-upgrade-plan-review.md) | 对旧升级计划的评审意见，已不再代表当前执行面 |
| [archive/investment-event-engine-code-review.md](./archive/investment-event-engine-code-review.md) | 一次性 code review 记录，不属于长期运行文档 |
| [archive/investment-event-post-foundation-tracking.md](./archive/investment-event-post-foundation-tracking.md) | 已完成 tranche 的执行跟踪，内容已回收进活文档 |
| [archive/tranche-h-sprint-tracking.md](./archive/tranche-h-sprint-tracking.md) | Tranche H 已完成，执行记录已吸收进 delivery board、workstreams 和 runbook |

## 5. 文档生命周期规则

### 5.1 顶层 `docs/` 只放活文档

只要还在顶层，就必须是当前有效、当前要维护、当前能代表事实的文档。

### 5.2 已完成 tracking 一律归档

任何 tracking 文档一旦进入 `Completed`，并且结果已经吸收到 delivery board / workstreams / runbook，就应移到 `docs/archive/`。

### 5.3 被取代的计划一律归档

如果一份计划已经被新的权威文档取代，就不要把两份平级文档同时留在顶层。

### 5.4 每份活文档都必须声明自己的角色

每份活文档都应至少写明：

- 状态
- 范围
- 文档角色
- 什么时候应该更新

这样能防止两份文档同时承担“当前计划”或“当前状态”这种重叠职责。

### 5.5 优先更新现有活文档

在新增文档前，先判断这次变化是否应该写进现有活文档。

只有当主题真的全新，且塞进现有文档会让角色失焦时，才新建文档。

## 6. 最简单的使用规则

如果问题是：

- “`newsnow` 想成为什么？”看 roadmap
- “现在在做什么？”看 delivery board
- “长期 backlog 是什么？”看 workstreams
- “怎么排查、怎么修、怎么验？”看 runbook
- “`newsnow` 怎么给下游 agent 暴露事件能力？”看 agent interface plan 和 provider handoff
