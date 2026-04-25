# Implementation Plan

状态：已完成；补录为本 backlog 的实施记录和后续 agent 恢复入口
最后更新：2026-04-26
范围：`20260420-document-system-restructure` 从 technical design 到文档治理重构落地的实施计划

## 1. 一致性检查

- 本计划与已审批通过的 `technical-design.md` 一致性检查已完成。
- `technical-design.md` 的目标是把 `docs/` 收敛为当前文档、backlog、hotfix 和 archive 四类边界。
- 本计划只记录已完成的文档治理重构，不引入新的产品或架构事实。

## 2. Sprint Plan

### Sprint 0：文档盘点与边界确认

目标：

- 盘点原有 `docs/` 文档。
- 区分当前事实、过程文档、修复文档和历史存量。

TDD / 验证：

- Red：发现顶层文档混杂 current / historical / process 内容。
- Green：建立新的目录边界和迁移目标。
- Refactor：避免把 repo README 变成 workspace hub。
- Validation：文档清单与迁移结果记录到 `delivery-status.md`。

状态：已完成。

### Sprint 1：当前生效文档收敛

目标：

- 保留 `product-direction.md`、`roadmap.md`、`architecture.md`、`api-contract.md`、`event-operations-runbook.md` 作为当前生效文档。
- 将 `docs/README.md` 收缩为文档治理入口。

TDD / 验证：

- Red：当前文档职责不清或内容互相覆盖。
- Green：按职责拆分并保留必要信息。
- Refactor：把历史信息迁入 `docs/archive/`。
- Validation：`docs/README.md` 列出当前生效文档集合。

状态：已完成。

### Sprint 2：过程文档与协作规则落地

目标：

- 建立 `docs/backlog/` 与 `docs/hotfix/` 的职责边界。
- 更新 `AGENTS.md` 的文档入口要求。

TDD / 验证：

- Red：文档任务没有统一入口或过程文档无固定位置。
- Green：固化 backlog / hotfix 的目录规范。
- Refactor：迁移旧模板和旧记录到 archive。
- Validation：`AGENTS.md` 指向 `docs/README.md`，`delivery-status.md` 记录完成状态。

状态：已完成。

## 3. Final Definition of Done

- `docs/README.md` 是 `docs/` 唯一治理入口。
- 顶层当前生效文档只保留当前事实。
- 过程文档进入 `docs/backlog/` 或 `docs/hotfix/`。
- 历史存量进入 `docs/archive/`。
- `AGENTS.md` 明确文档任务必须先读 `docs/README.md`。

状态：已完成。
