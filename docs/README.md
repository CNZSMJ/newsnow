# 文档索引

状态：使用中
最后更新：2026-04-26
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
- 任何 backlog 进入实现前，`technical-design.md` 的状态必须明确为“审批通过”
- 任何 backlog 进入实现前，必须存在 `implementation-plan.md`，并完成其与 `technical-design.md` 的一致性检查
- 任何 hotfix 进入实现前，必须存在“实施计划”，并完成其与“修复方案”的一致性检查
- 缺少已审批技术方案、缺少实施计划或一致性检查未完成时，agent 不得直接进入代码实现
- 每个 backlog 或 hotfix 都必须在独立分支上实施
- 提交前必须运行文档治理检查：`pnpm docs:check`

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
- `docs/agents/` 是本仓库工程 agent 技能的本地配置，包括 issue tracker、triage labels 和 domain docs 读取规则
- `docs/prompt/` 是仓库级固定 agent 启动提示词
- `docs/archive/` 当前只作为历史存量区，默认不代表当前事实

## 4. 通用状态与分支规则

### 4.1 Backlog 状态机

backlog 主题只能使用下面状态推进：

1. `Draft`
2. `Design Review`
3. `Ready for Implementation`
4. `In Progress`
5. `Validation`
6. `Completed`

允许在中文状态中附带这些英文状态，也允许中文说明写成“草拟中 / 设计审查中 / 待实现 / 实施中 / 验证中 / 已完成”，但状态语义必须清楚。

进入 `Ready for Implementation` 前必须满足：

- `technical-design.md` 状态明确为“审批通过”
- `implementation-plan.md` 已存在
- `implementation-plan.md` 已声明完成与 `technical-design.md` 的一致性检查
- `delivery-status.md` 已初始化

进入 `Completed` 前必须满足：

- `implementation-plan.md` 的最终 Definition of Done 已全部完成
- `delivery-status.md` 已记录最终验证结果
- 必要的当前生效文档已经同步
- 工作区没有未说明的临时文件、临时兼容层或未关闭验证缺口

### 4.2 Hotfix 状态机

hotfix 只能使用下面状态推进：

1. `Diagnosing`
2. `Planned`
3. `In Progress`
4. `Validation`
5. `Completed`

允许在中文状态中附带这些英文状态，也允许中文说明写成“诊断中 / 已计划 / 实施中 / 验证中 / 已完成”，但状态语义必须清楚。

进入实现前必须满足：

- “问题现象描述”已明确
- “问题的根因分析”已明确
- “修复方案”已明确
- “实施计划”已存在
- “实施计划”已声明完成与“修复方案”的一致性检查

如果 hotfix 修复范围扩大到跨模块、跨 contract、跨层语义或多个 bug，必须停止扩大 hotfix，把后续工作转入 backlog。

### 4.3 分支规则

实施分支必须与文档类型一致：

- backlog 使用 `backlog/<YYYYMMDD-slug>`
- hotfix 使用 `hotfix/<YYYYMMDD-fix-slug>`

`delivery-status.md` 或 hotfix“实施状态”必须记录关键 commit、push 状态、验证命令和最终结果。

### 4.4 审查意见闭环规则

审查意见可以记录为 `technical-design-review.md` 或其他 topic-local review 文档，但不能只停留在 review 文档。

所有 accepted review finding 必须回写到下面至少一个位置：

- `technical-design.md`
- `implementation-plan.md`
- `delivery-status.md`
- hotfix 文档的“修复方案 / 实施计划 / 实施状态”

审查文档关闭时必须说明开放问题是否为零；如果仍有开放问题，对应 backlog 或 hotfix 不能进入 `Completed`。

### 4.5 文档治理检查

文档治理检查入口：

```bash
pnpm docs:check
```

该检查至少覆盖：

- backlog 六件套是否完整
- 非 Draft backlog 进入实现态前，`technical-design.md` 是否已审批通过
- 非 Draft backlog 进入实现态前，`implementation-plan.md` 是否声明与技术方案一致性检查已完成
- Draft backlog 可以记录未审批方案和未完成一致性检查，但不得进入实现
- hotfix 五段式是否完整
- hotfix“实施计划”是否声明与“修复方案”一致性检查
- review 文档是否声明已闭环或无开放问题

## 5. Backlog 使用规范

`docs/backlog/` 用来管理一个需要持续讨论、决策、定义、设计和执行跟踪的工作主体。

### 5.1 什么时候必须创建 backlog 主题

出现下面任一情况时，应在 `docs/backlog/` 下新建一个主题目录：

- 某个改动会改变功能或新增功能
- 某个主题需要持续多轮讨论，而不是一次性结论
- 某个改动会跨模块、跨 contract 或跨层语义
- 某个主题需要明确的产品定义、技术设计和执行状态
- 某个主体预计会跨多个 sprint 持续推进

### 5.2 目录命名规则

每个 backlog 主题目录必须使用下面格式：

`YYYYMMDD-slug`

例如：

- `20260420-subject-resolution-hardening`
- `20260420-document-system-restructure`

### 5.3 进入实现阶段的 backlog 主题固定六件套

