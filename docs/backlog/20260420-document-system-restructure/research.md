# Document System Restructure

状态：进行中
最后更新：2026-04-20
范围：将 `docs/` 从旧的混合结构整理到当前共识下的新文档管理体系

## 1. 背景

当前 `docs/` 存在几个结构性问题：

- `README.md` 混入了大量产品与架构细节，不再只是文档维护手册
- `roadmap`、`delivery board`、`workstreams`、`layer evolution plan`、`iterations`、`decisions`、`templates` 的角色边界混乱
- 一部分设计被写成“长期稳定真相”，不符合高变化系统的治理方式
- backlog 流程、hotfix 流程和当前生效文档之间的边界没有被系统化落实

## 2. 已达成的核心共识

- 当前生效文档只保留真正需要长期管理的少数对象
- `docs/README.md` 只负责文档使用规范与治理规则
- `docs/backlog/YYYYMMDD-slug/` 是功能/重构主题的过程文档容器
- `docs/hotfix/YYYYMMDD-fix-slug.md` 是现有系统问题修复的过程文档容器
- backlog 固定五件套：
  - `research.md`
  - `decisions.md`
  - `product-spec.md`
  - `technical-design.md`
  - `delivery-status.md`
- `decisions.md` 必须分为：
  - `Product Decisions`
  - `Technical Decisions`
- 未达成共识的内容不能进入当前生效文档，只能留在对应 backlog 主题的 `research.md`

## 3. 本轮要完成的事

- 把当前仍应生效的顶层文档收敛到新的最小集合
- 新增 `architecture.md`，并让它如实反映当前系统的抽象层级和代码现状
- 将已被新体系替代的旧顶层文档移出当前工作面
- 更新 `README.md` 和 `AGENTS.md`，让它们只指向新的当前文档集合

## 4. Open Questions

- `docs/archive/` 的长期机制仍未最终定稿；本轮只把它作为历史存量承载区使用
- 当前顶层生效文档的最终最小集合，以本轮 `decisions.md` 为准
