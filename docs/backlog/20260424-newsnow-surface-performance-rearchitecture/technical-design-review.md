# Technical Design Review

状态：审查完成；审查意见已在后续实施中闭环
审查日期：2026-04-25（第四轮）
审查范围：`20260424-newsnow-surface-performance-rearchitecture` 全套文档 + 关键代码交叉验证
审查人：Claude Code (deepseek-v4-pro) + Antigravity (Claude Opus 4.6)

## 审查结论

技术方案经过四轮审查迭代，前三轮发现的全部问题已闭环。第三轮保留的 2 项残留观察（`source_fetch_runs` owner 张力、neutral priority class 机制）在本轮方案更新中已被充分纳入。**方案不再存在开放问题，可以正式进入 Sprint 1 执行。**

---

## 一、代码事实验证

### 1.1 新闻业务线

| 方案描述 | 代码验证 | 结论 |
| --- | --- | --- |
| `/api/s` cache miss 时直接调用 source getter | `server/api/s/index.ts:58-63`：`await getters[id]()` 在 interval/TTL 都失效时同步执行 | ✅ 一致 |
| cache 是 source-level JSON blob | `server/database/cache.ts:14-19`：`cache` 表只有 `id, updated, data(TEXT)` 三列 | ✅ 一致 |
| `getEntire` 用字符串拼接 SQL 条件 | `server/database/cache.ts:44`：`keys.map(k => \`id = '${k}'\`).join(" or ")` — **SQL 注入风险** | ✅ 一致，且为安全漏洞 |
| news MCP tool 直接复用 `/api/s` | `server/mcp/server.ts:90`：`$fetch(\`/api/s?id=${id}\`)` | ✅ 一致 |
| 前端 `useEntireQuery` 批量读后又触发单 source 更新 | `src/hooks/query.ts:44`：`update(...s)` 会对有更新的 source 触发 refetch | ✅ 一致 |
| JSON blob 全文解析作为唯一读取方式 | `server/database/cache.ts:31-41`：`get()` 返回 `JSON.parse(row.data)` | ✅ 一致 |

### 1.2 投资事件业务线

| 方案描述 | 代码验证 | 结论 |
| --- | --- | --- |
| `listEvents` / `countEvents` 独立执行，存在读放大 | `server/services/event-engine/query.ts:44-47`：先 `listEvents` 再 `countEvents`，两次独立 SQL | ✅ 一致 |
| `latest/search/entity` 路由走相同 `listEvents` + `countEvents` 模式 | `listLatestEvents`, `searchEvents`, `getEntityEvents` 三个函数结构一致 | ✅ 一致 |
| event detail 同步构建 related events 触发多次查询 | `server/services/event-engine/related-events.ts:58-96`：`Promise.all` 并发 4 次独立查询（entity/topic/market/family），scanLimit 分别为 24/48/24/24 | ✅ 一致 |
| `investment-view.ts` 包含大量请求期投影逻辑 | 1570 行文件，包含 family 推导、entity 归一、display title 格式化、fact 投影等 | ✅ 一致 |
| MCP tools 通过 `$fetch` 调用 provider HTTP | 所有 event MCP tools 都走 `$fetch('/api/investment-events/...')` | ✅ 一致 |
| canonical event store 直接承担在线查询 | `server/database/events.ts` 3400+ 行，同时包含写入逻辑和所有在线查询逻辑 | ✅ 一致 |
| scheduler 自行拉取 source（§4.1.3 当前/目标差异） | `server/services/event-engine/scheduler.ts` 直接调用 source getter 并写入 raw_items，不经过统一调度层 | ✅ 一致 |

### 1.3 `source_fetch_runs` owner 张力代码验证

| 验证项 | 结果 |
| --- | --- |
| DDL 位置 | `server/database/events.ts:522`（`CREATE TABLE IF NOT EXISTS source_fetch_runs`） |
| 索引创建 | `events.ts:532-533`（2 处 `CREATE INDEX`） |
| 写入 | `events.ts:762`（`INSERT OR REPLACE INTO source_fetch_runs`） |
| 读取 | `events.ts:747, 782`（2 处查询） |
| ops `LEFT JOIN` | `events.ts:1136, 1322`（2 处 ops diagnostics 路径） |
| news 或 shared-source 代码使用此表 | **0 处** — 当前所有消费者都在 investment-event 域 |

方案 §3.5 L346-352 的处理要求与代码事实完全一致。

### 1.4 验证入口核实

| 验证项 | 核实结果 |
| --- | --- |
| `./scripts/service.sh status/logs` | ✅ 存在且可执行 |
| `pnpm events:ops-report` | ✅ `package.json:31`，指向 `scripts/report-event-operations.ts` |
| `pnpm events:check-quality` | ✅ `package.json:29`，指向 `scripts/evaluate-event-quality-gates.ts` |
| `pnpm test`、`pnpm typecheck`、`pnpm build` | ✅ 已核实 |
| `neutral priority` 概念在代码中 | 0 处引用 — 纯设计态概念，合理 |

