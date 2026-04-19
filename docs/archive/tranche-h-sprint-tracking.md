# Tranche H 执行追踪

状态：已完成 (Completed)
最后更新：2026-04-19
范围：Tranche H (发生了什么事 95 分专项) 的 TDD Sprint 执行日志
文档角色：归档 Tracking
更新时机：已归档；若需继续推进，请回到 delivery board / workstreams 新开 tranche

---

## 已读取的源文档

- `docs/README.md`
- `docs/investment-event-delivery-board.md`
- `docs/investment-event-workstreams.md`

当前理解：

- `docs/README.md` 规定顶层 `docs/` 只保留活文档，tracking 完成后必须归档到 `docs/archive/`
- `delivery-board` 是 Tranche H 的当前执行面与 tranche 验收面
- `workstreams` 明确 backend 先行，frontend / agent 不得承接本 tranche 的核心投资语义

## 当前认定的核心架构模型

### 1. Subject Resolution 主链路

`LLM role extraction -> registry grounding -> backend arbiter -> canonical projection`

- `LLM` 只负责抽语义角色槽位，不负责落 canonical entity truth
- `entity registry / TDX` 负责对明确候选做 grounding
- backend arbiter 负责决定哪些对象进入 `primarySubject / affectedEntities / whoIsAffected`
- 高置信未映射主体必须以 provisional institution / subject 过渡态存活

### 2. Entity Transition 模型

- `verified entity`
  - 已被 registry / grounding 验证，可进入 canonical entity truth
- `high-confidence unmapped role`
  - 高置信但尚未映射，必须保留为 provisional institution / subject
  - 不得伪装成 canonical company / security
- `non-entity phrase`
  - 标题概括句、事件壳词、情绪短语、媒体署名、摘要句
  - 明确禁止进入 investor-facing entity projection

### 3. Two-Path 处理模型

- `initial canonical path`
  - 不允许被 LLM / grounding 的慢路径阻塞
  - 必须有 deterministic fallback
- `semantic enrichment path`
  - 可补充主体角色、最小事实集、merge 收口
  - 失败时不得污染已入库 canonical truth

## 当前认定的极度严厉工程红线

- `LLM` 禁止直接产出 canonical company / security / market truth
- 高置信未映射主体必须存活，走 provisional 过渡态，禁止直接丢弃
- 核心主体识别与最小事实集抽取坚持单次 schema constrained 交互和严格 timeout
- 禁止回退到标题 heuristic 直接产出 investor-facing `affectedEntities`
- 禁止对已发布事件做核心主体 / family / direction 的静默覆写
- 若 merge 出现核心冲突，必须显式落到 `merge conflict` 或 `correction`

## 当前 Sprint

- Sprint 3：已完成并归档

## Sprint 0：基线、样本和门限

### Red

- 新增 `server/services/event-engine/tranche-h.test.ts`
- 锁定 scorecard、golden family 覆盖、blind review planning 的 contract
- 失败原因已确认：`#/services/event-engine/tranche-h` 模块缺失，`quality-gates` 未嵌入 Tranche H scorecard

### Green

- 新增 `server/services/event-engine/tranche-h.ts`
- 将 Tranche H scorecard 嵌入 `server/services/event-engine/quality-gates.ts`
- 建立 `TRANCHE_H_REPLAY_FIXTURE_CATALOG`
- 建立 `scripts/sample-tranche-h-blind-review.ts` 与 `pnpm events:blind-review`
- 建立高风险风险桶：`generic_fallback`、`unmapped_role`、`merge_conflict`、`new_family`、`low_confidence_llm`

### 验证

- `pnpm test -- server/services/event-engine/tranche-h.test.ts server/services/event-engine/quality-gates.test.ts`
- `pnpm events:check-quality`
- `pnpm events:ops-report -- --hours 24 --limit 5`
- `pnpm events:blind-review -- --hours 24 --scan-limit 20 --random 2 --high-risk 3`

## Sprint 1：主体识别与后续跟踪对象重构

### Red

- 新增 `server/services/event-engine/subject-resolution.test.ts`
- 新增 `investment-view` 针对 provisional institution 的 projection 测试
- 失败原因已确认：
  - `#/services/event-engine/subject-resolution` 模块缺失
  - `investment-view` 还未识别 `institution` entity link，当前被误投成 `topic`

### Green

- 新增 `server/services/event-engine/subject-resolution.ts`
- 让 `server/services/event-engine/entity.ts` 改为复用 backend-owned subject arbitration
- 将旧 `primary-entity-fallback` 从 investor-facing `affectedEntities` 路径移除
- 扩展 `shared/types.ts` 与 `investment-view.ts`，让 `institution` 成为一等实体类型
- 将 `scheduler`、事件 repair 路径与 replay 路径统一切到新 subject-resolution
- family-specific subject policy 已覆盖 `market_move / policy / announcement / industry_data`

