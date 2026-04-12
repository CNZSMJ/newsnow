# 投资事件引擎变更 — Code Review（第二轮）

**审查范围**：本地工作区相对主分支的全量未提交变更。  
**审查日期**：2026-04-12  
**结论摘要**：相比首轮审查，**安全鉴权、事务保护、单条容错、PBC 并发控制、评分函数统一、MCP schema、raw 字段精简、worker 启动方式、TDX 缓存治理、DB 查询类型化、impact summary 生命周期与合并细节、shadow baseline 注释** 等问题已修复或明显改善。剩余问题均为低优先级，不影响上线。

---

## 一、首轮问题修复跟踪

| # | 首轮问题 | 优先级 | 当前状态 | 说明 |
|---|---------|--------|----------|------|
| 1 | `/api/ops/events/refresh` 无鉴权 | P0 | **已修复** | `auth.ts` 重写为 `isPublicApi()` 函数，逐路径放行；`/api/ops/events/refresh` 明确排除于公开列表外，且加入 `shouldResolveJwt` 路径，未携带有效 JWT 时返回 401。 |
| 2 | 多表写入缺乏事务 | P0 | **已修复** | `EventTable` 新增 `withTransaction()` 方法（支持嵌套 `SAVEPOINT`）；`persistResolvedEvent` 全部持久化操作包裹在 `withTransaction` 中；`mergeEventIntoCanonical` 同样使用事务包裹。 |
| 3 | 单条 item 失败中断整 source | P1 | **已修复** | `scheduler.ts` 内层 `for (const item of items)` 已有独立 try/catch，失败时记录指标、打日志并 continue，不阻塞后续条目。 |
| 4 | PBC N+1 无并发控制 | P1 | **已修复** | 新增 `mapWithConcurrency()` 工具函数（并发度 4），替代裸 `Promise.all`；单条 `fetchPbcArticleMeta` 失败降级到列表字段。 |
| 5 | 评分函数重复且权重不一致 | P2 | **已修复** | 提取为 `server/services/event-engine/ranking.ts`，统一 `scoreInvestmentEvent()`（可通过 `options` 覆盖权重）与 `getEventRecencyAnchor()`。`events.ts` 与 `watchlists.ts` 均导入使用。 |
| 6 | MCP `count` 使用 `z.any()` | P2 | **已修复** | 引入 `countSchema = z.coerce.number().int().positive().max(100).default(10)`，所有事件/watchlist MCP 工具及原有 `get_sources_news` 均已使用。 |
| 7 | TDX 缓存无淘汰上限 | P2 | **已修复** | `tdx-api.ts` 已补 `sweepResolveCache()` 和 `trimResolveCache()`，同时引入 `CACHE_MAX_SIZE = 500`，缓存不再无界增长。 |
| 8 | `extra.raw` 全量透传 | P2 | **已修复** | `cninfo.ts` 新增 `toAnnouncementRaw()` 精简字段；`hkexnews.ts` 新增 `toHKEXRaw()`；`sse.ts` 新增 `toSSERaw()`。仅保留事件引擎所需最小子集。 |
| 9 | worker 启动应改为 plugin | P3 | **已修复** | `server/middleware/event-bus.ts` 已删除，改为 `server/plugins/event-engine.ts`（`defineNitroPlugin`），仅进程启动调用一次。 |
| 10 | DB 层 `any` 过多 | P3 | **明显改善** | `getRows`/`parseJSON` 提取到 `server/database/sqlite.ts`；`events.ts` 已增加 `EventQueryRow`、`EventEvidenceQueryRow` 等类型化查询结果。当前残留的 `any` 主要在非关键路径（如个别错误捕获）。 |
| 11 | `sourceKindAllowedEventTypes` 表达不清 | P3 | 未变 | 仍只约束 `defaultEventType`，运行时推断可跨类型；无额外注释。 |
| 12 | 测试覆盖不足 | P3 | **明显改善** | 新增 `replay.test.ts`（10 个测试用例覆盖 extractor、merger、impact、resolver、metrics）、`shadow.test.ts`、`fixtures.ts`（8 个 fixture 工厂）。 |
| 13 | `sources.json` 膨胀 | P3 | 未变 | 可接受。 |
| 14 | 双入口 `service.sh` | P3 | 未变 | 可接受。 |

---

## 二、本轮新增内容审查

### 2.1 新增模块一览