---

## 二、历史审查问题追踪

### 第一轮审查建议（6 条）— 全部闭环

| 建议 | 优先级 | 状态 | 方案落地位置 |
| --- | --- | --- | --- |
| `getEntire` SQL 注入 Sprint 2 修复 | 🔴 高 | ✅ | TD-9, §5.2 gate, §6 Step 3, delivery blocker |
| event detail baseline 单独测量 | 🟡 中 | ✅ | TD-9, §6 Step 1, §8 验证表, product-spec §5.3/§6 |
| `investment-view.ts` 分类前置 | 🟡 中 | ✅ | TD-9, §5.4 gate, §6 Step 4, delivery blocker |
| `/api/s/entire` 定位明确 | 🟢 低 | ✅ | TD-10, §5.2 gate, §6 Step 1/3 |
| PD/TD 编号交叉引用 | 🟢 低 | ✅ | TD-9, §7 sprint 通用要求 |
| Sprint 3 同步考虑 watchlist/related-events | 🟢 低 | ✅ | TD-9, §5.4 gate 硬性条件 |

### 第二轮新增修复项（10 项）— 全部闭环

包括当前/目标差异说明、Sprint 3 gate 层次化、验证入口表、设计底线、物理形态输出、SQL join 检测、Sprint 3/4 边界表、双真相校验、调度优先级框架等 — 均已验证落地。

### 第三轮残留观察（4 项）— 全部闭环

| 观察项 | 上轮状态 | 本轮状态 | 方案落地位置 |
| --- | --- | --- | --- |
| 6.1 `source_fetch_runs` owner 张力 | 🟡 保留 | ✅ 已闭环 | §3.5 L346-352（5 条迁移约束）, TD-12, §6 Step 1 L794, §6 Step 2 L799, §7 Sprint 1 必须产出, delivery-status §3/§4/§5/§6 |
| 6.2 neutral priority class 机制 | 🟡 保留 | ✅ 已闭环 | §5.1 L622-629（5 条候选要求）, TD-12, §6 Step 1 L791, §7 Sprint 1 必须产出, delivery-status §3/§4/§5/§6 |
| 6.3 验证命令 | ✅ 已关闭 | ✅ 保持关闭 | §8 验证表已更新核实备注 |
| 6.4 Sprint 3/4 路由边界 | ✅ 已关闭 | ✅ 保持关闭 | §7 route-level 边界表保持完整 |

---

## 三、本轮变更摘要

### technical-design.md（+21 行，48KB → 51KB）

| 变更位置 | 内容 |
| --- | --- |
| §3.5 L341-342 | schema 表新增 `event_projection_consistency` 和 `diagnostics snapshot tables` |
| §3.5 L346-352 | **新增 `source_fetch_runs` owner 张力处理要求**（5 条具体迁移约束） |
| §5.1 L622-629 | **新增 neutral priority class interface 候选要求**（5 条具体约束） |
| §5.5 L724-728 | 细化 watchlist metadata vs event-read 路径的 adapter 描述 |
| §6 Step 1 L791-794 | 新增 neutral priority class 输出和 source_fetch_runs 处理 |
| §6 Step 2 L799 | 新增 source_fetch_runs DDL/DAO 分离 |
| §7 Sprint 1 | 必须产出新增 2 项（neutral priority class + source_fetch_runs 处理清单） |
| §8 L916-917 | 验证入口表核实备注更新 |
| §10 L957 | 回滚边界细化 route-level 切换顺序和独立回退点 |

### decisions.md（+14 行，7.7KB → 9.3KB）

| 变更 | 内容 |
| --- | --- |
| TD-11（新增） | 二次审查建议入 sprint 约束（4 条） |
| TD-12（新增） | 合并终稿残留观察入 Sprint 1 约束（4 条） |

### product-spec.md（+5 行，8.7KB → 9.6KB）

- §5.3 新增 route-level 切换清单验收要求
- §5.5 新增 neutral priority class / source_fetch_runs owner 验收
- §5.6 新增 schema ownership baseline 校正和 owner declaration 验收

### research.md（+23 行，11KB → 12.7KB）

- §7.3（新增）：二次审查结论
- §7.4（新增）：合并终稿残留观察结论
- §8 新增 3 项待确认问题（后续实施中已闭环）

### delivery-status.md（+25 行，5.7KB → 7.9KB）

- §2 新增 3 条已完成记录
- §3 新增 4 项进行中
- §4 新增 4 项 blocker
- §5 新增 4 项尚未完成验证
- §6 扩展至 18 步

---

## 四、本轮新增内容评价

### 4.1 §3.5 `source_fetch_runs` owner 张力处理要求 — 优秀 ✅

