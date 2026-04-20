# Decisions

状态：进行中
最后更新：2026-04-20
范围：文档管理体系重构过程中已经接受的关键决策

## Product Decisions

### PD-1 当前生效文档应收敛到少数长期对象

- 当前生效文档不再承载过程跟踪、模板、迭代包或散乱的设计分层说明
- 当前长期需要管理的对象收敛为：
  - 总产品定位与方向
  - roadmap
  - 总体架构设计与约束
  - 对外 API 协议与系统边界
  - 运维 runbook
- 当前顶层生效文档集合确定为：
  - `docs/README.md`
  - `docs/product-direction.md`
  - `docs/roadmap.md`
  - `docs/architecture.md`
  - `docs/api-contract.md`
  - `docs/event-operations-runbook.md`

### PD-2 所有代码变更都必须先归类为 backlog 或 hotfix

- 修复现有系统问题：`docs/hotfix/`
- 改变功能或新增功能：`docs/backlog/`

## Technical Decisions

### TD-1 backlog 主题按日期主题目录组织

- 目录格式：`docs/backlog/YYYYMMDD-slug/`
- 固定五件套：
  - `research.md`
  - `decisions.md`
  - `product-spec.md`
  - `technical-design.md`
  - `delivery-status.md`

### TD-2 hotfix 使用单文件模式

- 文件格式：`docs/hotfix/YYYYMMDD-fix-slug.md`
- 固定四部分：
  1. 问题现象描述
  2. 问题的根因分析
  3. 修复方案
  4. 实施状态

### TD-3 本轮新增 `architecture.md`

- `architecture.md` 必须以架构视角描述当前系统现状
- 它必须映射到真实代码层和真实模块边界
- 它不能写成未来理想态或泛化愿景文档

### TD-4 旧顶层 current 文档退出当前工作面

- 被新体系替代的旧顶层文档移动到 `docs/archive/`
- 不再让旧文档和新文档同时在顶层并列为当前事实
