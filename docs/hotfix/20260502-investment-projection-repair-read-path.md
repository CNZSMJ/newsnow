# Investment Projection Repair Read Path Hotfix

状态：Completed
日期：2026-05-02
关联 backlog：`docs/backlog/20260424-newsnow-surface-performance-rearchitecture/`

## 1. 问题现象描述

Investment Event Query Model 已经把 provider / frontend / MCP 主读取面切到 `event_projection`。

当 projection 缺失、detail projection 尚未生成，或 search/entity query 的 projection 与 canonical truth 出现短暂不一致时，在线读取可能直接返回空结果或缺少 detail，而不是用 canonical truth 做受控修复。

这会让 agent-facing 和 investor-facing 读取面在 canonical event 已存在时表现为“查不到事件”。

## 2. 问题的根因分析

`event_projection` 是 canonical event truth 的在线投影，不是第二套事实源。

当前 `InvestmentQueryService` 只读取 projection store；缺少 projection 时，没有沿着 canonical event store 触发 repair。这样会把 projection 物化延迟暴露给 provider / frontend / MCP。

`docs/backlog/20260424-newsnow-surface-performance-rearchitecture/` 已经把 canonical truth 与 online projection 的 repair / fallback 作为 Investment Event Query Model 的一致性要求，本 hotfix 补齐 read-path repair 缺口。

## 3. 修复方案

保持 backend event engine / canonical store 作为单一事实源。

1. `InvestmentQueryService` 接收可选 canonical event store。
2. search / entity query 在 projection 命中不足或缺失时扫描 canonical candidates。
3. 对缺失 projection 的 canonical event 调用 `refreshInvestmentProjectionForEvent` 做受控 repair。
4. detail 读取缺少 `detail_json` 时按 event id 尝试 repair 后再读取 projection。
5. 单个 canonical event repair 失败时记录 warning，并继续返回已可用的 projection 结果。
6. `getInvestmentQueryService()` 注入 `EventTable` 作为 canonical repair store。

Out of scope:

- 改变 investment semantics 计算方式。
- 改变 provider response schema。
- 改变 projection schema。
- 新增 route-level fallback 逻辑。

## 4. 实施计划

与修复方案一致性检查：已完成。

1. Red: 增加 search projection 缺失时从 canonical event repair 的回归测试。
2. Red: 增加 projected result page 已满但 canonical 仍有缺失 projection 时的 repair 测试。
3. Red: 增加单个 canonical repair 失败不阻断已投影结果的测试。
4. Red: 增加 entity query 和 detail read 的 repair 测试。
5. Green: 为 `InvestmentQueryService` 接入 canonical repair store 和 projection upsert 能力。
6. Green: 在 query/detail read path 上触发受控 repair。
7. Validation: 运行 focused tests、typecheck、docs governance、query-plan 和 diff hygiene。

## 5. 实施状态

- 2026-05-02：Implemented read-path repair for search/entity/detail projection misses.
- 2026-05-02：Updated current architecture document to reflect projection/query-service ownership and canonical repair behavior.
