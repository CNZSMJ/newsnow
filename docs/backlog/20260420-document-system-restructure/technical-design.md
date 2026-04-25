# Document System Restructure Technical Design

状态：审批通过；已完成
最后更新：2026-04-20
范围：`docs/` 目录重构的实施设计

## 1. 目标结构

顶层当前文档：

- `README.md`
- `product-direction.md`
- `roadmap.md`
- `architecture.md`
- `api-contract.md`
- `event-operations-runbook.md`

过程文档：

- `backlog/`
- `hotfix/`

历史存量：

- `archive/`

## 2. 迁移策略

1. 从旧顶层文档抽取重要内容
2. 用新的顶层文档重新承接当前生效信息
3. 将已被新体系替代的旧顶层文档移出当前工作面
4. 更新 `README.md` 与 `AGENTS.md`

## 3. 关键约束

- 不丢失重要产品、架构、API、运维信息
- 不把未达成共识的结构写入当前文档
- `architecture.md` 必须基于现有代码，而不是空想目标

## 4. 验证

- 检查新的顶层文档是否齐全
- 检查旧文档是否已退出当前工作面
- 检查 `README.md` / `AGENTS.md` 的引用是否一致
