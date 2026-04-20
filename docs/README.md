# 文档索引

状态：使用中
最后更新：2026-04-20
范围：`newsnow` 仓库 `docs/` 目录的统一入口与文档治理规则

## 1. 目的

这份文件是 `docs/` 的唯一入口。

它只负责三件事：

- 说明当前生效文档有哪些
- 说明过程文档怎么写、放在哪
- 说明哪些内容不能写进当前生效文档

它不负责承载产品定位、架构细节或 API 合同本身。

## 2. 文档治理硬规则

必须遵守：

- 任何涉及 `docs/` 读写的任务，都必须先读这份 `README.md`
- 未达成共识的内容，不能写入当前生效文档
- 还在讨论中的内容，只能进入对应 backlog 主题的 `research.md`
- 所有代码变更都必须先落盘一个 `backlog` 或 `hotfix`
- 修复现有系统问题，使用 `docs/hotfix/`
- 改变功能或新增功能，使用 `docs/backlog/`
- 文档治理规则放在这份 `README.md`
- 仓库级 AI / agent 协作规则放在根目录 [`/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/AGENTS.md`](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/AGENTS.md)
- 任何设计与实现都必须优先通过模块化实现业务领域高内聚与模块间低耦合

## 3. 当前生效文档

顶层 `docs/` 当前生效的文档只保留下面这些：

- [product-direction.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/product-direction.md)
  - 总产品定位与方向
- [roadmap.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/roadmap.md)
  - 长期路线与阶段判断
- [architecture.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/architecture.md)
  - 当前系统的总体架构设计与约束
- [api-contract.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/api-contract.md)
  - 对外 API 协议与系统边界
- [event-operations-runbook.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/event-operations-runbook.md)
  - 运维 runbook

除此之外：

- `docs/backlog/` 是功能/重构主题的过程文档
- `docs/hotfix/` 是现有系统问题修复文档
- `docs/archive/` 当前只作为历史存量区，默认不代表当前事实

## 4. Backlog 使用规范

`docs/backlog/` 用来管理一个需要持续讨论、决策、定义、设计和执行跟踪的工作主体。

### 4.1 什么时候必须创建 backlog 主题

出现下面任一情况时，应在 `docs/backlog/` 下新建一个主题目录：

- 某个改动会改变功能或新增功能
- 某个主题需要持续多轮讨论，而不是一次性结论
- 某个改动会跨模块、跨 contract 或跨层语义
- 某个主题需要明确的产品定义、技术设计和执行状态
- 某个主体预计会跨多个 sprint 持续推进

### 4.2 目录命名规则

每个 backlog 主题目录必须使用下面格式：

`YYYYMMDD-slug`

例如：

- `20260420-subject-resolution-hardening`
- `20260420-document-system-restructure`

### 4.3 每个 backlog 主题固定五件套

每个主题目录必须固定包含：

- `research.md`
- `decisions.md`
- `product-spec.md`
- `technical-design.md`
- `delivery-status.md`

推荐结构：

```text
docs/backlog/20260420-subject-resolution-hardening/
├── research.md
├── decisions.md
├── product-spec.md
├── technical-design.md
└── delivery-status.md
```

### 4.4 五件套职责

`research.md`

- 记录问题背景、讨论过程、外部研究、备选方案、争议点和当前共识
- 未达成共识的内容只能放这里

`decisions.md`

- 记录这个主题里已经接受的关键决策
- 必须分为两个章节：
  - `Product Decisions`
  - `Technical Decisions`

`product-spec.md`

- 记录当前生效的产品定义
- 负责目标、范围、非目标、验收标准和量化方式

`technical-design.md`

- 记录当前生效的技术设计
- 负责模块边界、contract、数据流、测试、迁移和 rollout

`delivery-status.md`

- 记录实施状态、blocker、验证记录和下一步

### 4.5 backlog 正常推进顺序

`research -> decisions -> product-spec -> technical-design -> delivery-status`

它不是瀑布流程。实施过程中如果发现问题，可以回流更新前面的文档。

## 5. Hotfix 使用规范

`docs/hotfix/` 用来管理现有系统问题修复。

### 5.1 什么时候使用 hotfix

出现下面任一情况时，应在 `docs/hotfix/` 下新增一个 hotfix 文档：

- 修复现有系统问题
- 修复线上或本地已存在的错误行为
- 修复回归、错误数据、错误投影或错误 contract 实现
- 修复 scope 明确、以单个 bug 为中心的问题

### 5.2 命名规则

每个 hotfix 文档必须使用下面格式：

`YYYYMMDD-fix-slug.md`

例如：

- `20260420-fix-primary-subject-fallback.md`
- `20260420-fix-watch-target-regression.md`

### 5.3 固定 4 个部分

每一个 hotfix 文档必须固定包含：

1. 问题现象描述
2. 问题的根因分析
3. 修复方案
4. 实施状态

推荐结构：

```markdown
# 20260420-fix-xxx

## 1. 问题现象描述

## 2. 问题的根因分析

## 3. 修复方案

## 4. 实施状态
```

## 6. 文档使用顺序

遇到文档任务时，默认按下面顺序阅读：

1. 先读这份 [README.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/README.md)
2. 看当前生效文档：
   - [product-direction.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/product-direction.md)
   - [roadmap.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/roadmap.md)
   - [architecture.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/architecture.md)
   - [api-contract.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/api-contract.md)
   - [event-operations-runbook.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/event-operations-runbook.md)
3. 如果是具体功能/重构主题，再进入对应 `backlog/`
4. 如果是修 bug，再进入对应 `hotfix/`
