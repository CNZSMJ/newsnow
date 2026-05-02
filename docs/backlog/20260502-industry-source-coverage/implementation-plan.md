# Implementation Plan

状态：已完成
最后更新：2026-05-02
范围：`20260502-industry-source-coverage` 的实施步骤和验证计划

## 1. 执行原则

- 从 `docs/README.md` 读取文档治理规则。
- 进入实现前确认 `technical-design.md` 状态为“审批通过”。
- 一致性检查已完成：本 implementation-plan.md 与 `technical-design.md` 一致。
- 只修改 `shared/`、`server/`、`docs/` 和对应 public source icons。
- 不把核心投资语义移到 frontend、MCP formatter、skill 或 prompt。

## 2. 实施步骤

### Step 1：扩展行业分类

- 新增 canonical industry tags。
- 补充 alias。
- 增加 broad-tag shared helper。

状态：已完成。

### Step 2：扩展 source registry

- 新增行业研究、统计和协会来源。
- 补齐 `eventProfile`、tags、home、interval 和 generated registry。
- 维护 source favicon assets。

状态：已完成。

### Step 3：新增 getter adapter

- 新增 `server/sources/industryResearch.ts`。
- 支持泛页面抽取和 RSS 来源。
- 补齐 glob typing。

状态：已完成。

### Step 4：保护 topic semantics

- 写入侧 resolver 复用 broad-tag shared helper。
- 查询侧 EventTable 复用 broad-tag shared helper。
- 保持 legacy 8-tag broad set 兼容。

状态：已完成。

### Step 5：验证

- `pnpm test -- shared/industry.test.ts shared/industry-source-coverage.test.ts server/sources/__tests__/industry-research.test.ts server/services/event-engine/resolver.test.ts server/database/events.test.ts`
- `pnpm typecheck`
- `pnpm docs:check`
- `pnpm exec tsx ./scripts/source.ts`
- `pnpm sources:smoke-industry`
- `git diff --check`

状态：已完成。

### Step 6：禁用不稳定候选来源

- 对 403、timeout、fetch error、empty 或只返回导航/分类页的候选来源设置 `disable: true`。
- 保留候选配置和 getter，方便后续补 source-specific adapter 后恢复。
- 更新 coverage 测试，区分默认 enabled source 和 deferred candidate。

状态：已完成。