### 验证

- `pnpm test -- server/services/event-engine/subject-resolution.test.ts server/services/event-engine/investment-view.test.ts server/database/events.test.ts`
- 高置信未映射主体样本会以 `llm-provisional-institution` / `deterministic-provisional-institution` 存活
- LLM timeout 样本会安全回退到 deterministic path

## Sprint 2：事件类型与最小事实集

### Red

- 新增 `server/services/event-engine/minimal-facts.test.ts`
- 锁定公告、政策、宏观、市场异动四类 minimal fact template completeness
- 失败原因已确认：`#/services/event-engine/minimal-facts` 模块缺失

### Green

- 新增 `server/services/event-engine/minimal-facts.ts`
- 为 `announcement / policy / macro / market_move` 建立 template completeness evaluation
- 扩展 `extractors/policy-notice.ts`，新增 `issuerInstitution / policyAction / targetScope / executionWindow / affectedMarkets`
- 扩展 `extractors/media-fast.ts`，新增 `subjectText / magnitudeText / driverText`
- 提升 `investment-view.ts` 的事实摘要，确保 detail 默认能回答“谁、对谁、做了什么、关键数值/时间是什么”

### 验证

- `pnpm test -- server/services/event-engine/minimal-facts.test.ts server/services/event-engine/investment-view.test.ts`
- `pnpm events:check-quality` 中 `scorecards.trancheH.gates` 已显示 structured fact coverage

## Sprint 3：事件身份、timeline 和 repair 收口

### Red

- 扩展 `server/database/events.test.ts`
- 锁定两类禁止静默覆写场景：
  - 核心主体冲突必须落 `merge_conflict_candidate`
  - 同主体方向反转必须落 `event_correction`

### Green

- 在 `server/database/events.ts` 中新增 `getMergeDisposition`
- `mergeEventIntoCanonical` 改为返回 `merged / conflict / correction`
- 核心主体冲突、family 冲突会阻断静默 merge，并写入 `merge_conflict_candidate`
- 同主体正负方向反转会落成显式 `event_correction`
- repair / backfill / blind review 纪律已吸收到 runbook

### 验证

- `pnpm test -- server/database/events.test.ts`
- `pnpm events:blind-review -- --hours 24 --scan-limit 20 --random 2 --high-risk 3`
- blind review summary 会显式暴露已覆盖与未覆盖的高风险桶，避免线上样本稀薄时静默失真

## 关键实现决策

- `resolver.ts` 中的标题 / 摘要启发式仅保留为 `primaryEntityNameHint`；最终 investor-facing 主体一律由 `subject-resolution.ts` 裁决
- 未映射但高置信的主体不再被伪装成 company / security，而是进入 `institution` 过渡态
- 最小事实集改为 template evaluation，避免 detail 依赖散落 heuristics
- merge 冲突不再静默覆写：主体 / family 冲突落 `merge_conflict_candidate`，同主体方向反转落 `event_correction`

## 已解决 blocker

- 线上 LLM / registry 接口未确认：通过 injected extractor / resolver mock 隔离接口，先完成 TDD 闭环
- `docs/investment-event-delivery-board.md` 与 `docs/investment-event-workstreams.md` 预先存在脏改动：本轮只做 Tranche H 相关最小吸收，不回滚他人修改
- `typecheck` 一度被测试夹具里的非法 `AffectedMarket` 字面量阻断，已修正为合法枚举

## 已通过的最终验证

- `pnpm test`
  - 结果：22 个 test files、196 个测试全部通过
- `pnpm typecheck`
- `pnpm build`
- `pnpm events:check-quality`
- `pnpm events:ops-report -- --hours 24 --limit 5`
- `pnpm events:blind-review -- --hours 24 --scan-limit 20 --random 2 --high-risk 3`

运行期备注：

- 当前线上 blind review 已覆盖 `generic_fallback` 风险桶
- `unmapped_role / merge_conflict / new_family / low_confidence_llm` 尚未在最近 24 小时真实样本里全部命中，但脚本与风险桶暴露已就位，后续按 steady-state review 持续积累

## 文档吸收与归档

- `docs/investment-event-delivery-board.md` 已回收 Tranche H 完成状态
- `docs/investment-event-workstreams.md` 已回收 backend 主线与 A8 steady-state 状态
- `docs/event-operations-runbook.md` 已吸收 blind review 与 merge/correction 运维纪律
- `docs/README.md` 已更新归档索引
- 本 tracking 已移动到 `docs/archive/tranche-h-sprint-tracking.md`，顶层 `docs/` 保持为活文档