5 条约束精确覆盖了第三轮审查的代码证据：
1. 当前事实 DDL/写入/查询在 events.ts — ✅ 与代码 8 处引用一致
2. 目标 owner 是 shared-source — ✅ 语义上合理
3. Sprint 1 必须标记 migration bridge — ✅ 防止当前位置被误当终态
4. ops `LEFT JOIN` 标记为 cross-owner — ✅ 直接对应 L1136/L1322
5. Sprint 2 给出分离 milestone — ✅ 设定了退出边界

### 4.2 §5.1 neutral priority class interface 候选要求 — 优秀 ✅

5 条约束把"机制名称"变成了可执行的设计约束：
1. 至少比较 3 类候选方案 — ✅ 覆盖了主要技术选型空间
2. 每个候选必须说明的字段清单（businessLine, sourceId, priorityClass 等）— ✅ 足够具体
3. priorityClass 至少包含 3 个值 — ✅ 与 §5.1 调度框架对齐
4. 隔离保证 — ✅ 重申了中立约束
5. 推荐方案和迁移路径 — ✅ 确保不锁死在 Sprint 1 的临时实现

### 4.3 TD-11 / TD-12 — 优秀 ✅

TD-11 纳入了二次审查的 4 条建议。TD-12 纳入了合并终稿的 4 条残留观察。两者都精确引用了审查来源，决策编号体系保持连贯。

### 4.4 product-spec.md 新增验收条件 — 优秀 ✅

§5.3 新增 route-level 切换清单要求、§5.5 新增 neutral priority class 和 source_fetch_runs 验收、§5.6 新增 schema ownership 验收 — 三处更新与 technical-design.md 的新增约束完全对齐。

### 4.5 §10 回滚边界细化 — 良好 ✅

"单 sprint 只切换一个明确 surface group；如果一个 surface group 包含多个 route，必须在 sprint 设计中列出 route-level 切换顺序和独立回退点" — 这比之前的"单 sprint 只切换一个明确 surface"更精确。

---

## 五、文档间一致性

| 对照关系 | 状态 |
| --- | --- |
| decisions.md PD-1\~7 → technical-design.md | ✅ 全部对齐 |
| decisions.md TD-1\~12 → technical-design.md | ✅ 全部对齐，TD-11/TD-12 新增内容均有落地 |
| product-spec.md §5 验收标准 → technical-design.md §3.5/§3.6/§5.1/§5.4/§7/§8 | ✅ 对应 |
| product-spec.md §6 量化方式 → technical-design.md 验证入口表 | ✅ 覆盖 |
| research.md §7.1\~§7.4 审查结论 → decisions.md TD-9\~TD-12 | ✅ 一致 |
| research.md 原 §8 待确认问题 → technical-design.md §6 Step 1 & §7 Sprint 1 必须产出 | ✅ 转化；后续实施中已闭环 |
| delivery-status.md §3/§4/§5/§6 → technical-design.md 新增约束 | ✅ 对应 |
| 五份文档间无矛盾表述 | ✅ 一致 |

---

## 六、总评

| 维度 | 第一轮 | 第二轮 | 第三轮 | 第四轮（终稿） |
| --- | --- | --- | --- | --- |
| 架构完整性 | 通过 | 通过 | 通过 | 通过 |
| 代码事实一致性 | 通过（11 条） | 通过（14 条） | 通过（14 条 + 残留验证） | 通过（14 条 + owner 张力 8 处引用验证） |
| 文档内一致性 | 基本通过 | 通过 | 通过 | 通过 |
| 跨文档对齐 | 通过 | 通过（7 项） | 通过 | 通过（7 项全通过） |
| 实施可行性 | 通过 | 通过 | 通过 | 通过 |
| 安全关注 | 通过 | 通过 | 通过 | 通过 |
| 缺失项 | 10 项 | 0 阻塞 / 4 观察 | 0 阻塞 / 2 保留 / 2 关闭 | **0 项开放** |

---

## 七、最终结论

方案经过四轮审查，所有发现的问题已全部闭环：

- **第一轮**：6 条建议 → 全部纳入 TD-9 和对应 sprint gate
- **第二轮**：10 项修复 → 全部验证落地
- **第三轮**：4 项残留观察 → 2 项验证关闭 + 2 项保留
- **第四轮**：2 项保留观察 → 全部纳入 TD-12、§3.5、§5.1、§6、§7

**方案不再存在开放审查问题，可以正式进入 Sprint 1 执行。**

Sprint 1 的核心交付物（共 7 项）：

1. 四类 surface baseline
2. 四个物理形态推荐方向和 trade-off
3. `/api/s/entire` performance contract 草案
4. Shared Source Runtime 调度优先级框架
5. neutral priority class interface 候选对比、推荐方案和迁移路径
6. 新闻线 benchmark / diagnostics 命令入口
7. schema ownership baseline 校正版（含 `source_fetch_runs` owner 张力处理清单）