| 文件 | 用途 |
|------|------|
| `server/database/sqlite.ts` | 共享 `getRows()` / `parseJSON()` |
| `server/plugins/event-engine.ts` | Nitro plugin，启动 worker |
| `server/services/event-engine/ranking.ts` | 统一投资排序分函数 |
| `server/services/event-engine/legacy.ts` | 旧版分类逻辑（用于 shadow 比较） |
| `server/services/event-engine/shadow.ts` | shadow mode，对比新旧分类差异 |
| `server/services/event-engine/shadow.test.ts` | shadow 比较测试 |
| `server/services/event-engine/fixtures.ts` | 测试 fixture 工厂（8 种场景） |
| `server/services/event-engine/replay.test.ts` | 端到端 replay fixture 测试 |

### 2.2 `impact.ts` 新增 `impactSummary` 字段

`EventImpactSnapshot` 现在包含 `impactSummary: string[]`，提供中文可读的影响摘要（如"净投放偏正向，缓和资金面压力"）。同步新增：
- `EventRow.impact_summary_json`（DB 列）
- `EventRecord.impactSummary`（API 响应）
- `formatEventSummary` 在 MCP 工具中输出 `impact_summary`

设计合理，且 DB migration 通过 `ensureColumn` 兼容旧库。

### 2.3 `ranking.ts` 统一评分

```typescript
export function scoreInvestmentEvent(event, options?) {
  // 可通过 options 覆盖 materialityWeight, lifecycle boost 等
}
```

消除了首轮指出的 `events.ts` 与 `watchlists.ts` 中各自定义评分的不一致。

### 2.4 shadow mode 与 legacy 分类

`legacy.ts` 保留旧的基于 source id 前缀的分类逻辑，`shadow.ts` 提供 `compareEventShadow()` 可对比新旧分类差异。配合 `shadowComparisons`/`shadowDiffs` 两个新指标，便于上线前验证 resolver 升级不引入回退。

### 2.5 测试质量

`replay.test.ts` 覆盖了：
- 宏观利率（FDR007）从分类到 fact 到 impact 的完整链路
- 央行 OMO 的结构化 fact 提取
- HKEX 同一 PDF 跨 3 个 source 的聚类键唯一性
- 媒体快讯 → 货币政策 的跨类型推断
- A 股市场行情快讯方向信号
- 4 种交易所公告子类型（earnings/financing/buyback/dividend）
- 行业月报 fact 的 cadence + period key
- 产业政策 fact 的 entity_id 挂接
- 同期 vs 不同期行业月报的聚类/去重
- metrics counter 累加

---

## 三、剩余问题

### 1. `sourceKindAllowedEventTypes` 的语义仍然不够自解释

当前配置仍主要约束 `defaultEventType`，而运行时 resolver 允许媒体快讯等 family 跨类型推断。这个设计本身是有意的，但从命名上不够直观，后续维护者容易误解为“sourceKind 只能产出一种 type”。

**建议**（P3）：在 profile 设计文档或类型注释里，把“默认类型约束”和“运行时可跨类型推断”的边界写得更直接。

### 2. `sources.json` 膨胀

随着 `eventProfile`、产业源和宏观源持续扩展，生成产物体积会继续增长。当前这是可接受的，但后续如果前端只需要部分字段，可能要考虑更细的裁剪策略。

**建议**（P3）：暂不阻断，后续如果前端 bundle 或冷启动受影响，再评估拆分生成产物。

### 3. 双入口 `service.sh`

仓内仍同时存在根目录和 `scripts/` 下的 service 脚本入口。当前并不妨碍事件引擎升级，但会增加一点点运维认知成本。

**建议**（P3）：后续若做仓内运维清理，可统一入口或在 README 中只保留一个推荐方式。

---

## 四、总结

### 修复率

首轮 14 项问题中：**14 项已修复/明显改善或归入可接受范围**。当前剩余事项已全部降为低优先级演进项。

### 当前剩余优先级

| 优先级 | 问题 | 建议 |
|--------|------|------|
| P3 | `sourceKindAllowedEventTypes` / 运行时跨类型推断边界不够直观 | 补类型注释或设计说明 |
| P3 | `sources.json` 持续膨胀 | 如有性能信号，再评估裁剪 |
| P3 | 双入口 `service.sh` | 统一推荐入口即可 |

### 审查结论

当前变更已无 P0/P1 级阻断问题，**可以合并**。建议后续将注意力转向文档清晰度与运维收敛，而不是继续在事件主链路上打补丁。

---

*本文件为第二轮 Code Review 落盘记录。首轮记录见本文件 git history。*