每个进入实现阶段的 backlog 主题必须固定包含：

- `research.md`
- `decisions.md`
- `product-spec.md`
- `technical-design.md`
- `implementation-plan.md`
- `delivery-status.md`

推荐结构：

```text
docs/backlog/20260420-subject-resolution-hardening/
├── research.md
├── decisions.md
├── product-spec.md
├── technical-design.md
├── implementation-plan.md
└── delivery-status.md
```

### 5.4 六件套职责

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
- 进入实现前状态必须明确为“审批通过”

`implementation-plan.md`

- 记录从 technical design 进入 TDD 开发的实施计划
- 必须把方案拆成 Sprint-by-Sprint / Step-by-Step
- 每个 step 必须说明 TDD red、green、refactor、validation 和完成标准
- 必须定义最终 Definition of Done
- 必须让任意 agent 能结合 `delivery-status.md` 恢复并继续执行
- 必须声明已完成与 `technical-design.md` 的一致性检查

`delivery-status.md`

- 记录实施状态、blocker、验证记录和下一步
- 必须记录当前状态机状态、关键 commit / push 状态和最终验证结果

### 5.5 backlog 正常推进顺序

`research -> decisions -> product-spec -> technical-design -> implementation-plan -> delivery-status`

它不是瀑布流程。实施过程中如果发现问题，可以回流更新前面的文档。

进入实现前必须满足：

- `technical-design.md` 已经完成必要审查，且状态明确为“审批通过”
- `implementation-plan.md` 已经把技术方案拆成可执行 Sprint / TDD step
- `implementation-plan.md` 已经声明与 `technical-design.md` 的一致性检查结果
- `delivery-status.md` 已经初始化，可记录执行进度

### 5.6 固定 agent 启动提示词

仓库级固定启动提示词放在：

- [prompt/agent-start-prompt.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/prompt/agent-start-prompt.md)

推荐使用方式：

```text
激活提示词 docs/prompt/agent-start-prompt.md，实施 docs/backlog/<YYYYMMDD-slug>
激活提示词 docs/prompt/agent-start-prompt.md，修复 docs/hotfix/<YYYYMMDD-fix-slug>.md
```

固定提示词只定义执行协议，不承载具体需求。具体需求、设计、计划、修复方案和进度必须来自用户指定的 backlog 目录或 hotfix 文档。

## 6. Hotfix 使用规范

`docs/hotfix/` 用来管理现有系统问题修复。

### 6.1 什么时候使用 hotfix

出现下面任一情况时，应在 `docs/hotfix/` 下新增一个 hotfix 文档：

- 修复现有系统问题
- 修复线上或本地已存在的错误行为
- 修复回归、错误数据、错误投影或错误 contract 实现
- 修复 scope 明确、以单个 bug 为中心的问题

### 6.2 命名规则

每个 hotfix 文档必须使用下面格式：

`YYYYMMDD-fix-slug.md`

例如：

- `20260420-fix-primary-subject-fallback.md`
- `20260420-fix-watch-target-regression.md`

### 6.3 固定 5 个部分

每一个 hotfix 文档必须固定包含：

1. 问题现象描述
2. 问题的根因分析
3. 修复方案
4. 实施计划
5. 实施状态

推荐结构：

```markdown
# 20260420-fix-xxx

## 1. 问题现象描述

## 2. 问题的根因分析

## 3. 修复方案

## 4. 实施计划

- Red：
- Green：
- Refactor：
- Validation：
- 完成标准：
- 与修复方案一致性检查：

## 5. 实施状态
```

### 6.4 Hotfix 固定启动方式

hotfix 也使用仓库级固定启动提示词：

```text
激活提示词 docs/prompt/agent-start-prompt.md，修复 docs/hotfix/<YYYYMMDD-fix-slug>.md
```

执行规则：

- 以 hotfix 文档的“实施状态”恢复当前进度
- 以“问题现象描述”和“问题的根因分析”限定修复边界
- 以“修复方案”理解修复方向
- 以“实施计划”作为执行来源
- 实施前必须核对“实施计划”与“修复方案”一致
- 必须按实施计划中的 TDD red regression test / reproducible failing check -> green fix -> refactor -> validation 推进
- 每完成一个 step，更新 hotfix 文档的“实施状态”
- 如果修复范围超出单个 bug，停止扩大实现，并把后续工作转入 backlog

## 7. 文档使用顺序

遇到文档任务时，默认按下面顺序阅读：

1. 先读这份 [README.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/README.md)
2. 看当前生效文档：
   - [product-direction.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/product-direction.md)
   - [roadmap.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/roadmap.md)
   - [architecture.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/architecture.md)
   - [api-contract.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/api-contract.md)
   - [event-operations-runbook.md](/Users/huangjiahao/workspace/industry-investment-suite/repos/newsnow/docs/event-operations-runbook.md)
3. 如果是具体功能/重构主题，再进入对应 `backlog/`
4. 如果是从 backlog 进入实现，读取该 backlog 的 `delivery-status.md` 和 `implementation-plan.md`
5. 如果是修 bug，再进入对应 `hotfix/`；进入实现时读取该 hotfix 文档的“实施状态”和“实施计划”
