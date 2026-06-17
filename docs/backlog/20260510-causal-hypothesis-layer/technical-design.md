# Causal Hypothesis Layer Technical Design

状态：审批通过；Ready for Implementation
最后更新：2026-05-25
范围：`CausalHypothesis` 的模块边界、数据模型、生成流程、projection/API/UI 边界

## 1. 设计目标

- 在 canonical event engine 内新增第二层“原因假设”能力。
- 让原因推理由大模型主导，但让后端负责结构化保存、证据约束、状态和回放。
- 保持 frontend、MCP 和 provider route 只消费 backend truth，不重新推理原因。
- 避免把现有 `relatedEvents` 查询能力误当成 relation / causal layer。

## 2. 核心边界

### 2.0 模块布局

原因假设实现为独立子模块：

- `server/services/event-engine/causal-hypothesis/types.ts`
- `server/services/event-engine/causal-hypothesis/input.ts`
- `server/services/event-engine/causal-hypothesis/prompt.ts`
- `server/services/event-engine/causal-hypothesis/generator.ts`
- `server/services/event-engine/causal-hypothesis/service.ts`
- `server/services/event-engine/causal-hypothesis/quality.ts`
- `server/services/event-engine/causal-hypothesis/index.ts`

模块职责：

- `types.ts`：内部输入/输出类型。
- `input.ts`：从 canonical event detail 构建 bounded model input。
- `prompt.ts`：schema 常量、prompt id/version 导出和 bounded input builder。
- `generator.ts`：调用 structured-output 模型。
- `service.ts`：编排去重、run、状态替换、projection refresh。
- `quality.ts`：结构型质量门禁。
- `index.ts`：对 scheduler/backfill 暴露小接口。

不要把原因推理塞进：

- `impact.ts`：原因层不是影响层。
- `investment-view.ts`：projection 只消费结果，不生成原因。
- `scheduler.ts`：scheduler 只负责触发，不承载原因业务逻辑。

数据库读写使用独立模块：

- `server/database/causal-hypotheses.ts`

职责：

- 初始化 `event_causal_hypotheses`
- 初始化 `event_causal_hypothesis_runs`
- 写入 run
- 写入/替换 active 原因集合
- 派生 `causalStatus`
- 提供 projection/detail 读取接口
- 提供 ops/status 统计查询
- 声明原因假设相关 SQL ownership

`server/database/events.ts` 不承载原因假设表读写，只在组装 `EventDetail` 或 projection canonical input 时通过小接口消费结果。

SQL ownership 单独声明，owner 仍为 `investment-event`。实现时在 `server/database/sql-ownership.ts` 的 `SCHEMA_OWNER_BASELINE` 增加 `event_causal_hypotheses` 和 `event_causal_hypothesis_runs`，并在 `server/database/causal-hypotheses.ts` 导出 `CAUSAL_HYPOTHESIS_SQL_DECLARATIONS`，沿用 `event-projections.ts` 的 `declareSqlAccess()` 模式。

类型放置边界：

- `shared/types.ts`：只放 provider-facing contract 类型，例如 `InvestmentCausalStatus`、`InvestmentCausalHypothesis`、`InvestmentEvidenceSpan`。
- `server/services/event-engine/causal-hypothesis/types.ts`：放模型输入、模型输出、run input、内部候选和质量门禁结果。
- `server/database/causal-hypotheses.ts`：放数据库 row/input 类型，或仅保留文件内私有类型。

`shared/` 不承载内部模型调用、队列、run 写入或数据库 row 细节。

### 2.1 `CausalHypothesis`

职责：

- 表达一个事件可能为什么发生。
- 区分明示原因、推断原因和原因不足。
- 绑定 evidence / fact 引用。
- 保存模型版本、输入范围、生成时间和生命周期状态。

非职责：

- 不计算 directional view。
- 不计算 materiality、tradability、authority。
- 不生成 what-to-watch-next 或 action recommendation。
- 不表示相关事件列表。

### 2.2 大模型生成器

职责：

- 基于同一个 canonical event 内的 title、summary、facts、evidence、entities、markets、topics、timeline 和 source metadata 生成原因假设。
- 允许输出原因不足。
- 输出结构化结果。
- 从现有 prompt/schema 体系加载版本化 schema / prompt。

非职责：

- 不自由检索外部网页。
- 不跨事件全库搜索。
- 不直接写数据库。
- 不内联维护完整 prompt / schema。

### 2.3 后端原因假设服务

职责：

- 调用大模型生成器。
- 校验结构化输出。
- 写入 `event_causal_hypotheses`。
- 标记状态、版本和重算结果。
- 维护 current effective 视图。

非职责：

- 不用规则穷举原因判断。
- 不把原因假设转换成最终投资结论。

### 2.4 现有代码接入点

当前事件写入路径在 `server/services/event-engine/scheduler.ts` 的 `persistResolvedEvent()` 中完成：

1. 在事务内写 canonical event、evidence、facts、entity links 和 timeline。
2. 事务提交后调用 `refreshInvestmentProjectionForEvent()` 刷新投资 projection。

原因假设生成必须接在事务提交之后，不能进入 `eventTable.withTransaction()`，避免模型调用、超时或重试拖住 canonical event 入库。

建议接入顺序：

```text
persistResolvedEvent()
  -> canonical event transaction commits
  -> trigger causal hypothesis generation request
  -> refresh projection immediately with current causal state
  -> causal hypothesis generation completes asynchronously
  -> causal service writes active/unknown/failed state
  -> causal service refreshes projection again
```

因此：

- `scheduler.ts` 只调用 `requestCausalHypothesisGenerationForEvent(eventId, reason)` 这类小接口，不承载原因业务逻辑。
- `causal-hypothesis/service.ts` 负责去重、run 状态、生成、active 替换和生成完成后的 projection refresh。
- `projection-pipeline.ts` 继续负责把 canonical detail 投成 provider-facing investment detail；它只读取已有 `causalStatus` / `causalHypotheses`，不能调用模型。
- `server/database/events.ts#getEventDetail()` 可以通过 `server/database/causal-hypotheses.ts` 的读取接口附加原因结果，但不能直接读写原因表 SQL。
- `scripts/backfill-causal-hypotheses.ts` 复用同一个 service 入口，不绕过去重、质量门禁和 run 记录。
- `scripts/backfill-causal-hypotheses.ts` 第一版不提供 `--force`，manual backfill / repair 不能强制对同 key 再生成一次。

## 3. 初始数据模型

新增表：`event_causal_hypotheses`。

迁移方式沿用当前数据库模块风格：在 `CausalHypothesisTable.init()` 中使用 `CREATE TABLE IF NOT EXISTS`、`CREATE INDEX IF NOT EXISTS` 和私有 `ensureColumn()` 补齐新增列；第一版不新增独立 migration runner。新增表必须在 `getCausalHypothesisTable()` 初始化时创建，和 `EventProjectionTable.init()` 一样受 `INIT_TABLE !== "false"` 控制。

候选字段：

- `hypothesis_id TEXT PRIMARY KEY`
- `event_id TEXT NOT NULL`
- `statement TEXT NOT NULL`
- `cause_type TEXT NOT NULL`
- `basis TEXT NOT NULL`
- `confidence REAL NOT NULL`
- `rationale TEXT NOT NULL`
- `evidence_ids_json TEXT NOT NULL DEFAULT '[]'`
- `fact_ids_json TEXT NOT NULL DEFAULT '[]'`
- `evidence_spans_json TEXT NOT NULL DEFAULT '[]'`
- `model_provider TEXT`
- `model_name TEXT`
- `prompt_version TEXT`
- `input_checksum TEXT NOT NULL`
- `generation_run_id TEXT`
- `status TEXT NOT NULL`
- `created_at INTEGER NOT NULL`
- `superseded_at INTEGER`
- `metadata_json TEXT NOT NULL DEFAULT '{}'`

建议索引：

- `(event_id, status, confidence DESC)`
- `(event_id, input_checksum)`
- `(generation_run_id)`

active 集合约束：

- 每个 event 最多 3 条 `active` 原因假设。
- 同一 `cause_type` 最多 1 条 `active`。
- 默认详情只读取 `active`。
- 旧版本或被替代结果标记为 `superseded`。
- `event_causal_hypotheses` 不复制 `input_snapshot_json` 或 `output_snapshot_json`。
- 原因假设通过 `generation_run_id` 关联 `event_causal_hypothesis_runs` 中的输入/输出快照。

active 排序优先级：

- `basis`
- `confidence`
- evidence authority
- selected evidence order
- stable `causeType` order

新增表：`event_causal_hypothesis_runs`。

候选字段：

- `run_id TEXT PRIMARY KEY`
- `event_id TEXT NOT NULL`
- `input_checksum TEXT NOT NULL`
- `input_snapshot_json TEXT NOT NULL DEFAULT '{}'`
- `input_builder_version TEXT NOT NULL`
- `output_snapshot_json TEXT NOT NULL DEFAULT '{}'`
- `model_provider TEXT`
- `model_name TEXT`
- `prompt_version TEXT`
- `trigger_source TEXT NOT NULL`
- `trigger_reason TEXT`
- `retry_of_run_id TEXT`
- `status TEXT NOT NULL`
- `error_code TEXT`
- `attempt_number INTEGER NOT NULL DEFAULT 1`
- `next_attempt_at INTEGER`
- `locked_at INTEGER`
- `lock_owner TEXT`
- `lease_expires_at INTEGER`
- `created_at INTEGER NOT NULL`
- `started_at INTEGER`
- `finished_at INTEGER`
- `metadata_json TEXT NOT NULL DEFAULT '{}'`

`status` 候选值：

- `pending`
- `running`
- `succeeded`
- `unknown`
- `failed`

`trigger_source` 候选值：

- `auto_event_ingest`
- `facts_updated`
- `manual_backfill`
- `manual_repair`
- `retry`

`event_causal_hypothesis_runs` 同时承担持久队列和 run 审计记录：

- 不新增独立 queue table。
- 不使用纯内存队列作为事实源。
- `pending` 表示已接受生成请求但尚未执行。
- `running` 表示某个 worker 已通过 lease claim。
- `succeeded` 表示至少有一个有效 active hypothesis 写入，或有效结果完成并替换 active。
- `unknown` 表示模型明确返回材料不足，且当前 active 集合已按规则清空。
- `failed` 表示技术失败、schema invalid、引用全 invalid 或 worker lease 超时。

队列 claim 规则：

- worker 从 `pending` 且 `next_attempt_at <= now` 的 run 中按投资优先级和创建时间取任务。
- claim 时写入 `status = "running"`、`locked_at`、`lock_owner`、`lease_expires_at`。
- `running` 且 `lease_expires_at < now` 的任务视为 worker timeout，标记为 `failed` 并保存对应 `next_attempt_at`。
- 同一 `event_id + input_checksum + prompt_version + model_name` 如果已经存在 `pending` / `running` / `succeeded` / `unknown`，新请求跳过。
- 同 key 最近结果为 `failed` 时，允许在 `next_attempt_at` 到期后插入新的 `pending` retry run，并递增 `attempt_number`。
- retry run 必须写入 `trigger_source = "retry"`。
- retry run 必须写入 `retry_of_run_id`，指向触发这次重试的上一条失败 run。
- retry run 的 `trigger_reason` 必须记录可读重试原因，例如 timeout、schema invalid、invalid references 或 provider error。
- 非 retry run 的 `retry_of_run_id` 为空。
- `model_provider` 写入 diagnostics 和审计；第一版生成去重 key 仍按已确认的 `model_name` 维度执行。
- 自动调度轮次顺序固定为：恢复超时 `running` -> 入队 due retry -> claim pending。
- 手动 backfill / repair 命中 due failed run 时，调用同一套 retry 入队服务路径。
- 自动调度轮次每轮最多成功创建 1 条 due retry run。
- 自动 due retry 候选排序复用后端投资优先级；同优先级下按 `nextAttemptAt`、`createdAt`、`runId` 稳定排序。
- 手动 backfill / repair 不继承自动调度每轮 1 条的上限。
- 自动调度本轮创建的 due retry run 可以参与同一轮 pending claim。
- 本轮新建 due retry run 不获得特殊优先级，仍按普通 pending claim 查询和排序处理。
- 普通 pending claim 对初始自动 run、manual run 和 retry run 使用同一套排序：后端投资优先级、`nextAttemptAt`、`createdAt`、`runId`。
- `trigger_source`、`trigger_reason` 和 `retry_of_run_id` 不改变 claim 排序。
- pending claim 必须通过数据库条件更新原子完成，不能依赖默认单并发或进程内锁。
- claim 更新影响行数为 1 才算成功；影响行数为 0 时重新查询或结束本轮 claim。
- 模型调用不放在 claim 数据库事务里。
- 结果写回必须用 `runId`、`status = "running"`、`lockOwner`、`leaseExpiresAt > now` 做条件更新。
- 结果写回影响行数为 0 时，当前 worker 不得再改写该 run、不得标记 failed、不得创建 retry；只能写脱敏本地诊断，后续由超时恢复或当前所有者处理。
- 第一版不支持 lease 续租；worker 不得通过心跳续租、保活字段、续租循环或续租 API 延长 `leaseExpiresAt`。
- 模型调用达到 45 秒超时时，worker 必须主动取消或停止等待 provider 请求，并按 `causal_hypothesis_model_timeout` 处理。
- 临时 provider 错误按 `causal_hypothesis_provider_transient_error` 写 failed，并进入统一 retry。
- 永久 provider 错误按 `causal_hypothesis_provider_permanent_error` 写 failed，`nextAttemptAt = null`，不进入普通 retry。
- 修复 provider 配置后，普通 retry 仍不得自动重跑永久 provider 终止失败。
- 显式强制修复入口不进入第一版实现范围。
- 永久 provider 错误进入 ops/status light 聚合摘要，但原始 provider 错误和 run 级定位只在 diagnostics 脱敏展示。

队列并发规则：

- 自动 worker 第一版默认 `concurrency = 1`。
- `processPendingCausalHypothesisRuns()` 默认只 claim 1 个 pending run。
- 手动 backfill 脚本默认 `--concurrency 1`。
- 手动 backfill 第一版最多允许 `--concurrency 2`。
- 并发只影响同时 claim/执行的 run 数量，不改变去重 key、lease 语义或 active 替换规则。

执行时限与重试规则：

- 单次 structured-output 模型调用超时为 45 秒。
- run lease 为 120 秒。
- 同一 key 最大尝试次数为 4 次，即 1 次初始生成 + 3 次 retry。
- retry backoff 为 attempt 1 失败后 5 分钟，attempt 2 失败后 30 分钟，attempt 3 失败后 2 小时。
- attempt 4 失败后保持 `failed`，不再创建 retry run。
- `failed` 不阻塞事件入库。
- `failed` 不清除已有 active 原因假设。
- `failed` 默认不进入 provider detail，只在 diagnostics 暴露。

索引：

- `(event_id, created_at DESC)`
- `(input_checksum, status)`
- `(event_id, input_checksum, prompt_version, model_name, status)`
- `(status, next_attempt_at, created_at, run_id)`
- `(status, lease_expires_at)`

`created_at` 是 run 被接受入队或创建审计记录的时间，必须在插入时写入；`started_at` 只在 claim 成功后写入。pending run 尚未开始，不能要求 `started_at NOT NULL`，也不能用 `started_at` 作为 pending claim 的稳定排序依据。

数据库读写接口第一版固定放在 `CausalHypothesisTable`：

- `init(): Promise<void>`
- `enqueueRun(input: CausalHypothesisRunInsertInput): Promise<CausalHypothesisRunRecord>`
- `findExistingRunForKey(input: CausalHypothesisDedupeKey): Promise<CausalHypothesisRunRecord | undefined>`
- `claimNextPendingRun(input: { now: number; lockOwner: string; leaseMs: number }): Promise<CausalHypothesisRunRecord | undefined>`
- `markTimedOutRuns(input: { now: number; limit: number }): Promise<number>`
- `listDueFailedRunsForRetry(input: { now: number; limit: number }): Promise<CausalHypothesisRunRecord[]>`
- `finishRunSucceeded(input: CausalHypothesisRunSuccessInput): Promise<boolean>`
- `finishRunUnknown(input: CausalHypothesisRunUnknownInput): Promise<boolean>`
- `finishRunFailed(input: CausalHypothesisRunFailureInput): Promise<boolean>`
- `replaceActiveHypotheses(input: ReplaceActiveCausalHypothesesInput): Promise<void>`
- `readCausalProjection(eventId: string): Promise<CausalHypothesisProjection>`
- `getCausalStatusForEvent(eventId: string): Promise<InvestmentCausalStatus>`
- `getOpsStatusSnapshot(input: { diagnostics: boolean; now: number }): Promise<CausalHypothesisOpsStatus>`

业务服务第一版只暴露小接口，避免 scheduler、API、MCP 或 frontend 直接碰队列细节：

- `enqueueCausalHypothesisGeneration(input: { eventId: string; triggerSource: CausalHypothesisTriggerSource; triggerReason?: string; now?: number }): Promise<CausalHypothesisEnqueueResult>`
- `processPendingCausalHypothesisRuns(input?: { limit?: number; lockOwner?: string; now?: number }): Promise<CausalHypothesisWorkerResult>`
- `enqueueDueCausalHypothesisRetries(input?: { limit?: number; now?: number }): Promise<CausalHypothesisRetryEnqueueResult>`
- `readCausalProjection(eventId: string): Promise<CausalHypothesisProjection>`
- `getCausalHypothesisOpsStatus(input: { diagnostics: boolean; now?: number }): Promise<CausalHypothesisOpsStatus>`

生成队列去重 key：

```text
event_id + input_checksum + prompt_version + model_name
```

`trigger_source` / `trigger_reason` 不参与生成队列去重 key。
`retry_of_run_id` 不参与生成队列去重 key。

去重规则：

- 同 key 已有 `succeeded` 或 `unknown` run：不再生成。
- 同 key 已有 `pending` 或 `running` run：不重复排队。
- 同 key 之前是 `failed`：允许按退避策略重试。
- prompt 或 model 版本变化时 key 变化，可以重新生成。
- 触发来源变化不改变 key；同一输入不能因为 `auto_event_ingest`、`manual_backfill`、`manual_repair` 或 `retry` 来源不同而重复排队。
- retry 链接变化不改变 key；`retry_of_run_id` 只用于追溯上一条失败 run。
- manual backfill / repair 不能绕过同 key 的 `pending` / `running` / `succeeded` / `unknown` run。
- 去重跳过时不写 `skipped` run；`event_causal_hypothesis_runs` 只记录真实生成任务或真实生成尝试。

实现时可以用代码级 idempotency check；如果使用 partial unique index，只约束 `pending` / `running` 这类未完成状态，不能阻断 `failed` 后重试。

如果未来需要对同 key 显式重跑，必须新增明确的 `--force` 语义，不能通过改变 `trigger_source` 绕过去重。
未来 `--force` 必须记录 `force_reason` 和操作者来源，并单独说明 active 替换、projection refresh、审计和风险控制关系。

structured-output schema / prompt 边界：

- 沿用现有 `server/services/event-engine/prompt-registry.ts` 模式。
- `server/services/event-engine/prompts/causal-hypothesis-generator.ts` 放 prompt definition，并注册到 `EVENT_ENGINE_PROMPTS`。
- `server/services/event-engine/causal-hypothesis/prompt.ts` 放 schema 常量、prompt id/version 导出和 bounded input builder。
- `server/services/event-engine/causal-hypothesis/generator.ts` 加载 `prompt.ts` 并调用 structured-output 模型。
- 作为版本化资源维护。
- `promptVersion` 和 `inputBuilderVersion` 进入 generation run 和 `input_checksum`。
- schema 变化触发新的去重 key，可以重新生成。
- generator 只加载当前版本并调用模型。
- 测试覆盖 schema 校验和 invalid output 降级。

prompt definition 第一版固定为：

- `id = "causal-hypothesis-generator"`
- `version = "causal-hypothesis-generator-v1"`
- prompt 必须要求模型只基于输入中的 canonical event、facts、evidence、entities、markets、topics、timeline 和 source metadata 推理。
- prompt 必须要求模型把原因明确标为 `basis = "stated"` 或 `basis = "inferred"`；无法从材料形成可审计原因时返回 `status = "unknown"`。
- prompt 不得要求模型输出 directional view、materiality、tradability、authority、what-to-watch-next 或 action recommendation。
- prompt 不得要求模型访问外部网页、补充未给定事实、跨事件检索或猜测未出现主体。
- prompt 文案和 schema 必须作为版本化代码资源进入测试，不能只写在文档或测试字符串里。

schema / fixture 测试第一版固定覆盖：

- `server/services/event-engine/causal-hypothesis/__fixtures__/available-output.json`：1-3 条有效原因，覆盖 `stated` 和 `inferred`。
- `server/services/event-engine/causal-hypothesis/__fixtures__/unknown-output.json`：`status = "unknown"`、空 hypotheses、`unknownReason` 必填。
- `server/services/event-engine/causal-hypothesis/__fixtures__/invalid-output.json`：非法 basis、超出 3 条、缺 evidence 引用、confidence 越界或未知 cause type。
- schema 测试断言 invalid output 不写 active 原因，并把 run 关闭为 `failed` 或按具体失败分类写入固定 error code。
- prompt registry 测试断言 `EVENT_ENGINE_PROMPTS.causalHypothesisGenerator` 存在，id/version 与 `prompt.ts` 导出一致。

大模型配置边界：

- 原因假设生成使用独立 `defineLlmProfile` 配置档，不复用 subject-role 或 watch-target 的配置。
- profile id 使用 `event-engine-causal-hypothesis`。
- `envPrefix` 使用 `EVENT_ENGINE_CAUSAL_HYPOTHESIS`。
- 默认模型可以沿用现有 event-engine 小模型默认值：`openai = gpt-5.4-mini`，`minimax = MiniMax-M2.7`。
- 独立环境变量包括 `EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_ENABLED`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_PROVIDER`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_BASE_URL`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_API_KEY`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_MODEL`。
- 调用超时使用独立 `EVENT_ENGINE_CAUSAL_HYPOTHESIS_TIMEOUT_MS`，默认 45 秒，最大 45 秒。
- 配置未启用或缺少必要配置时，自动触发不得写入新的 `pending` run，也不得把它伪装成模型失败。
- 配置未启用或缺少必要配置必须进入 ops/status 摘要和 diagnostics，表达为原因生成器 disabled / missing config。

模型输出顶层：

- `status`: `available` / `unknown`
- `confidence`
- `hypotheses`
- `unknownReason`

校验规则：

- `status = "available"` 时，`hypotheses` 必须有 1-3 条。
- `status = "unknown"` 时，`hypotheses` 必须为空，`unknownReason` 必填。
- 技术失败不由模型输出表达，而由 generator / run 捕获为 `failed`。

`output_snapshot_json` 保存模型输出经系统解析和校验后的结构化、脱敏快照，用于审计和回放。

第一版快照可以包含：

- 模型返回的顶层 `status`
- `unknownReason`
- 模型返回的 hypotheses 结构化字段
- 每条 hypothesis 引用的 evidence/fact id
- 每条 hypothesis 的 `confidence`
- 系统接收的 hypothesis 数量
- 被校验丢弃的 hypothesis 数量和原因
- validation error code / summary
- 最终 run status

第一版快照不得包含：

- provider 原始 response payload
- raw prompt
- 完整模型输入
- 完整原文
- provider secrets 或完整请求参数

`output_snapshot_json` 是内部审计字段，不进入 provider-facing `InvestmentCausalHypothesis`，不进入 frontend，ops/status light 不暴露；diagnostics 默认只暴露 accepted / dropped / invalid 的计数和错误摘要，不返回完整输出快照。

`output_snapshot_json` 不参与 `input_checksum`，也不参与生成去重 key。它是结果和审计材料，不是模型输入条件。

输入/输出快照只保存在 `event_causal_hypothesis_runs`。成功生成后，不把 `input_snapshot_json` 或 `output_snapshot_json` 复制到 `event_causal_hypotheses`。`event_causal_hypotheses` 只保存原因假设本体、active/superseded 状态和 `generation_run_id`。

第一版不自动清理 `input_snapshot_json` 或 `output_snapshot_json`，也不做压缩归档。

原因：

- 上线初期审计、调试和回放价值最高。
- 自动清理过早会破坏问题定位。
- 快照已经是规范化、限量、脱敏后的内部审计材料。

保留扩展点：

- 后续可以增加按保留期清理。
- 后续可以增加脱敏迁移。
- 后续可以增加归档或压缩策略。

第一版实现不得默认删除、压缩或迁移快照。

快照大小上限按 JSON 序列化后的 UTF-8 字节数计算：

- `input_snapshot_json` 最大 64KB。
- `output_snapshot_json` 最大 32KB。

超限时不得保存超大文本字段，也不得把原始大字段截断后继续塞进快照。系统应保留审计骨架并丢弃低优先级摘要字段。

超限快照必须记录：

- `truncated = true`
- `originalSizeBytes`
- `storedSizeBytes`
- `truncatedFields`

必须优先保留：

- event / run / model / prompt / input builder version
- selected evidence / fact id
- evidence / fact 引用关系
- status / errorCode / validationSummary
- accepted / dropped / invalid count
- confidence 和原因类型等结构化字段

优先丢弃：

- evidence payload 短摘要
- evidence summary 摘要
- 低优先级 fact 展示摘要
- hypothesis rationale 中的长文本部分
- diagnostics 里仅用于人工阅读的示例文本

快照截断不改变 run 的生成结果状态。

规则：

- 模型输出合法、引用有效、active 替换成功时，即使输入/输出快照发生截断，run 仍为 `succeeded`。
- 模型明确返回材料不足时，即使输入/输出快照发生截断，run 仍为 `unknown`。
- 截断信息写入 run `metadata_json` 和 diagnostics，字段建议为 `snapshotTruncated = true`。
- 截断信息也保留在对应快照的 `truncated` / `originalSizeBytes` / `storedSizeBytes` / `truncatedFields` 中。
- 只有连最小审计骨架都无法保存时，run 才标记为 `failed`，`errorCode = "causal_hypothesis_snapshot_too_large"`。

当模型输出 schema 不合法，无法构造完整结构化输出快照时，仍写入最小 `output_snapshot_json`。

最小快照只包含：

- `parseStatus = "schema_invalid"`
- `errorCode`
- `validationSummary`
- `outputSizeBytes`
- model provider / model name
- prompt id/version
- input builder version
- 最终 run status

最小快照不得包含原始输出文本、provider 原始 response payload、raw prompt、完整模型输入、完整原文或 secrets。

模型单条 hypothesis 只输出：

- `statement`
- `causeType`
- `basis`
- `confidence`
- `rationale`
- `evidenceIds`
- `factIds`
- `evidenceSpans`

系统负责补：

- `hypothesisId`
- `causeTypeLabel`
- `basisLabel`
- `generatedAt`
- `generationRunId`
- `status`
- 排序和 active 截断

引用校验规则：

- `evidenceIds` 必须非空。
- 每个 `evidenceId` 必须存在于 selected evidence 输入集合。
- 每个 `factId` 必须存在于 selected facts 输入集合。
- `evidenceSpans[].evidenceId` 必须存在于 `evidenceIds`。
- 引用不存在 id 的 hypothesis 直接 invalid。
- 如果所有 hypotheses invalid，则 run 记为 `failed` 或 schema invalid，不保存原因。

部分无效处理：

- 逐条校验 hypothesis。
- 无效引用的单条 hypothesis 丢弃，并记录 `invalidHypothesisCount`。
- 只要剩余有效 hypotheses >= 1：run 仍为 `succeeded`。
- 如果全部无效：run 为 `failed`，`errorCode = "causal_hypothesis_invalid_references"`。
- diagnostics 记录无效数量和原因，但不进入 provider detail。

第一版不设置最低 `confidence` 硬阈值。

低置信但有有效 evidence 引用的 hypothesis 可以进入 active。

排序、UI 和 diagnostics 处理：

- active 排序时使用 `confidence`。
- UI 明确显示置信度或高/中/低。
- diagnostics 可统计低置信占比。

active 完整排序规则：

1. `basis = stated` 优先于 `inferred`
2. `confidence` 高优先
3. evidence 权威性高优先
4. selected evidence 排序靠前优先
5. `causeType` 稳定顺序兜底，保证结果可重复

active 选择规则：

- 同一 run 内同一 `causeType` 多条有效 hypothesis：排序最高的一条进入 active。
- 其他有效但未入选的同类型 hypothesis 写入为 `superseded`。
- 超过 3 条 active 容量的有效 hypothesis 也写入为 `superseded`。
- diagnostics 记录 `suppressedHypothesisCount`。

`cause_type` 第一版候选值：

- `policy_or_regulation`
- `macro_or_liquidity`
- `industry_supply_demand`
- `company_action`
- `market_flow_or_sentiment`
- `external_event`

`basis` 候选值：

- `stated`
- `inferred`

`basis` 只表达真实原因假设的来源类型：

- 不表达置信度；置信度由 `confidence` 表达。
- 不表达单条原因假设生命周期；生命周期由 `status` 表达。
- 不表达事件级生成状态；事件级生成状态由 `causalStatus` 表达。

`unknown` 是事件级 `causalStatus`，不是 hypothesis-level `basis`。材料不足时返回空 `causalHypotheses`。

`confidence` 第一版使用 `0..1` 小数。UI 可以显示为百分比或高/中/低，但数据合同不使用 `0..100` 投资评分语义。

`statement` 和 `rationale` 字段分工：

- `statement`：一句话说明原因假设是什么。
- `rationale`：说明系统为什么这么判断，引用了哪些输入线索。
- `evidence_ids_json` / `fact_ids_json`：提供机器可追踪引用。
- `evidence_spans_json`：提供轻量依据定位，不复制长原文。

`evidence_ids_json` 对 active 原因假设必须非空。`fact_ids_json` 可以为空；如果结构化事实参与原因判断，则必须记录对应 fact id。

`evidence_spans_json` 候选字段：

- `evidenceId`
- `field`：`title` / `summary` / `payload`
- `snippet`
- `offset`

`snippet` 只用于定位依据，不能替代 canonical evidence 原文。

`input_checksum` 只覆盖生成原因时实际喂给模型的规范化输入，而不是整个 canonical event detail。

第一版 checksum 覆盖：

- title / summary
- selected evidence title / summary / payload 摘要
- selected facts
- affected entities / markets / topics
- timeline state
- input builder version
- source kind / authority
- prompt version
- model name

不把 projection 展示字段、UI 文案、`trigger_source`、`trigger_reason`、`retry_of_run_id` 或 unrelated metadata 纳入 checksum。

`input_snapshot_json` 保存当次生成实际使用的规范化、限量后的模型输入快照，用于审计和回放。

第一版快照可以包含：

- canonical event title / summary
- selected evidence 的 id、title、summary、短 payload 摘要、source kind / authority
- selected facts 的 id、类型、方向、数值、实体和 evidence 绑定
- affected entities / markets / topics
- timeline state
- input builder version
- prompt id/version
- model provider / model name

第一版快照不得包含：

- raw prompt
- 完整原文
- 完整 provider request / response payload
- provider secrets
- frontend 展示文案或无关 metadata

`input_snapshot_json` 是内部审计字段，不进入 provider-facing `InvestmentCausalHypothesis`，不进入 frontend，ops/status light 不暴露；diagnostics 默认只暴露 checksum、prompt/model 信息和摘要级定位信息，不返回完整快照。

输入构建器必须有独立版本号，建议由 `server/services/event-engine/causal-hypothesis/input.ts` 导出，例如 `CAUSAL_HYPOTHESIS_INPUT_BUILDER_VERSION`。

规则：

- `input_builder_version` 写入 `event_causal_hypothesis_runs`。
- `inputBuilderVersion` 写入 `input_snapshot_json`。
- `input_builder_version` 参与 `input_checksum`。
- 输入选择、排序、截断、字段结构变化时必须提升 `input_builder_version`。
- `input_builder_version` 不等于 `promptVersion`；prompt 未变化但输入构建规则变化时，也必须能触发新 checksum 和重新生成。
- 生成去重 key 仍使用 `event_id + input_checksum + prompt_version + model_name`；输入构建器版本通过 `input_checksum` 影响 key。
- `output_snapshot_json` 不参与 `input_checksum` 或生成去重 key。
- `trigger_source` / `trigger_reason` 不参与 `input_checksum` 或生成去重 key。
- `retry_of_run_id` 不参与 `input_checksum` 或生成去重 key。

selected evidence / selected facts 输入上限：

- evidence 最多 5 条
- facts 最多 12 条

selected evidence 排序优先级：

- source authority 高
- primary source
- 最新 evidence
- 命中 title、primary subject 或 topic

selected facts 排序优先级：

- 有 `evidenceId`
- 有方向、数值或实体
- 与 primary subject / topic 相关

输入选择必须来自 canonical detail，并且可回放。

`status` 候选值：

- `active`
- `superseded`
- `retracted`
- `failed`

## 4. API / Projection 类型

建议新增 shared 类型：

- `InvestmentCausalStatus = "not_generated" | "pending" | "unknown" | "available" | "failed"`
- `InvestmentCausalHypothesis`
- `InvestmentEvidenceSpan`

`not_generated` 是事件级 provider 状态，不是 generation run 状态，也不是单条 hypothesis 状态。

`InvestmentCausalHypothesis` 候选字段：

- `hypothesisId`
- `statement`
- `causeType`
- `causeTypeLabel`
- `basis`
- `basisLabel`
- `confidence`
- `rationale`
- `evidenceIds`
- `factIds`
- `evidenceSpans`
- `generatedAt`

provider-facing `InvestmentCausalHypothesis` 不直接暴露：

- raw prompt
- full model input
- `inputChecksum`
- `generationRunId`
- 单条内部 `status`
- 内部 error code
- 完整 provider/model 参数

单条 `InvestmentCausalHypothesis` 不暴露 `status`。provider/detail 默认只返回 active 原因假设；事件级状态由 `causalStatus` 表达。

`InvestmentEventDetail` 新增：

- `causalStatus`
- `causalHypotheses`

`InvestmentEventBrief` 第一版不新增原因字段。

`causalStatus` 第一版由 `event_causal_hypothesis_runs` 和 active `event_causal_hypotheses` 派生，不写入 `events` 表。

派生规则：

- 有 active hypotheses：`available`
- 最近一个成功 run 是 `unknown` 且没有 active：`unknown`
- 事件不符合自动生成 eligibility，且没有 active/run 覆盖：`not_generated`
- 有排队或运行中 run：`pending`
- 事件符合自动生成 eligibility 但还没有 run：`pending`
- 事件符合自动生成 eligibility，但原因生成器关闭或缺少配置且还没有 run：provider-facing `causalStatus` 仍为 `pending`；原因生成器 disabled / missing config 只在 ops/status 暴露
- 最近一个 run 是 `failed` 且没有 active：`failed`
- 最近一个 run 是 `failed` 但仍有旧 active：用户侧返回 `available`，内部 diagnostics 显示最新 run 失败

projection checksum 需要包含：

- 当前 active `causalHypotheses`
- 派生 `causalStatus`

projection checksum 不包含：

- 历史 `superseded` 原因假设
- 未入选 active 的 suppressed / superseded 有效原因假设
- failed run diagnostics
- 内部错误信息
- 与 provider detail 无关的审计元数据
- `input_snapshot_json`
- `output_snapshot_json`
- snapshot truncation metadata
- `snapshotTruncated`

快照截断不影响 projection checksum。projection checksum 只反映 provider 会消费的当前 active 原因集合和事件级 `causalStatus`；`snapshotTruncated`、`truncatedFields`、`originalSizeBytes`、`storedSizeBytes` 等内部审计质量信息不能让 projection stale。

projection stale 规则：

- active 原因集合变化：stale。
- `causalStatus` 变化：stale。
- suppressed / superseded 审计记录变化：不 stale。
- 仅快照截断状态变化：不 stale。
- diagnostics 读取 suppressed / superseded，不通过 provider detail 读取。

## 5. 生成流程

```text
canonical event created / updated
  -> choose eligible event
  -> load canonical event detail
  -> build bounded model input
  -> compute input checksum
  -> compute idempotency key from event_id + input_checksum + prompt_version + model_name
  -> skip if same key already succeeded / unknown / pending / running
  -> create pending generation run
  -> worker claims pending run with lease
  -> call structured-output model
  -> validate output
  -> write event_causal_hypotheses
  -> finalize generation run
  -> refresh investment projection
```

代码级流程：

- 自动触发来自 `persistResolvedEvent()` 事务提交之后。
- 手动触发来自 `scripts/backfill-causal-hypotheses.ts`。
- projection rebuild 只调用 `buildInvestmentProjectionInput()` / `writeInvestmentProjection()`，不允许触发生成。
- `causal-hypothesis/service.ts` 生成完成后调用 `refreshInvestmentProjectionForEvent()`，让新的 active 原因集合进入 detail projection checksum。
- 现有 event engine worker tick 可以调用 `processPendingCausalHypothesisRuns({ limit })` 消费 run 表中的 pending 任务；手动脚本也调用同一入口。
- `processPendingCausalHypothesisRuns()` 默认单并发执行；脚本显式传参时也不能超过 2。
- 如果进程重启，未完成的 `running` 任务靠 `lease_expires_at` 恢复，不依赖内存状态。
- 如果模型调用超过 45 秒或 run lease 超过 120 秒，按技术失败进入 retry/backoff；attempt 4 失败后保持 `failed`，但不替换旧 active。

触发时机：

- 新 canonical event 创建后
- facts 变化后
- evidence 新增或替换后
- 手动 backfill / repair
- 模型版本或 prompt 版本升级

backfill 指历史数据回填：对功能上线前已经存在的历史事件补跑原因假设生成。

第一版不自动全量 backfill。

策略：

- 新事件自动生成。
- facts / evidence 更新时自动生成或重算。
- 提供手动 backfill / repair 入口。
- backfill 默认按投资优先级、小批量、低并发执行。
- 不在上线时自动扫描全部历史事件。

手动 backfill / repair 第一版作为内部 ops 能力，不新增公开 provider API。

必须提供内部脚本：

- `scripts/backfill-causal-hypotheses.ts`
- `scripts/inspect-causal-hypothesis-run.ts`
- `scripts/check-causal-hypothesis-run-consistency.ts`

backfill 脚本能力：

- `--limit`
- 优先级过滤
- `--dry-run` 或 preview
- `--concurrency`
- `--execute`
- `--event-id`
- `--run-id`
- `--include-noise`
- 第一版不提供独立 `--rate-limit-ms`、`--delay-ms` 或等价限速参数
- 第一版不支持 `--force`
- 执行结果返回 skipped count、skip reason 和 existing runId
- 执行结果返回 queued / skipped / failed counts
- 全部 skipped 时退出码为 0
- 支持稳定 `--json` 输出结构，供自动化调用
- `--json` 输出包含 `mode`、`dryRun`、`execute`、`requested`
- 真实执行时输出 `queuedCount`、`skippedCount`、`failedCount`、`queuedRunIds`、`skipped`、`errors`
- dry-run 时输出 `candidateCount`、`wouldQueueCount`、`wouldSkipCount`、`wouldFailCount`、`wouldQueueEventIds`、`wouldSkip`、`wouldErrors`、`executionBlocked`
- `--json` 不输出完整快照、raw prompt、provider 原始 payload 或 secrets

默认行为：

- 默认 dry-run / preview。
- 真实执行必须显式传 `--execute`。
- dry-run 输出将处理的 event 数量、排序前若干 eventId、预计模型调用数量。
- dry-run JSON 必须用 `would*` 字段和 `executionBlocked` 表达预估结果，不能用真实执行字段表达预估结果。
- 批量候选默认只包含 `actionable` / `watch`，不包含 `noise`。
- `noise` 只能通过精确 `--event-id` 或显式 `--include-noise` 进入候选。
- 批量候选默认复用后端投资排序，不新增原因生成专属优先级。
- `--limit` 必须在候选过滤和完整排序之后应用。
- 必须要求 `--limit`，除非传了精确定位参数 `--event-id` 或 `--run-id`。
- 默认 limit 上限保守，例如最大 100。
- `--concurrency` 默认 1，第一版最大 2；`0`、负数、小数、非数字、空字符串和超过 2 的值按参数解析失败处理。
- 第一版的调用压力控制只通过 `--limit` 和 `--concurrency` 完成，不另设 `--rate-limit-ms` / `--delay-ms`，避免出现“排队数、并发数、延迟”三套互相遮蔽的控制口径。
- 批量排序固定为：`actionable` 优先、`watch` 其次、显式包含时 `noise` 最后；同 bucket 内按投资分数、事件时间、`eventId` 排序。
- 投资分数复用现有投影排序权重：`materialityScore * 0.4 + tradabilityScore * 0.35 + authorityScore * 0.25`。
- 事件时间复用投影排序口径：`latestLifecycleAt ?? publishedAt ?? ingestedAt ?? 0`。

运行记录查看脚本能力：

- 必须要求 `--run-id`。
- 默认只输出 run 摘要、状态、错误摘要、checksum、版本信息、计数和截断信息。
- 必须显式传 `--include-snapshots` 才能输出完整 `input_snapshot_json` / `output_snapshot_json`。
- 传 `--include-snapshots` 后输出已存储快照内容，不对快照内普通文本字段再做第二层隐藏。
- 即使传 `--include-snapshots`，仍不得输出 provider secrets、raw prompt、provider 原始 request/response payload。
- `--include-snapshots` 必须和 `--run-id` 一起使用；只有 `--event-id` 时不得打印完整快照。
- `--event-id` 可以用于列出该事件下的 run 摘要和对应 `runId`，帮助操作者再精确选择某一次 run。
- `--event-id` 默认按创建时间或开始时间倒序列最近 20 条 run。
- `--event-id` 支持 `--limit`，最大 100。
- `--event-id` 支持 `--status pending|running|succeeded|unknown|failed` 过滤。
- run 摘要必须包含 `triggerSource` / `triggerReason` / `retryOfRunId`。

数据一致性检查脚本能力：

- 本地只读检查当前保留 run 表。
- 检查 `status = "failed"` 且 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 run。
- 报告缺少样例 run 自身持久化 `runId`、同一 run 记录持久化 `eventId` 或同一 run 记录持久化 `finishedAt` 的记录。
- 缺少 `finishedAt` 时，标记同时影响 `permanentProviderErrorSamples` 和 `latestPermanentProviderErrorAt`。
- 缺少 `provider`、`model`、`httpStatus`、`requestId` 或 `errorSummary` 时，不作为一致性 finding；这些字段按 diagnostics 规则可返回 `null`。
- `findingsLimit` 只限制 `findings[]` 返回数量，不限制 `summary` 的全量统计。
- 全量 findings 必须先稳定排序，再应用 `findingsLimit`。
- 排序优先级为：影响 `latestPermanentProviderErrorAt` 优先、`missingFields` 数量多优先、同一 run 记录可用持久化时间倒序、`runId` 升序、`eventId` 升序。
- 可用持久化时间依次取同一 run 记录的 `finishedAt`、`startedAt`、`createdAt` 中第一个非空值；不得使用 provider 时间、查询时间、脚本扫描时间、本地日志时间或当前时间。
- 缺少持久化时间、`runId` 或 `eventId` 时，在对应排序维度排在有值的 finding 后面。
- 命令行参数名为 `--findings-limit`。
- 省略 `--findings-limit` 时，`findingsLimit = 100`。
- 显式传入 `--findings-limit` 时，必须是 `1..1000` 的十进制整数。
- `0`、负数、小数、非数字、空字符串和超过 `1000` 的值按参数解析失败处理。
- 不得自动截断超过 `1000` 的值，也不得对小数取整。
- 默认可输出人读摘要，必须支持稳定 `--json`。
- `--json` 顶层包含 `schemaVersion`、`mode`、`exitCode`、`durationMs`、`requested`、`summary`、`findings` 和 `errors`。
- `schemaVersion = 1`。
- `mode = "causal_hypothesis_run_consistency_check"`。
- `requested` 至少包含规范化后的 `findingsLimit`。
- `summary` 至少包含 `checkedCount`、`permanentProviderErrorCount`、`sampleIneligibleCount`、`missingRunIdCount`、`missingEventIdCount`、`missingFinishedAtCount`、`findingsReturned` 和 `findingsTruncated`。
- `findings[]` 每项包含 `target`、`missingFields`、`affects` 和 `recommendedAction`。
- `findings[].target` 固定包含 `scope = "run"`、`runId` 和 `eventId`；缺失字段使用 `null`。
- `findings[].missingFields` 只允许 `runId`、`eventId` 和 `finishedAt`。
- `findings[].affects` 只允许 `permanentProviderErrorSamples` 和 `latestPermanentProviderErrorAt`。
- `findings[].recommendedAction = "repair_run_record_consistency"`。
- `errors[]` 每项包含 `target`、`errorCode`、`phase`、`retryable` 和 `message`。
- `errors[].target` 第一版只允许 `target.scope = "global"`。
- `errors[]` 第一版 `errorCode` 只允许 `invalid_arguments`、`database_unavailable` 和 `unexpected_runtime_error`。
- `errors[]` 第一版 `phase` 只允许 `argument_parse`、`database_scan` 和 `runtime`。
- `invalid_arguments` / `argument_parse` 的 `retryable = false`。
- `database_unavailable` / `database_scan` 的 `retryable = true`。
- `unexpected_runtime_error` / `runtime` 的 `retryable = true`。
- 数据一致性问题只进入 `findings[]`，不进入 `errors[]`；检查完成但发现 findings 时，`exitCode = 2` 且 `errors = []`。
- 参数、数据库或运行时失败时，`findings = []`。
- `message` 只供人读，机器判断只能依赖 `target`、`errorCode`、`phase` 和 `retryable`。
- `message` 必须由脚本生成并脱敏，不得包含 raw exception、SQL、堆栈、provider 原始报错、provider 原始 request / response payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential 或完整配置。
- 不输出 `wouldErrors[]`，也不输出 backfill 专属错误码。
- 检查完成且没有 findings 时退出 `0`；检查完成但发现一致性问题时退出 `2`；参数、数据库或运行时失败时退出 `1`。
- `exitCode` 必须等于进程实际退出码。
- 非 `--json` 模式可以输出简短人读摘要，但退出码必须和 `--json` 完全一致：无 findings 退出 `0`，有 findings 退出 `2`，参数、数据库或运行时失败退出 `1`。
- 非 `--json` 模式不得因为输出是人读摘要而在发现 findings 时退出 `0`；需要结构化字段的自动化必须使用 `--json`，只需要告警语义的本地 cron / launchd 可以依赖进程退出码。
- 不写数据库，不创建 run，不重试 run，不修复 run，不刷新 projection，不替换 active 原因假设。
- 不提供 `--repair`、`--fix`、`--execute` 或等价变更模式。
- 不提供可通过环境变量、配置、hidden flag 或 debug mode 开启的修复路径。
- 遇到 `--repair`、`--fix`、`--execute` 或等价变更参数时按参数解析失败处理。
- `recommendedAction = "repair_run_record_consistency"` 只表示后续应走单独的数据修复流程，不表示当前脚本能执行修复。
- JSON、stderr 和本地日志不得输出 provider 原始 payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential、完整配置、SQL 或 stack trace。
- 非 `--json` 模式的人读摘要遵守同一敏感信息边界；stderr 和本地日志只供人读诊断，不作为机器契约。

边界：

- provider API 只读结果，不触发生成。
- frontend 详情页不提供“立即生成原因”按钮。
- 本地 MCP 不提供触发 backfill 的 public tool。
- ops/manual repair 可以触发小批量补跑。
- 数据一致性检查脚本不进入 ops/status light，也不作为公开 provider API、frontend 按钮或 MCP public tool。

provider / MCP / frontend 接入方式：

- `GET /api/investment-events/:id` 继续通过 `InvestmentQueryService.getEventDetail()` 返回 `InvestmentProviderEventDetailResponse`，只在 `InvestmentEventDetail` 上增加原因字段，不新增生成端点。
- provider detail 读取 projection detail；projection 缺失或 stale 时可以走现有 projection repair，但 repair 只能读取已保存原因结果，不能触发原因生成。
- `server/mcp/projection.ts#toMcpEventDetail()` 只把 provider detail 中已经存在的 `causalStatus` 和 active 原因投成 MCP 结构；debug 模式最多暴露原因自身 id、evidence/fact 引用和状态，不暴露 run input/output snapshot、raw prompt、provider 原始 payload、trigger source、retry 链或内部错误文本。
- `src/routes/events.$eventId.tsx` 在详情页展示“为什么会发生”投资解释区；`available` 展示 active 原因，`unknown` 展示材料不足说明，`pending` / `not_generated` / `failed` 使用降级文案，不提供触发生成、强制重跑或查看内部 run 的按钮。
- frontend 只消费 provider-facing 类型，不重新计算 `causalStatus`、原因排序、eligibility、投资优先级或失败分类。

第一版生成队列复用现有 event engine 的 worker / scheduler / backfill 体系。

实现边界：

- 新增原因假设生成模块和 run 表。
- 由现有 worker / scheduler 在合适时机触发。
- manual backfill / repair 走同一套模块。
- ops/status 后续扩展原因生成 eligible 覆盖率、失败率、队列状态、策略跳过数量、配置阻塞数量和永久 provider 错误聚合摘要。
- 因缺少持久化 `runId`、`eventId` 或 `finishedAt` 不能进入 `permanentProviderErrorSamples[]` 的 run，由本地数据一致性检查脚本报告，不塞进 ops/status light。
- 不新增独立 daemon。
- 不新增独立服务生命周期命令。

ops/status 集成边界：

- light 状态只给摘要：`eligibleCoverage`、失败率、pending 数量、`notGeneratedCount`、`blockedByGeneratorConfigCount`、`permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt`。
- light 状态展示原因生成器配置状态：是否启用、provider、model、缺失配置项数量。
- light 状态新增固定顶层对象 `causalHypothesis`，不把原因字段散落到 `llm`、`quality` 或 `health`。
- `causalHypothesis` light 字段固定为：`enabled`、`provider`、`model`、`promptId`、`promptVersion`、`missingConfigCount`、`eligibleEventCount`、`availableEventCount`、`pendingEventCount`、`failedEventCount`、`notGeneratedEventCount`、`blockedByGeneratorConfigCount`、`pendingRunCount`、`runningRunCount`、`permanentProviderErrorCount`、`latestPermanentProviderErrorAt`。
- `causalHypothesis` light 不输出 `eventId`、`runId`、`inputChecksum`、`requestId`、`errorSummary`、样例数组、原始错误列表、完整缺失配置项名称、raw prompt、完整模型输入、完整模型输出或 provider 原始 payload。
- light 状态必须始终返回 `permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt`。
- `permanentProviderErrorCount` 统计当前保留 run 表里所有 `status = "failed"` 且 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 run，不受 samples 字段完整性影响。
- `latestPermanentProviderErrorAt` 只从永久 provider failed run 中已有持久化 `finishedAt` 的 run 取最大值；`permanentProviderErrorCount > 0` 且没有可用 `finishedAt` 时返回 `null`。
- diagnostics 模式展示：最近 failed runs、unknown 比例、平均耗时、重试次数、按 event family 的覆盖率。
- diagnostics 模式可以展示缺失配置项名称、prompt id/version、实际使用的 provider/model、被配置阻塞的少量 eventId 样例。
- diagnostics 模式下原因生成详情仍放在 `causalHypothesis` 对象内，通过额外 diagnostics 字段扩展，不新增第二个顶层对象。
- diagnostics 模式必须固定返回 `permanentProviderErrorSamples` 数组，展示少量永久 provider 错误 run 样例。
- `permanentProviderErrorSamples[]` 的样例对象固定包含 `runId`、`eventId`、`finishedAt`、`provider`、`model`、`httpStatus`、`errorType`、`requestId` 和 `errorSummary`。
- `runId`、`eventId`、`finishedAt` 和 `errorType` 来自 run 记录或后端归一化错误分类，必须存在。
- `runId` 只能来自样例对应 failed run 自身的持久化主键，不得为 `null`。
- `runId` 不得从本地日志行、provider request id、provider correlation id、provider payload、provider message、provider 原始报错、provider 原始 response payload、`errorSummary`、stack trace 或异常字符串中解析。
- `runId` 不得使用 `retry_of_run_id`、被重试 run、触发 retry 的 run、阻止 retry 的 `existingRunId`、其他关联 run 或新建 retry run 的 id 替代样例 failed run 自身主键。
- `permanentProviderErrorSamples[]` 候选必须有样例对应 failed run 自身持久化主键；缺失时不得进入样例数组。
- `eventId` 只能来自同一 run 记录保存的 canonical event 绑定，不得为 `null`。
- `eventId` 不得从 provider payload、provider message、provider 原始报错、provider 原始 response payload、`errorSummary`、stack trace、本地日志行或异常字符串中解析。
- `eventId` 不得用当前 canonical event lookup、当前 projection lookup、`retry_of_run_id` 链或其他历史 run 替代缺失的 run 记录事件绑定。
- `permanentProviderErrorSamples[]` 候选必须有同一 run 记录持久化 `eventId`；缺失时不得进入样例数组。
- `finishedAt` 只能来自同一 run 记录的持久化完成时间，不得为 `null`。
- `finishedAt` 不得使用 provider 返回时间、provider error timestamp、模型输出时间、ops/status 查询时间、脚本扫描时间、scheduler 发现失败时间、本地日志时间或重新推导出的时间。
- `finishedAt` 不得从 provider message、provider 原始报错、provider 原始 response payload、`errorSummary`、stack trace、本地日志行或异常字符串中解析。
- `permanentProviderErrorSamples[]` 候选必须有同一 run 记录持久化 `finishedAt`；缺失时不得进入样例数组。
- `latestPermanentProviderErrorAt` 必须使用 run 记录 `finishedAt` 的最大值，缺失时不得合成替代时间。
- `provider`、`model`、`httpStatus`、`requestId` 和 `errorSummary` 缺失时返回 `null`，不得省略字段。
- `provider` 和 `model` 只能来自本系统发起该 run 时已知的调用上下文或配置元数据。
- `provider` / `model` 可用来源包括 run 记录中保存的 provider / model 标识、本次 run 创建或模型调用时选中的 provider / model 配置，以及 retry run 实际使用的输入身份和调用上下文。
- run 记录、输入身份和调用上下文都无法确认 provider 时，返回 `provider = null`。
- run 记录、输入身份和调用上下文都无法确认 model 时，返回 `model = null`。
- 不得从 provider message、provider 原始报错文本、`errorSummary`、provider 原始 response payload、stack trace、本地日志行或异常字符串中解析 `provider` 或 `model`。
- 不得从 `requestId`、`httpStatus`、`errorType`、provider 原始错误码或本地错误码映射出 `provider` 或 `model`。
- 不得为了填充字段而猜测、生成、拼接或伪造 `provider` 或 `model`。
- `provider` 和 `model` 各自最多 128 个 Unicode code point；128 个合法，129 个非法。
- `provider` / `model` 长度不得按 UTF-8 字节数或 JavaScript UTF-16 code unit 计算，不得使用 JavaScript `string.length` 作为最终长度判定口径。
- 调用上下文或配置元数据中的 provider 标识超过 128 个 Unicode code point 时，必须返回 `provider = null`。
- 调用上下文或配置元数据中的 model 标识超过 128 个 Unicode code point 时，必须返回 `model = null`。
- 不得裁剪、追加省略号、保留不完整片段、哈希、重编码或压缩 `provider` / `model` 来满足长度上限。
- `errorType` 必须是第一版后端归一化枚举，允许值固定为 `authentication_failed`、`permission_denied`、`model_not_found`、`provider_config_invalid`、`invalid_request`、`unsupported_request` 和 `unknown_permanent_provider_error`。
- `errorType` 不得为 `null`、空字符串、provider 原始错误码、provider 原始错误文本、HTTP status 文本或 provider-specific 自由字符串。
- 已经确定是永久 provider 错误但无法安全归入具体枚举时，使用 `unknown_permanent_provider_error`。
- 缺少原因生成器本地配置仍按配置预检处理，不进入 `permanentProviderErrorSamples[]`，也不映射为 `provider_config_invalid`。
- `httpStatus` 只能是真实 HTTP 状态码整数 `100..599` 或 `null`；`100`、`599` 合法，`99`、`600`、`0`、负数、小数和字符串状态码非法。
- SDK 自定义状态、provider 自定义错误码、网络错误码、系统错误码、DNS / TLS / socket 错误码不得放入 `httpStatus`；provider 没有返回可确认的 HTTP response status，或 SDK status / code 无法确认为真实 HTTP response status 时返回 `null`。
- 不得从 provider error message 解析或猜测 `httpStatus`，也不得把 `errorType`、provider 原始错误码或本地错误码映射成 `httpStatus`。
- `requestId` 只能来自 provider SDK / response metadata / response header 明确提供的 request id 或 correlation id；缺失时返回 `null`。
- `requestId` 作为 opaque string 使用，不解析、不改写语义。
- 不得从 provider message、provider 原始报错文本、`errorSummary`、stack trace、本地日志行或异常字符串中解析 `requestId`。
- 不得把 `runId`、`eventId`、`inputChecksum`、`httpStatus`、`errorType`、provider 原始错误码或本地错误码映射成 `requestId`。
- 不得为了填充字段而生成、拼接或伪造 provider `requestId`。
- `requestId` 最多 128 个 Unicode code point；128 个合法，129 个非法。
- `requestId` 长度不得按 UTF-8 字节数或 JavaScript UTF-16 code unit 计算，不得使用 JavaScript `string.length` 作为最终长度判定口径。
- provider 明确提供的 request id 或 correlation id 超过 128 个 Unicode code point 时，必须返回 `requestId = null`。
- 不得裁剪、追加省略号、保留不完整片段、哈希、重编码或压缩 provider request id 来满足长度上限。
- `errorSummary` 只能是系统生成的脱敏短摘要或 `null`。
- `errorSummary` 必须由系统根据归一化后的错误类型、HTTP status、provider / model 标识和安全定位信息生成，不得直接透传、截断、翻译、同义改写或轻度摘要 provider message。
- 如果只能从 provider message 获得错误信息，系统必须先映射到粗粒度 `errorType` 或安全模板；无法安全映射时返回 `errorSummary = null`。
- `errorSummary` 只供 diagnostics 人读快速定位，机器判断仍依赖 `errorType`、`httpStatus`、`requestId`、`runId`、`eventId` 和固定错误码。
- `errorSummary` 最多 200 个字符；超限时必须选择更短系统模板或移除非必要安全上下文，仍无法满足时返回 `null`。
- `errorSummary` 的 200 字符上限按 Unicode code point 计数，不按 UTF-8 字节数，也不按 JavaScript UTF-16 code unit。
- 实现不得使用 JavaScript `string.length` 作为 `errorSummary` 最终长度判定口径。
- 200 个 Unicode code point 合法，201 个 Unicode code point 不合法；含有非 BMP 字符时仍按 Unicode code point 计数。
- 不得通过截断 provider message、复制 provider message 前 200 个字符、追加省略号或保留不完整 provider 原始错误片段来满足 `errorSummary` 长度上限。
- `permanentProviderErrorSamples[]` 不得包含 provider 原始报错、原始 request / response payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential、完整配置、stack trace、SQL 或未定义的 provider-specific payload 字段。
- 不在 ops/status 返回每条原因假设内容。
- 不把 ops/status 变成模型输出详情页。
- ops/status light 不返回 provider 原始报错、原始 request / response payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential、完整配置、runId、eventId、inputChecksum 或 request id 列表。
- ops/status light 不返回 `permanentProviderErrorSamples`。

coverage 统计口径：

- `eligibleCoverage` 只统计自动生成 eligibility 内的事件，也就是 backend `actionBucket = actionable | watch` 的事件。
- `eligibleCoverage` 分母不包含 `not_generated`。
- `notGeneratedCount` 单独统计 `actionBucket = noise` 且策略性跳过自动生成的事件。
- `not_generated` 不进入 failure rate。
- `not_generated` 不进入 pending count。
- failure rate 只统计已经尝试生成的 eligible runs。
- pending count 只统计已写入 `pending` / `running` run 的事件。
- `blockedByGeneratorConfigCount` 统计符合自动生成 eligibility、没有 active/run 覆盖、但原因生成器关闭或缺少配置而没有写入 run 的事件。
- `blockedByGeneratorConfigCount` 不进入 pending count，因为没有真实队列任务。
- `blockedByGeneratorConfigCount` 不进入 failure rate，因为没有模型调用失败。
- `blockedByGeneratorConfigCount` 不进入 `notGeneratedCount`，因为它不是策略性跳过。
- `permanentProviderErrorCount` 统计当前保留的 run 表全量可见历史中 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 failed run 数量。
- `latestPermanentProviderErrorAt` 使用这类 failed run 的最新 `finishedAt`。
- 没有永久 provider 错误时，`permanentProviderErrorCount = 0`。
- 没有永久 provider 错误时，`latestPermanentProviderErrorAt = null`。
- 不得因为没有永久 provider 错误而省略这两个字段。
- `permanentProviderErrorCount` 不进入 pending count、`notGeneratedCount` 或 `blockedByGeneratorConfigCount`。
- `permanentProviderErrorCount` 不替代 failure rate；failure rate 仍统计已经尝试生成的 eligible runs。
- 缺少原因生成器本地配置仍由 `blockedByGeneratorConfigCount` / missing config 表达，不进入 `permanentProviderErrorCount`。
- 永久 provider 错误聚合摘要第一版不使用 24 小时、7 天、30 天或其他 rolling window。
- 第一版不新增统计窗口配置；run 表未来执行保留期清理后，统计自然反映清理后的当前保留历史。
- diagnostics 样例数量可以限量，但样例限量不得影响 light 聚合计数和最新时间。
- diagnostics 模式没有永久 provider 错误样例时，`permanentProviderErrorSamples = []`。
- `permanentProviderErrorSamples` 不参与 `permanentProviderErrorCount` 或 `latestPermanentProviderErrorAt` 的计算。
- `permanentProviderErrorSamples` 最多返回 10 条。
- `permanentProviderErrorSamples` 按 `finishedAt` 倒序、`runId` 升序稳定排序后截断。
- `permanentProviderErrorSamples` 不提供分页、offset、cursor 或按事件筛选。
- 缺少样例对应 failed run 自身持久化 `runId` 的永久 provider failed run 不进入 `permanentProviderErrorSamples`。
- 缺少同一 run 记录持久化 `eventId` 的永久 provider failed run 不进入 `permanentProviderErrorSamples`。

diagnostics 模式可以暴露：

- `generationRunId`
- `eventId`
- `inputChecksum`
- `modelProvider`
- `modelName`
- `promptVersion`
- `triggerSource`
- `triggerReason`
- `retryOfRunId`
- `status`
- `errorCode`
- `startedAt` / `finishedAt`
- retry count / duration
- generator enabled / disabled
- missing config keys
- `blockedByGeneratorConfigCount`
- blocked eventId samples
- `permanentProviderErrorSamples`
- eligible coverage by event family
- not generated count / share
- `snapshotTruncated`
- `truncatedFields`
- accepted / dropped / invalid count
- `validationSummary`
- limited eventId samples

diagnostics 模式仍不得暴露：

- raw prompt
- full model input
- 原始 evidence payload 全文
- provider secrets 或完整请求参数
- 完整 `input_snapshot_json`
- 完整 `output_snapshot_json`

完整输入/输出快照只能通过本地内部脚本按 run id 显式读取，例如：

```bash
scripts/inspect-causal-hypothesis-run.ts --run-id <runId> --include-snapshots
```

不传 `--include-snapshots` 时，该脚本也只输出摘要。

传 `--include-snapshots` 时，该脚本输出数据库中已存储的受控快照内容，不再隐藏快照内普通文本字段。这个行为只适用于已经保存的 `input_snapshot_json` / `output_snapshot_json`，不允许回退去读取或输出 raw prompt、完整模型输入、provider 原始 request/response payload 或 secrets。

完整快照打印必须精确到 `runId`。`--event-id` 只能列出 run 摘要，例如 status、触发来源、触发原因、retry 来源 run、时间、attempt、checksum、prompt/model/input builder 版本、`snapshotTruncated`、计数和错误摘要；不能隐式选择最近一次 run 打印快照。缺少 `--run-id` 且传入 `--include-snapshots` 时，脚本必须返回用法错误。

`--event-id` 摘要列表默认按创建时间或开始时间倒序列最近 20 条，支持 `--limit`，但最大不得超过 100；支持 `--status pending|running|succeeded|unknown|failed` 过滤。摘要字段固定为 `runId`、status、`triggerSource`、`triggerReason`、`retryOfRunId`、attempt、created/started/finished time、checksum、prompt/model/input builder 版本、`snapshotTruncated`、accepted/dropped/invalid 计数和错误摘要。摘要列表不输出完整快照，也不替代 diagnostics。

每条 run 必须保存触发来源。`trigger_source` 是结构化字段，候选值包括 `auto_event_ingest`、`facts_updated`、`manual_backfill`、`manual_repair`、`retry`；`trigger_reason` 是内部可读原因摘要。它们只用于内部审计、diagnostics 和本地运行记录查看脚本摘要，不进入 provider-facing contract、frontend 默认展示或 MCP public contract。

`trigger_source` / `trigger_reason` 是审计元数据，不参与 `input_checksum` 或生成去重 key。显式手动补跑如果命中同一 `event_id + input_checksum + prompt_version + model_name` 且已有 `pending` / `running` / `succeeded` / `unknown`，仍必须被去重跳过。未来如需强制同 key 重跑，必须设计单独 `--force` 语义。

retry run 使用 `trigger_source = "retry"`，并通过 `retry_of_run_id` 指向触发这次重试的上一条失败 run。`trigger_reason` 记录可读重试原因，例如 timeout、schema invalid、invalid references 或 provider error。原始触发来源保留在被重试的历史 run 上；需要追溯时通过 `retry_of_run_id` 链接查看。`retry_of_run_id` 是审计元数据，不参与 `input_checksum` 或生成去重 key，也不进入 provider-facing contract、frontend 默认展示或 MCP public contract。

第一版 manual backfill / repair 不支持绕过去重。即使触发来源是 `manual_backfill` 或 `manual_repair`，只要同一 `event_id + input_checksum + prompt_version + model_name` 已有 `pending` / `running` / `succeeded` / `unknown`，仍必须跳过。未来如需同 key 强制重跑，必须单独设计 `--force`，并记录 `force_reason` 和操作者来源。

manual backfill / repair 被去重跳过时，不写 `skipped` run，也不新增 `skipped` status。脚本执行结果需要返回 skipped count、skip reason 和 existing runId；skip reason 至少区分同 key 已有 `pending`、`running`、`succeeded` 或 `unknown` run。未来如果要审计手动命令请求本身，应单独设计 operation log，不把命令请求日志混进 `event_causal_hypothesis_runs`。

manual backfill / repair 全部被去重跳过时，脚本退出码仍为 0。全部 skipped 是正常业务结果，表示没有新生成任务需要创建。脚本必须在 stdout 或 `--json` 输出 queued / skipped / failed counts；在 `failedCount = 0` 时，参数错误、数据库错误、配置错误或运行时异常使用非 0 退出码。

manual backfill / repair 脚本必须提供稳定 `--json` 输出契约。默认输出可以保持人读摘要，但 `--json` 是给 cron、launchd、内部运维脚本和后续自动化消费的机器接口，字段必须稳定并有测试覆盖。JSON 顶层字段至少包含 `schemaVersion`、`mode`、`exitCode`、`durationMs`、`dryRun`、`execute` 和 `requested`。`schemaVersion` 第一版固定为整数 `1`。`scripts/backfill-causal-hypotheses.ts --json` 的 `mode` 固定为 `causal_hypothesis_backfill`。`exitCode` 必须是整数，并与进程实际退出码一致。`durationMs` 必须是非负整数毫秒。`requested` 只保存规范化后的安全请求字段。真实执行结果字段至少包含 `queuedCount`、`skippedCount`、`failedCount`、`queuedRunIds`、`skipped` 和 `errors`；`skipped[]` 每项至少包含 `eventId`、`inputChecksum`、`existingRunId`、`skipReason` 和 `status`；`errors[]` 每项至少包含固定 `target` 对象、固定 `errorCode`、固定 `phase`、`retryable` 和 `message`。`--json` 不输出完整 `input_snapshot_json` / `output_snapshot_json`、raw prompt、provider 原始 request/response payload 或 secrets。

进入 `--json` 模式后，stdout 必须只输出一份完整 JSON 对象，不能混入进度、日志、人读摘要或错误文本；这些内容只能输出到 stderr。只要脚本已经进入自己的错误处理流程，即使最终退出码非 0，也必须尽力输出可解析 JSON：参数解析成功并进入 dry-run 语义后，dry-run 失败写入 `wouldErrors[]`；execute 失败写入 `errors[]`。参数错误、配置错误、数据库错误、候选级部分失败和已捕获运行时异常，只要能构造 JSON envelope，都必须走这条机器契约。只有脚本无法接管的进程级失败才允许没有 JSON，例如 Node 启动失败、模块加载失败、进程被操作系统终止或严重崩溃。调用方遇到“非 0 且无 JSON”时，应按进程级失败处理，而不是按业务失败处理。

stderr 和本地日志只用于人读诊断，不属于 JSON 机器契约。默认 cron / launchd / 自动化日志必须脱敏，应优先输出 `errorCode`、`phase`、`target`、`runId`、`eventId`、`candidateIndex` 或 correlation id 等定位信息。默认日志不得输出 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload、secret、token、credential、完整配置、带参数值的完整 SQL 或完整堆栈。显式本地 debug 模式可以输出更详细的 raw exception 和堆栈，但仍不得输出 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload、secret、token、credential 或完整配置。provider 诊断默认只输出 provider 名称、model 名称、HTTP status、错误类型、request id 或脱敏后的错误摘要；SQL 诊断默认只输出 query name、表名、错误类型或脱敏 SQL 摘要。

显式本地 debug 模式第一版只能通过命令行 `--debug` 开启，不支持通过环境变量开启。`--debug` 只影响 stderr 和本地日志的诊断详细程度，不影响 stdout JSON，不进入 `requested`，也不改变候选选择、dry-run 预览、真实 execute 行为、去重行为、退出码或数据库写入。实现不得让 shell、cron、launchd 或长期进程环境变量隐式开启 debug 模式；即使传入 `--debug`，仍必须遵守默认的敏感信息禁止输出边界。

`requested` 字段必须始终存在。参数解析成功时，`requested` 输出应用稳定机器契约默认值后的有效请求，只包含已经被系统接受、对审计和复现有用的安全请求字段。第一版允许的 `requested` 字段包括 `eventId`、`runId`、`limit`、`includeNoise`、`concurrency`、`dryRun` 和 `execute`；未来新增筛选、排序或截断参数时，只能保存规范化后的安全参数。`requested` 必须包含稳定机器契约默认值，例如用户省略 `--include-noise` 时输出 `requested.includeNoise = false`，省略 `--concurrency` 时输出 `requested.concurrency = 1`；如果 `limit` 存在稳定机器契约默认值，`requested.limit` 记录最终有效值；`requested.dryRun` 和 `requested.execute` 记录最终有效执行模式。`requested` 不得保存原始 `argv`、环境变量、profile secret、API key、token、credential、raw prompt、完整模型输入、provider 原始 request / response payload、完整模型配置、provider 参数、内部批大小、数据库分页大小或其他内部实现默认值。参数解析失败时，`requested = null`，不得把半解析参数塞进 `requested`，也不得把原始命令行完整回显进 JSON。参数解析失败必须以结构化 global error 表达：`errorCode = "invalid_arguments"`、`phase = "argument_parse"`、`target.scope = "global"`、`retryable = false`，并固定放入 `errors[]`，不得放入 `wouldErrors[]`。

未知命令行参数必须严格失败。未定义参数、拼写错误参数和当前版本不支持的未来参数都属于参数解析失败，不得忽略，也不得继续执行半解析请求。未知参数使用 `errorCode = "invalid_arguments"`、`phase = "argument_parse"`、`target.scope = "global"` 和 `retryable = false`，同时输出 `requested = null`、`dryRun = false`、`execute = false`，进程退出码非 0。如果脚本已经进入 `--json` 错误处理流程，stdout 仍必须输出唯一、完整、可解析 JSON；未知参数错误固定进入 `errors[]`，不得进入 `wouldErrors[]`。`message` 可以提示未知参数名称，但不得回显完整原始命令行。

`--event-id` 和 `--run-id` 是互斥定位模式。`--event-id` 表示按 canonical event 精确定位，`--run-id` 表示按已有 generation run 精确定位；二者同时出现时不得选择优先级，也不得隐式覆盖其中一个。这个错误固定视为参数解析失败，发生在候选选择、input build、去重检查、配置预检和数据库写入之前。JSON 契约与其他参数解析失败一致：`errorCode = "invalid_arguments"`、`phase = "argument_parse"`、`target.scope = "global"`、`retryable = false`、`requested = null`、`dryRun = false`、`execute = false`，退出码非 0；如果已经进入 `--json` 错误处理流程，stdout 仍输出唯一可解析 JSON，错误进入 `errors[]`，不得进入 `wouldErrors[]`，不得输出 dry-run 预览字段。该互斥规则只约束 `scripts/backfill-causal-hypotheses.ts` 的 backfill / repair 第一版；其他 inspect 类脚本如果未来允许组合定位，必须单独定义自己的参数契约。

`--include-noise` 不能替代批量 `--limit`。没有精确定位参数时，请求属于批量模式；精确定位参数包括 `--event-id` 和 `--run-id`。批量模式必须显式提供 `--limit`，即使请求传入了 `--include-noise`。`--include-noise` 只表示把 `actionBucket = noise` 纳入候选范围，不提供候选数量上限，也不改变候选排序、去重、质量门禁、`--limit`、`--concurrency`、退出码或 run 记录规则。缺少精确定位参数且缺少 `--limit` 时，固定视为参数解析失败。JSON 契约与其他参数解析失败一致：`errorCode = "invalid_arguments"`、`phase = "argument_parse"`、`target.scope = "global"`、`retryable = false`、`requested = null`、`dryRun = false`、`execute = false`，退出码非 0；如果已经进入 `--json` 错误处理流程，stdout 仍输出唯一可解析 JSON，错误进入 `errors[]`，不得进入 `wouldErrors[]`，不得输出 dry-run 预览字段。

`--limit` 必须是 `1..100` 的十进制整数。只要请求传入 `--limit`，`0`、负数、小数、非数字和超过 `100` 的值都固定视为参数解析失败。脚本不得自动修正非法值，不得把超过 `100` 的值静默截断为 `100`，也不得把小数取整、向上取整或向下取整。JSON 契约与其他参数解析失败一致：`errorCode = "invalid_arguments"`、`phase = "argument_parse"`、`target.scope = "global"`、`retryable = false`、`requested = null`、`dryRun = false`、`execute = false`，退出码非 0；如果已经进入 `--json` 错误处理流程，stdout 仍输出唯一可解析 JSON，错误进入 `errors[]`，不得进入 `wouldErrors[]`，不得输出 dry-run 预览字段。

当前版本已定义的每个命令行参数最多只能出现一次。第一版不定义任何可重复参数；带值参数重复出现非法，例如 `--limit 10 --limit 20` 或 `--limit 10 --limit 10`；定位参数重复出现非法，例如 `--event-id A --event-id B`；布尔开关重复出现也非法，例如 `--include-noise --include-noise`。脚本不得选择第一个值、最后一个值或合并多个值。重复参数固定视为参数解析失败，发生在候选选择、input build、去重检查、配置预检和数据库写入之前。JSON 契约与其他参数解析失败一致：`errorCode = "invalid_arguments"`、`phase = "argument_parse"`、`target.scope = "global"`、`retryable = false`、`requested = null`、`dryRun = false`、`execute = false`，退出码非 0；如果已经进入 `--json` 错误处理流程，stdout 仍输出唯一可解析 JSON，错误进入 `errors[]`，不得进入 `wouldErrors[]`，不得输出 dry-run 预览字段。`message` 可以提示重复的参数名称，但不得回显完整原始命令行。

manual backfill / repair 默认是 dry-run / preview；默认 dry-run 不需要显式传 `--dry-run`。如果当前或未来版本提供显式 `--dry-run` 参数，它必须和 `--execute` 互斥。单独传显式 `--dry-run` 时，如脚本支持该参数，可表达显式预览意图；`--execute` 表示真实执行。二者同时出现时不得选择优先级，也不得让一个覆盖另一个，固定视为参数解析失败，发生在候选选择、input build、去重检查、配置预检和数据库写入之前。JSON 契约与其他参数解析失败一致：`errorCode = "invalid_arguments"`、`phase = "argument_parse"`、`target.scope = "global"`、`retryable = false`、`requested = null`、`dryRun = false`、`execute = false`，退出码非 0；如果已经进入 `--json` 错误处理流程，stdout 仍输出唯一可解析 JSON，错误进入 `errors[]`，不得进入 `wouldErrors[]`，不得输出 dry-run 预览字段。

`requested` 的当前版本字段形状必须稳定。参数解析成功时，`eventId`、`runId`、`limit`、`includeNoise`、`concurrency`、`dryRun` 和 `execute` 按当前 JSON 字段契约输出；其中 `eventId` 和 `runId` 是模式相关的可选定位字段，不适用于当前请求时写 `null`；`limit` 在批量模式下有显式值或稳定默认值时写数字，在精确单事件或单 run 模式下不适用时写 `null`；`includeNoise`、`dryRun` 和 `execute` 是布尔字段，只要 `requested` 不是 `null` 就必须始终存在；`concurrency` 是整数，默认值为 `1`。未知字段、未来字段或当前版本没有定义的字段不得为了占位写入 `null`。

参数解析失败时，脚本不得根据原始命令行里是否出现 `--dry-run` 或其他预览意图来决定错误归属。参数解析失败表示请求尚未被系统接受，因此 JSON 顶层必须使用 `dryRun = false`、`execute = false`、`requested = null` 和 `errors[]`。此时不得输出 dry-run 预览字段，包括 `candidateCount`、`wouldQueueCount`、`wouldSkipCount`、`wouldFailCount`、`wouldQueueEventIds`、`wouldSkip`、`wouldErrors` 和 `executionBlocked`。

`mode` 表示机器接口来源，不表示请求执行模式。参数解析成功和失败时都必须输出同一个脚本级固定值 `causal_hypothesis_backfill`。参数解析失败时不得把 `mode` 设为 `null`，也不得改成 `dry_run`、`execute`、`argument_error` 或其他请求状态。自动化应先用 `mode` 路由到对应 schema，再用 `requested = null`、`dryRun = false`、`execute = false` 和 global `invalid_arguments` 错误判断请求未成立。

`schemaVersion` 表示机器 JSON 契约版本，不表示业务版本或脚本版本。第一版固定输出 `schemaVersion = 1`，参数解析成功和失败时都必须输出。`schemaVersion` 使用整数，不使用 semver 字符串；破坏性 JSON 契约变更才递增，兼容性新增字段不递增。自动化应按 `mode + schemaVersion` 选择解析逻辑。

`exitCode` 表示脚本最终进程退出语义。只要脚本输出 JSON，就必须输出整数 `exitCode`，且它必须与进程实际退出码一致。`exitCode = 0` 只表示脚本按契约完成，不表示真实 execute 一定可执行；dry-run 中是否可真实执行仍必须看 `executionBlocked`。非 0 且有 JSON 表示脚本已处理的失败，结构化原因在 `errors[]` 或 `wouldErrors[]`；非 0 且无 JSON 表示脚本无法接管的进程级失败。第一版不增加 `ok` 或 `success` 布尔字段，避免把 dry-run 阻断、候选级失败和进程级失败压成一个模糊布尔值。

`durationMs` 表示脚本可接管范围内的运行耗时，必须是非负整数毫秒。计时范围从脚本进入可接管的 main 流程开始，到生成 JSON envelope 为止；参数解析失败时也必须输出。`durationMs` 不包括 Node 启动、模块加载失败或进程被操作系统终止这类脚本无法接管的阶段。第一版不输出 `startedAt` 或 `finishedAt`；墙钟时间先由外层 cron、launchd 或运维日志记录，避免时区、时钟漂移和时间格式争议进入第一版机器契约。

dry-run JSON 必须区分预估结果和真实执行结果。dry-run 时设置 `dryRun = true`、`execute = false`，使用 `candidateCount`、`wouldQueueCount`、`wouldSkipCount`、`wouldFailCount`、`wouldQueueEventIds`、`wouldSkip`、`wouldErrors` 和 `executionBlocked` 表达如果执行将会发生的结果；真实 `--execute` 才使用 `queuedCount`、`skippedCount`、`failedCount`、`queuedRunIds`、`skipped` 和 `errors`。`wouldErrors[]` 与 `errors[]` 使用同一错误对象结构，也包含固定 `errorCode`、固定 `phase`、`retryable` 和 `message`。dry-run 不创建 run、不写数据库、不刷新 projection；参数错误、数据库错误、配置错误或运行时异常仍按错误处理，不伪装成 `wouldFailCount`。

`errors[]` 和 `wouldErrors[]` 的 `errorCode` 与 `phase` 使用第一版固定枚举。机器判断只能依赖 `errorCode`、`phase`、`target` 和 `retryable`；`message` 只供人读，文案变化不得影响自动化判断。第一版 `errorCode` 枚举为 `invalid_arguments`、`generator_config_missing`、`database_unavailable`、`event_not_found`、`candidate_ineligible`、`input_build_failed`、`dedupe_check_failed`、`enqueue_failed`、`unexpected_candidate_error`、`unexpected_runtime_error`。第一版 `phase` 枚举为 `argument_parse`、`config_preflight`、`database_preflight`、`candidate_selection`、`input_build`、`dedupe_check`、`enqueue`、`candidate_processing`、`runtime`。`skipped` 和 `wouldSkip` 不是错误，不进入 `errors[]` 或 `wouldErrors[]`。第一版错误对象只输出 `message` 作为简短、无敏感信息的人读文本字段，不输出 `summary`。`message` 必须由脚本生成，不能直接使用 raw exception、SQL、数据库驱动原始错误、堆栈信息、provider 原始报错、provider 原始 request / response payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential 或完整配置。

`executionBlocked` 是 dry-run JSON 的显式布尔字段，用来表达同样请求如果真实 `--execute` 是否会被全局预检阻断。`executionBlocked = true` 时，`wouldErrors[]` 必须包含至少一条 `target.scope = "global"` 的错误；`executionBlocked = false` 时，不得用全局阻断语义解释 `wouldErrors[]`。缺少原因生成配置但 dry-run 仍能成功返回候选时，dry-run 可以退出 0，同时设置 `executionBlocked = true`。如果参数错误、数据库不可用或运行环境错误导致 dry-run 本身无法产出有效预览，dry-run 仍应非 0；若能输出 JSON envelope，也应设置 `executionBlocked = true` 并写入 global `wouldErrors[]`。候选级预计失败只进入 `wouldFailCount` / `wouldErrors[]`，不设置 `executionBlocked = true`。

当 `executionBlocked = true` 时，`wouldQueueCount`、`wouldSkipCount`、`wouldFailCount`、`wouldQueueEventIds`、`wouldSkip` 和候选级 `wouldErrors[]` 仍然表达候选级预览，也就是如果全局阻断被修复，这批候选在去重和候选级检查后会怎样。但自动化不得把 `wouldQueueCount > 0` 当成当前可真实执行；当前真实 `--execute` 仍会整批失败，且写入 0 个 run。`executionBlocked = true` 时，候选级 `wouldErrors[]` 可以和 global `wouldErrors[]` 同时存在。`executionBlocked = false` 时，`would*` 字段按普通候选级 dry-run 预览解释。

`wouldFailCount` 只统计候选级预计失败，不统计 global 阻断。global 阻断只由 `executionBlocked = true` 和 `target.scope = "global"` 的 `wouldErrors[]` 表达。候选级预计失败仍进入 `wouldFailCount`；因此 `executionBlocked = true` 且存在候选级预计失败时，`wouldFailCount` 可以大于 0。候选级 `wouldErrors[]` 使用 `target.scope = "event"` 或 `target.scope = "run"`。自动化判断当前是否可真实执行时先看 `executionBlocked`；判断候选质量或预计部分失败时再看 `wouldFailCount` 和候选级 `wouldErrors[]`。

dry-run 成功产出完整候选级预览时，`wouldQueueCount + wouldSkipCount + wouldFailCount` 必须等于过滤、排序、`--limit` 截断后的最终候选数量。完整候选级预览是指脚本已经得到最终候选列表，并能把每个候选归入预计排队、预计跳过或预计候选级失败之一。每个候选必须且只能进入这三类中的一类。即使 `executionBlocked = true`，只要候选级预览完整，这条计数守恒仍然成立。global 阻断本身不计入 `wouldFailCount`，也不破坏计数守恒。如果 dry-run 因参数错误、数据库不可用或运行环境错误无法产出最终候选列表，可以不要求三者之和守恒；此时 dry-run 应非 0，并通过 `target.scope = "global"` 的 `wouldErrors[]` 说明原因。

dry-run JSON 必须显式输出 `candidateCount`，表示过滤、排序、`--limit` 截断后的最终候选列表长度。`candidateCount` 不是数据库原始候选总量，也不是过滤前数量、排序前数量、分页前数量或新排队目标数量。dry-run 成功产出完整候选级预览时，`candidateCount = wouldQueueCount + wouldSkipCount + wouldFailCount`。即使 `executionBlocked = true`，只要候选级预览完整，也必须输出 `candidateCount` 并满足计数守恒。如果 dry-run 无法产出最终候选列表，仍必须输出 `candidateCount = null`，`executionBlocked` 必须为 `true`，且 `wouldErrors[]` 必须至少包含一个 `target.scope = "global"` 的错误。`candidateCount = 0` 只表示已经成功产出最终候选列表且候选数量确实为 0，不得用于表示不可用。

当 `candidateCount = null` 时，`wouldQueueCount`、`wouldSkipCount` 和 `wouldFailCount` 固定输出 `0`，`wouldQueueEventIds` 和 `wouldSkip` 固定输出空数组，不得输出候选级 `wouldErrors[]`。此时 `wouldErrors[]` 只能承载 global 错误，且必须至少包含一个 `target.scope = "global"` 的错误。自动化必须先看 `candidateCount` 和 `executionBlocked` 再解释 `would*Count`；三个 `0` 只是在候选列表不可用时维持字段类型稳定，不表示最终候选列表已成功计算为空。

批量 backfill 默认候选范围只包含 backend `actionBucket = actionable | watch` 的事件。`actionBucket = noise` 默认不进入批量候选，避免低投资意义事件消耗模型预算；只有精确传 `--event-id` 或显式 `--include-noise` 时才允许进入候选。`--include-noise` 只改变候选范围，不改变去重、质量门禁、`--limit`、`--concurrency`、退出码、JSON 输出语义或 run 记录规则。

批量 backfill 默认排序复用后端投资排序，不新增原因生成专属优先级。排序规则为：`actionable` 先于 `watch`，显式包含时 `noise` 最后；同一 bucket 内按 `materiality_score * 0.4 + tradability_score * 0.35 + authority_score * 0.25` 降序；投资分数相同时按 `COALESCE(latest_lifecycle_at, published_at, ingested_at, 0)` 降序；仍相同时按 `event_id` 升序稳定排序。精确 `--event-id` 不走批量候选排序。

批量 backfill 的 `--limit` 在候选过滤和完整排序之后应用。处理顺序是：先过滤候选范围和显式参数，再按 TD-77 排序，最后截断到 `--limit`。因此 `--limit 100` 的语义是排序后投资优先级最高的 100 条候选，不是最近 100 条里再排序。dry-run JSON 的 `wouldQueueEventIds` / `wouldSkip` 必须反映排序后截断的最终候选顺序。实现可以通过索引、分页或临时表优化查询，但不能改变这个语义。

`--limit` 限制排序后要检查的候选数量，不限制最终成功新排队的 run 数量。脚本必须先得到排序后截断的候选列表，再对这批候选执行去重、配置检查、质量门禁和排队；如果大量候选因为已有 `pending` / `running` / `succeeded` / `unknown` run 被跳过，`queuedCount` 可以小于 `--limit`。脚本不得为了凑满 `--limit` 个新 run 继续向后扫描更多候选。未来如果需要“尽量排满 N 个新 run”，必须单独设计 `--target-queued`。

`--run-id` 精确定位到已经处于 `pending` 或 `running` 的 generation run 时，不重复排队，也不把它当成错误。脚本不得创建新 run、重置已有 run 的 lease、重置 attempt、刷新 projection 或调用模型生成器。该结果不是参数错误，不是 `event_not_found`，也不是 `candidate_ineligible`；它不进入 `errors[]` 或 `wouldErrors[]`。真实 `--execute` 时输出 `queuedCount = 0`、`skippedCount = 1`、`failedCount = 0`、`queuedRunIds = []`，并在 `skipped[]` 记录这次跳过。dry-run 时输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 1`、`wouldFailCount = 0`、`wouldQueueEventIds = []`，并在 `wouldSkip[]` 记录这次预计跳过。skipped / wouldSkip 明细必须包含 requested `runId`、可获得的 `eventId`、`inputChecksum`、`existingRunId`、`skipReason` 和 `status`；`existingRunId` 等于 requested `runId`，`status` 为 `pending` 或 `running`，`skipReason` 必须区分 `run_already_pending` 和 `run_already_running`。没有其他错误时，退出码为 0。

`--run-id` 精确定位到已经处于 `succeeded` 或 `unknown` 的 generation run 时，同样不重复排队，也不把它当成错误。脚本不得创建新 run、重算或替换 active 原因集合、刷新 projection 或调用模型生成器。该结果不是参数错误，不是 `event_not_found`，也不是 `candidate_ineligible`；它不进入 `errors[]` 或 `wouldErrors[]`。真实 `--execute` 时输出 `queuedCount = 0`、`skippedCount = 1`、`failedCount = 0`、`queuedRunIds = []`，并在 `skipped[]` 记录这次跳过。dry-run 时输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 1`、`wouldFailCount = 0`、`wouldQueueEventIds = []`，并在 `wouldSkip[]` 记录这次预计跳过。skipped / wouldSkip 明细必须包含 requested `runId`、可获得的 `eventId`、`inputChecksum`、`existingRunId`、`skipReason` 和 `status`；`existingRunId` 等于 requested `runId`，`status` 为 `succeeded` 或 `unknown`，`skipReason` 必须区分 `run_already_succeeded` 和 `run_already_unknown`。没有其他错误时，退出码为 0。未来如果需要同 key 重跑，必须单独设计 `--force`，不能让普通 repair/backfill 隐式重跑终态 run。

`--run-id` 精确定位到已经处于 `failed` 的 generation run 时，允许创建新的 retry run，但不得复活或修改原 failed run。原 failed run 保持 `failed`，脚本不得把它改回 `pending`，不得重置它的 lease 或 attempt。满足 retry 条件时，脚本创建新的 `pending` retry run，并写入 `retry_of_run_id = requested runId`、`trigger_source = "retry"` 和可读 `trigger_reason`。新 retry run 使用同一生成去重 key：`eventId + inputChecksum + promptVersion + modelName`。如果同 key 已有新的 `pending` / `running` / `succeeded` / `unknown` run、retry backoff 尚未到期，或同 key 已达到最大尝试次数，脚本跳过而不是报错；跳过不进入 `errors[]` 或 `wouldErrors[]`。真实 `--execute` 成功创建 retry run 时输出 `queuedCount = 1`、`skippedCount = 0`、`failedCount = 0`、`queuedRunIds = [newRunId]`。dry-run 预计会创建 retry run 时输出 `candidateCount = 1`、`wouldQueueCount = 1`、`wouldSkipCount = 0`、`wouldFailCount = 0`、`wouldQueueEventIds = [eventId]`。因同 key 已有其他 run 跳过时，`skipReason` 使用对应 `run_already_pending`、`run_already_running`、`run_already_succeeded` 或 `run_already_unknown`，`existingRunId` 指向阻止 retry 的那条 run。因 retry backoff 尚未到期跳过时，`skipReason = "retry_backoff_not_due"`；因达到最大尝试次数跳过时，`skipReason = "retry_attempts_exhausted"`。skipped / wouldSkip 明细必须包含 requested `runId`、可获得的 `eventId`、`inputChecksum`、`existingRunId`、`skipReason` 和 `status`。因 backoff 或最大尝试次数跳过时，`existingRunId` 等于 requested `runId`，`status = "failed"`。成功创建 retry run 或按上述规则跳过时，没有其他错误则退出码为 0。

`--run-id <failedRunId>` 创建 retry run 时，模型输入必须复用原 failed run 的输入身份和已保存输入材料，不重新读取当前 canonical event 生成新输入。retry run 必须复用原 failed run 的 `eventId`、`inputChecksum`、`inputBuilderVersion`、`promptVersion`、`modelProvider`、`modelName` 和可回放 `inputSnapshot`；它可以有新的 `runId`、`createdAt`、`attemptNumber`、`trigger_source`、`trigger_reason` 和 `retry_of_run_id`。脚本不得为了 retry 重新加载当前 canonical event detail 构造模型输入，也不得因为当前 event facts / evidence 已变化而改变 retry run 的 `inputChecksum`。如果操作者想基于当前 canonical event 重新生成，应使用 `--event-id`，不是 `--run-id`。如果原 failed run 缺少可回放 `inputSnapshot`，或其输入材料不足以构造模型请求，则本候选失败，不创建 retry run。真实 `--execute` 写入 `errors[]`、`failedCount = 1`、退出码非 0，并输出 `queuedCount = 0`、`skippedCount = 0`、`queuedRunIds = []`；dry-run 写入 `wouldErrors[]`、`wouldFailCount = 1`，并输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 0`、`wouldQueueEventIds = []`。错误使用 `errorCode = "input_build_failed"`、`phase = "input_build"`、`target.scope = "run"`，并在可获得时带 `runId`、`eventId` 和 `inputChecksum`；`retryable = false`。

`--event-id <eventId>` 表示基于当前 canonical event 状态重新构造模型输入。它必须先加载当前 canonical event detail，用当前 canonical event detail 构造当前模型输入，计算当前 `inputChecksum`，再用当前 `eventId + inputChecksum + promptVersion + modelName` 计算去重 key。它不得为了当前输入构造复用历史 failed run 的 `inputSnapshot`。如果当前 key 与某条 failed run 的 key 相同，且同 key 没有 `pending` / `running` / `succeeded` / `unknown` run，并且 retry backoff 和最大尝试次数允许，则创建 retry run，写入 `retry_of_run_id`、`trigger_source = "retry"` 和可读 `trigger_reason`。该 retry run 的输入使用刚刚按当前 canonical event 构造出的输入；由于 key 相同，它应与被重试 failed run 的输入身份一致。如果当前 key 与历史 failed run 的 key 不同，则创建普通 manual run，不写 `retry_of_run_id`，`trigger_source` 使用当前手动任务来源，例如 `manual_backfill` 或 `manual_repair`，并使用当前输入的 `inputChecksum`、`inputBuilderVersion`、`promptVersion`、`modelProvider`、`modelName` 和 `inputSnapshot`。如果当前 key 已有 `pending` / `running` / `succeeded` / `unknown` run，则按既有去重规则跳过，不创建 retry run 或普通 manual run。

`--event-id <eventId>` 当前 key 命中多条 failed run 时，`retry_of_run_id` 必须指向同 key 最新一条 failed run。选择范围只包含当前 key 相同的 failed run，不跨 key 选择。排序规则固定为：`attemptNumber` 降序、`finishedAt` 降序、`createdAt` 降序、`runId` 降序稳定兜底。retry backoff 是否到期和最大尝试次数是否耗尽都基于选中的 latest failed run 判断。如果 latest failed run 的 retry backoff 尚未到期或已经达到最大尝试次数，脚本跳过，不创建 retry run；`existingRunId` 指向选中的 latest failed run。脚本不得选择更早的 failed run 来绕过 latest failed run 的 retry backoff 或最大尝试次数。

新建 retry run 的 `attemptNumber` 必须基于被重试的 failed run 递增。对 `--run-id <failedRunId>`，被重试的 failed run 就是 requested run；对 `--event-id <eventId>`，被重试的 failed run 是 TD-120 选中的 latest failed run。新 retry run 的 `attemptNumber = selectedFailedRun.attemptNumber + 1`。脚本不得把 retry run 的 `attemptNumber` 重置为 1，不得沿用 selected failed run 的 `attemptNumber`，也不得通过重新统计同 key 历史 run 数量或扫描同 key 最大历史 attempt 来覆盖 selected failed run 的递增规则。最大尝试次数判断必须先基于 selected failed run 完成；如果 selected failed run 已达到最大尝试次数，则不创建 retry run。

retry backoff 是否到期，只使用 selected failed run 上保存的 `nextAttemptAt`。对 `--run-id <failedRunId>`，selected failed run 就是 requested failed run；对 `--event-id <eventId>`，selected failed run 是 TD-120 选中的 latest failed run。脚本不得用 `finishedAt + backoff` 重新计算到期时间，也不得因为 retry 策略常量变化而重新解释历史 failed run 的到期时间。最大尝试次数判断先执行；如果 selected failed run 已达到最大尝试次数，则按 `retry_attempts_exhausted` 跳过，不要求存在 `nextAttemptAt`。终止性 provider 失败判断在 `nextAttemptAt` 必填判断前执行；如果 selected failed run 是明确终止失败，则按 `retry_terminal_failure` 跳过，不要求存在 `nextAttemptAt`。如果 selected failed run 未达到最大尝试次数，且不是明确终止失败，则必须存在 `nextAttemptAt`。`nextAttemptAt > now` 时按 `retry_backoff_not_due` 跳过，`existingRunId = selectedFailedRun.runId`，`status = "failed"`，不写入 `errors[]` 或 `wouldErrors[]`，没有其他错误时退出码为 0。因明确终止失败跳过时同样写 `existingRunId = selectedFailedRun.runId` 和 `status = "failed"`，不写入 `errors[]` 或 `wouldErrors[]`，没有其他错误时退出码为 0。`nextAttemptAt <= now` 时 backoff 允许 retry 继续，后续仍受同 key 去重、输入可回放、配置、数据库和排队规则约束。未耗尽尝试次数、不是明确终止失败的 selected failed run 缺少 `nextAttemptAt` 时，这是候选级数据不完整失败，不是 skip；真实 `--execute` 不创建 retry run，输出 `failedCount = 1`、`queuedCount = 0`、`skippedCount = 0`、`queuedRunIds = []`，写入 `errors[]` 并以非 0 退出；dry-run 输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 0`、`wouldFailCount = 1`、`wouldQueueEventIds = []`，写入 `wouldErrors[]`。错误使用 `errorCode = "unexpected_candidate_error"`、`phase = "candidate_processing"`、`target.scope = "run"`，并在可获得时带 `runId`、`eventId` 和 `inputChecksum`；`retryable = false`。

当 selected failed run 的 `nextAttemptAt <= now` 且其他 retry 条件都允许时，新建 `pending` retry run 的 `nextAttemptAt` 写入本次 run 的创建时间。创建时间和 `nextAttemptAt` 必须使用同一个时钟源：如果创建时间由数据库时间生成，则 `nextAttemptAt` 使用同一次数据库时间；如果创建时间由应用进程时间生成，则 `nextAttemptAt` 使用同一个应用进程时间值。新 retry run 不继承 selected failed run 的旧 `nextAttemptAt`，不写未来退避时间，也不预先计算“如果本次 retry 失败后的下一次退避时间”。新 retry run 插入后必须立即满足 `pending` claim 条件中的 `nextAttemptAt <= now`。如果这条 retry run 后续失败，再由失败处理流程基于本次失败时间和 attempt 计算并保存下一次 `nextAttemptAt`。

第一版同一生成 key 的最大尝试次数为 4 次，表示 1 次初始生成加 3 次 retry。初始生成 run 的 `attemptNumber = 1`；第一次 retry run 的 `attemptNumber = 2`；第二次 retry run 的 `attemptNumber = 3`；第三次 retry run 的 `attemptNumber = 4`。attempt 1 失败后保存 `nextAttemptAt = failedAt + 5 分钟`；attempt 2 失败后保存 `nextAttemptAt = failedAt + 30 分钟`；attempt 3 失败后保存 `nextAttemptAt = failedAt + 2 小时`；attempt 4 失败后保持 `failed`，不再创建 retry run。最大尝试次数判断使用 `selectedFailedRun.attemptNumber >= 4`；当 `selectedFailedRun.attemptNumber >= 4` 时，`--run-id` 或 `--event-id` retry 都按 `retry_attempts_exhausted` 跳过。达到最大尝试次数后的 `failed` 不阻塞事件入库，不清除已有 active 原因假设，默认只在 diagnostics 暴露。

当 attempt 4 失败后，这条终止失败 run 必须写入 `status = "failed"`、保留 `attemptNumber = 4`，并把 `nextAttemptAt` 写为 `null`。终止失败 run 指 `status = "failed"` 且 `attemptNumber >= 4` 的 run，表示没有下一次自动 retry 窗口。failure handler 不得为 attempt 4 失败写未来退避时间，不得保留这条 run 进入执行前的旧 `nextAttemptAt`，也不得把 `nextAttemptAt` 写成 `failedAt` 或当前时间。是否 retry exhausted 由 `status = "failed"` 和 `attemptNumber >= 4` 判断，不依赖 `nextAttemptAt`。`--run-id` 或 `--event-id` 选中终止失败 run 时，按 `retry_attempts_exhausted` 跳过，不要求 `nextAttemptAt` 存在，也不进入 `errors[]` 或 `wouldErrors[]`。`attemptNumber < 4` 且不是明确终止失败的 failed run 缺少 `nextAttemptAt` 仍按 TD-122 的候选级数据不完整失败处理。

计算 retry backoff 时，`failedAt` 表示失败实际生效时间，不表示后台任务发现失败的时间。`failedAt` 是失败处理中的计算值，不要求新增持久字段，但 failed run 的 `finishedAt` 必须写入本次 `failedAt`。可重试的 `attemptNumber < 4` 失败时，`nextAttemptAt` 按 `failedAt + backoff` 计算。明确终止失败例外：它写 `finishedAt = failedAt`，但 `nextAttemptAt = null`，即使 `attemptNumber < 4`。普通模型失败、provider 错误、模型调用超时、schema invalid、引用全 invalid 或快照过大等在 worker 正常处理路径中当场判定的失败，`failedAt = finishedAt = 失败落库时间`。worker lease 超时恢复时，`failedAt = finishedAt = leaseExpiresAt`，不得用扫描发现超时的时间、修复脚本运行时间或当前时间作为 `failedAt`。如果 worker lease 超时被晚发现，retry backoff 仍从 `leaseExpiresAt` 开始计算；若 `leaseExpiresAt + backoff <= now`，后续统一 retry 入队流程创建出的 retry run 可以立即进入可 claim 状态。attempt 4 失败时仍按同样规则写 `finishedAt = failedAt`，但 `nextAttemptAt = null`。发现超时的时间可以进入 diagnostics 或 metadata，但不得参与 retry backoff 计算。

失败处理和 retry 入队是两个逻辑步骤。可重试的 `attemptNumber < 4` run 失败时，failure handler 只把当前 run 写成 `status = "failed"`，写入 `finishedAt = failedAt`、`nextAttemptAt = failedAt + backoff`、错误码、诊断信息和必要的输出快照，并按既有 lease 设计释放或清理该 run 的执行锁字段。明确终止失败例外：failure handler 写 `status = "failed"`、`finishedAt = failedAt` 和 `nextAttemptAt = null`，不提供自动 retry 窗口。failure handler 不得插入新的 retry run，也不得创建带未来 `nextAttemptAt` 的 `pending` run。统一 retry 入队流程只处理 `attemptNumber < 4`、`nextAttemptAt <= now`、不是明确终止失败、同 key 没有 `pending` / `running` / `succeeded` / `unknown` 且通过输入材料和配置 gate 的 failed run；它创建的新 retry run 必须写入 `trigger_source = "retry"`、`retry_of_run_id` 和可读 `trigger_reason`，并继续遵守 TD-121 的 attempt 递增和 TD-123 的 `nextAttemptAt` 创建时间规则。worker lease 超时被晚发现且 `nextAttemptAt <= now` 时，可以在同一次 scheduler tick 或安全事务中继续调用统一 retry 入队流程，但必须先持久化旧 run 的失败事实，再执行 due retry 入队检查。

统一 retry 入队流程由现有原因生成 worker / scheduler 调度轮次触发，不新增独立 daemon、独立 queue table 或第二套状态机。每个自动调度轮次先恢复过期 `running` run，并按 TD-126 / TD-127 保存失败事实；随后扫描 due failed runs，调用统一 retry 入队流程创建新的 `pending` retry run；最后再 claim 可执行的 `pending` run。手动 backfill / repair 的 `--run-id` 或 `--event-id` 命中 due failed run 时，也调用同一套 retry 入队服务路径，不能复制一套独立 retry 判断。

自动调度轮次每轮最多成功创建 1 条 due retry run。自动 due retry 候选排序复用后端投资优先级；同一投资优先级下，按 `nextAttemptAt` 最早、`createdAt` 最早、`runId` 稳定兜底排序。手动 backfill / repair 不继承自动调度每轮 1 条的上限，仍按指定 `--run-id`、`--event-id` 或批量 `--limit` 的脚本语义处理。

自动调度轮次创建出的 due retry run 可以在同一个调度轮次的 pending claim 阶段被领取执行。该 run 的 `nextAttemptAt` 等于创建时间，插入后立即满足 `nextAttemptAt <= now`，因此不得人为延迟到下一轮。它不获得特殊优先级，仍进入普通 pending claim 查询；是否被本轮 claim 取决于本轮剩余 claim 容量和既有 pending claim 排序。没有容量或未被排序选中时，保持 `pending` 到下一轮。

普通 pending claim 的排序必须固定并覆盖所有来源。claim 查询只从 `status = "pending"` 且 `nextAttemptAt <= now` 的 eligible pending run 中取任务；排序先使用后端投资优先级，同一投资优先级下按 `nextAttemptAt` 最早、`createdAt` 最早、`runId` 稳定兜底。初始自动 run、manual run 和 retry run 都使用这套排序；`trigger_source`、`trigger_reason` 和 `retry_of_run_id` 不参与排序，manual run 和 retry run 都不因来源获得插队权。

pending claim 必须使用数据库条件更新完成原子领取。worker 先按 TD-131 排序选择候选，再执行条件更新：目标 `runId` 必须匹配，`status` 必须仍是 `pending`，且 `nextAttemptAt <= now`。更新成功时写入 `status = "running"`、`lockedAt`、`lockOwner` 和 `leaseExpiresAt`；`lockedAt` 和 `leaseExpiresAt` 基于同一次 claim 时间计算。只有更新影响行数为 1 才算 claim 成功。影响行数为 0 表示该 run 已被其他 worker 抢先领取、状态变化或不再到期，不是技术失败；worker 可以重新查询下一条候选或结束本轮 claim。数据库异常才按运行时错误处理。

claim 成功后必须先提交数据库事务，再在事务外构造模型请求、调用模型和校验输出。最终写入 `succeeded`、`unknown` 或 `failed` 结果时，必须用数据库条件更新保护 run 所有权：`runId` 匹配、`status = "running"`、`lockOwner` 匹配、`leaseExpiresAt > now`。只有结果写回影响行数为 1 才算落库成功。影响行数为 0 表示 worker 已失去 run 所有权、run 已被恢复流程改写或 lease 已过期，不得覆盖后续状态，也不得替换 active 原因假设。数据库异常才按写回失败处理。

当结果写回影响行数为 0 是因为 `status`、`lockOwner` 或 `leaseExpiresAt` 条件不再成立，当前 worker 必须停止改写该 run。它不得把该 run 标记为 `failed`，不得写入 `finishedAt`、`nextAttemptAt`、错误码、输出快照或 active 原因假设替换，也不得在过期写回路径创建 retry run 或触发 retry 入队。它可以写脱敏本地诊断日志，记录 `runId`、`lockOwner` 和写回冲突类型；日志不得包含 raw prompt、完整模型材料、provider 原始 payload 或 secrets。lease 已过期的 run 后续由 scheduler 超时恢复流程按 TD-126 / TD-127 处理，用 `leaseExpiresAt` 写 `failedAt` / `finishedAt` 并保存 `nextAttemptAt`；已被其他所有者推进的 run 不被失效 worker 覆盖。数据库异常不同于影响行数为 0，仍按写回失败处理。

第一版不支持 lease 续租。claim 成功时一次性写入 `leaseExpiresAt = claimedAt + 120 秒`；worker 在模型调用、输出校验或结果写回前不得延长 `leaseExpiresAt`。第一版不实现心跳续租、保活字段、续租循环或独立续租 API。单次模型调用超时保持 45 秒，run lease 保持 120 秒，二者之间的时间差是第一版安全余量。如果模型调用、输出校验或结果写回已经超过 lease，结果写回必须按过期写回处理，不能通过续租重新获得所有权；后续失败事实、`nextAttemptAt` 和 retry 入队仍由 scheduler 超时恢复与统一 retry 入队流程处理。

模型调用必须受本地 45 秒超时控制。provider SDK 支持 `AbortSignal` 或等价取消能力时，模型调用适配层必须把取消信号传给 provider，并在 45 秒超时时主动取消请求；provider SDK 不支持取消时，worker 仍必须在本地超时后停止等待，把当前 run 按模型调用超时处理。模型调用超时的 run 内部错误码为 `causal_hypothesis_model_timeout`。如果当前 worker 仍拥有 run 且 lease 未过期，超时写回把 run 写成 `failed`，写入 `finishedAt = failedAt = 失败落库时间`、timeout 诊断信息、必要的最小输出快照和按 backoff 计算的 `nextAttemptAt`。这次写回必须继续使用 TD-133 的 `runId`、`status = "running"`、`lockOwner` 和 `leaseExpiresAt > now` 条件更新；影响行数为 0 时按 TD-134 处理，不再写失败字段，也不创建 retry。provider 在本地超时后才返回成功、unknown 或错误时，返回结果必须丢弃，不得写入 run、不得替换 active 原因假设、不得刷新 projection。迟到结果只允许写脱敏本地诊断日志，不得包含 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload 或 secrets。provider promise 后续 resolve / reject 必须被消费，不能形成未处理异常。

非本地 45 秒超时的临时 provider 错误按可自动重试技术失败处理。第一版临时 provider 错误包括网络连接失败、DNS / TLS / socket 等传输层失败、HTTP 429、HTTP 500-599，以及 provider 明确返回的临时不可用、过载或限流。run 内部错误码为 `causal_hypothesis_provider_transient_error`。如果当前 worker 仍拥有 run 且 lease 未过期，写回把 run 写成 `failed`，写入 `finishedAt = failedAt = 失败落库时间`、脱敏 provider 诊断信息、必要的最小输出快照和按 backoff 计算的 `nextAttemptAt`；attempt 4 失败时 `nextAttemptAt = null`。这次写回必须继续使用 TD-133 的 `runId`、`status = "running"`、`lockOwner` 和 `leaseExpiresAt > now` 条件更新；影响行数为 0 时按 TD-134 处理，不再写失败字段，也不创建 retry。临时 provider 错误不替换 active 原因假设，不刷新 projection，不阻塞 canonical event 入库，也不立即创建 retry run；后续仍由统一 retry 入队流程在 `nextAttemptAt <= now` 后创建 retry run。脱敏 provider 诊断信息可以包含 provider 名称、model 名称、HTTP status、错误类型、request id 或脱敏错误摘要；不得包含 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload、secret、token、credential 或完整配置。配置错误、鉴权错误、模型不存在和请求非法不属于临时 provider 错误；永久 provider 错误按终止性技术失败处理，缺少本地配置仍按配置预检处理。

永久 provider 错误按终止性技术失败处理。第一版永久 provider 错误包括鉴权失败、权限不足、模型不存在、模型 id 或 provider 配置指向无效模型、provider 明确返回请求非法、不支持的参数 / 格式 / 模型能力，或者明确要求修改凭证、配置或请求后才可能成功。run 内部错误码为 `causal_hypothesis_provider_permanent_error`。如果当前 worker 仍拥有 run 且 lease 未过期，写回把 run 写成 `failed`，写入 `finishedAt = failedAt = 失败落库时间`、脱敏 provider 诊断信息、必要的最小输出快照和 `nextAttemptAt = null`，即使 `attemptNumber < 4`。这次写回必须继续使用 TD-133 的 `runId`、`status = "running"`、`lockOwner` 和 `leaseExpiresAt > now` 条件更新；影响行数为 0 时按 TD-134 处理，不再写失败字段，也不创建 retry。永久 provider 错误不替换 active 原因假设，不刷新 projection，不阻塞 canonical event 入库，不立即创建 retry run，也不由统一 retry 入队流程自动创建 retry run。普通 `--run-id` / `--event-id` retry 选中 `causal_hypothesis_provider_permanent_error` failed run 时，按 `retry_terminal_failure` 跳过，`existingRunId = selectedFailedRun.runId`，`status = "failed"`，不写入 `errors[]` 或 `wouldErrors[]`，没有其他错误时退出码为 0。修复凭证、权限、模型配置或请求结构后，普通 retry 仍按同一规则跳过；自动 due retry 入队流程和手动批量 backfill / repair 不得因为当前配置已修复而重新纳入这类 run。第一版不实现检测配置已修复后重开终止失败的后台逻辑，也不通过比较 provider 配置版本、凭证状态或模型 id 变化来自动重启终止失败 run。第一版不实现显式强制修复入口：不新增 `--force`、`--force-terminal-failure` 或等价命令行参数，不新增专门用于重跑永久 provider 终止失败的脚本入口，不新增公开 provider API、frontend 按钮或 MCP public tool，不新增后台自动修复任务，也不为永久 provider 终止失败新增 `force_reason`、operator 或审批字段。已有未来显式强制修复入口描述只作为未来设计约束，不是当前实现任务。永久 provider 错误进入 ops/status light 聚合摘要，字段为 `permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt`；`permanentProviderErrorCount` 统计当前保留 run 表里所有 `status = "failed"` 且 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 run，不受 samples 字段完整性影响；`latestPermanentProviderErrorAt` 只从这类 run 中已有持久化 `finishedAt` 的 run 取最大值，`permanentProviderErrorCount > 0` 且没有可用 `finishedAt` 时返回 `null`；聚合摘要使用当前保留 run 表的全量可见历史，不新增 rolling window 或统计窗口配置；无错误时两个字段仍固定返回，分别为 `0` 和 `null`；run 级细节只在 diagnostics 的 `permanentProviderErrorSamples` 数组中脱敏展示，无样例时返回 `[]`，最多 10 条，按同一 run 记录持久化 `finishedAt` 倒序、样例 run 自身 `runId` 升序稳定排序后截断；缺少自身持久化 `runId`、同一 run 记录持久化 `eventId` 或 `finishedAt` 的 run 不进入样例数组，也不得为 `latestPermanentProviderErrorAt` 合成替代时间；样例对象使用固定字段形状，`runId` 只允许样例 failed run 自身持久化主键，`eventId` 只允许同一 run 记录保存的 canonical event 绑定，`provider` / `model` 只允许本系统发起 run 时已知且最多 128 个 Unicode code point 的调用上下文或配置元数据或 `null`，`errorType` 使用非空后端归一化枚举，`httpStatus` 只允许真实 HTTP 状态码整数 `100..599` 或 `null`，`requestId` 只允许 provider 明确提供且最多 128 个 Unicode code point 的 request id / correlation id 元数据或 `null`，其他缺失的诊断字段返回 `null`，不得省略字段；`errorSummary` 由系统生成，不直接使用 provider message，最多 200 个 Unicode code point；light 不暴露该数组、原始 provider 错误、内部定位列表或敏感载荷。缺少原因生成器本地配置仍按配置预检处理，不复用 `causal_hypothesis_provider_permanent_error`。

manual backfill / repair 在真实 `--execute` 前必须执行原因生成器配置预检。配置未启用或缺少必要配置时，脚本以配置错误退出，退出码非 0，并且不得写入 `pending` run、不得写入 `failed` run、不得刷新 projection。dry-run 可以成功返回候选、排序、去重预估和配置阻塞提示；dry-run JSON 必须在 `wouldErrors` 或等价结构化字段中表达执行会因配置错误失败。错误输出可以包含缺失配置项名称、profile id、prompt id/version，但不得包含 secrets。

manual backfill / repair 的 `--execute` 不是全有或全无事务。单个候选成功排队后，其 `pending` run 保持有效；如果同批后续候选失败，不回滚已经成功排队的 run。只要 `failedCount > 0`，脚本退出码为非 0；`skipped` 不计入 `failedCount`。JSON 输出必须同时列出 `queuedRunIds`、`skipped[]` 和 `errors[]`，其中 `errors[]` 至少包含失败候选的固定 `target` 对象、固定 `errorCode`、固定 `phase`、`retryable` 和 `message`。

manual backfill / repair 的 `--execute` 遇到单个候选失败时继续处理后续候选。全局预检错误必须立即停止，包括参数错误、原因生成器配置错误、数据库不可用或基础运行环境不可用；全局预检失败时不写入任何 run。候选级失败记录到 `errors[]` 后继续处理，候选级失败包括输入构建失败、去重检查失败、候选级排队写入失败或候选级数据不完整。如果数据库进入无法可靠继续写入的全局错误状态，脚本应停止后续处理，而不是继续制造不可信结果。

全局预检失败不计入 `failedCount`。真实 `--execute` 中，`failedCount` 只统计候选级失败数量；全局预检失败时必须返回 `queuedCount = 0`、`skippedCount = 0`、`failedCount = 0`，在 `errors[]` 中写入至少一条 `target.scope = "global"` 的错误，并以非 0 退出码结束。全局预检失败也不得刷新 projection。候选级失败才计入 `failedCount`，并使用 `target.scope = "event"` 或 `target.scope = "run"`。这个边界用于区分“整批没有开始”和“候选处理过程中部分失败”。

`errors[]` 和 `wouldErrors[]` 的 `errorCode` 和 `phase` 必须是固定枚举，自由文本只能放在 `message`。第一版 `errorCode` 包括 `invalid_arguments`、`generator_config_missing`、`database_unavailable`、`event_not_found`、`candidate_ineligible`、`input_build_failed`、`dedupe_check_failed`、`enqueue_failed`、`unexpected_candidate_error` 和 `unexpected_runtime_error`。第一版 `phase` 包括 `argument_parse`、`config_preflight`、`database_preflight`、`candidate_selection`、`input_build`、`dedupe_check`、`enqueue`、`candidate_processing` 和 `runtime`。`skipped` 和 `wouldSkip` 不是 error，不进入 `errors[]` 或 `wouldErrors[]`。第一版错误对象不输出 `summary`。`message` 必须是脚本生成的脱敏说明，不得承载原始异常或内部载荷。

`errors[]` 和 `wouldErrors[]` 每项必须包含 `retryable`。`retryable` 由脚本/服务根据固定 `errorCode` 和 `phase` 计算，自动化不能从 `message` 推断。`retryable = true` 表示同样请求在不修改参数、配置或数据的情况下可以自动重试；`retryable = false` 表示需要修改输入、配置、数据，或者第一版无法安全判断可重试。第一版映射为：`database_unavailable`、`enqueue_failed`、`unexpected_runtime_error` 可重试；`invalid_arguments`、`generator_config_missing`、`event_not_found`、`candidate_ineligible`、`input_build_failed`、`dedupe_check_failed`、`unexpected_candidate_error` 不可自动重试。`retryable` 不改变退出码语义，也不让 `skipped` 或 `wouldSkip` 进入错误数组。

`errors[]` 和 `wouldErrors[]` 每项必须使用固定 `target` 对象定位失败范围。`target` 必须是对象，不能是自由文本字符串；自由文本只能放在 `message`。第一版 `target.scope` 枚举为 `global`、`event`、`run`。全局错误使用 `scope = "global"`；候选级事件错误使用 `scope = "event"`，并在可获得时带 `eventId`；run 级错误使用 `scope = "run"`，并在可获得时带 `runId` 和 `eventId`。批量候选错误在可获得时带 `candidateIndex`；输入已经构建完成后，在可获得时带 `inputChecksum`。第一版 `target` 结构为 `{ scope, eventId?, runId?, candidateIndex?, inputChecksum? }`。

`target.candidateIndex` 使用 0-based index，指向过滤、排序、`--limit` 截断后的最终候选列表。这个顺序必须和 dry-run `wouldQueueEventIds` / `wouldSkip` 以及 execute 实际遍历的候选顺序一致。`candidateIndex` 不得使用数据库原始 offset、分页 offset、进入过滤前的位置或被 `--limit` 截断前的位置。如果能获得 `eventId`，带 `candidateIndex` 的 `target` 必须同时带 `eventId`。精确 `--event-id` 模式下，如仍构造单元素候选列表，候选级错误使用 `candidateIndex = 0`。

质量门禁边界：

- 新增 `causal-hypothesis` 结构门禁。
- 门禁只检查结构、状态和读取路径边界。
- 不在第一版门禁中评判模型推理是否绝对正确。

门禁规则：

- active 原因必须至少有一个 `evidenceId`。
- active 原因数量不能超过 3。
- 同一 event + `causeType` 不能有多个 active。
- `basis` 只能是 `stated` / `inferred`。
- `causeType` 只能是已确认枚举。
- `confidence` 必须在 `0..1`。
- projection detail 中的 `causalStatus` 与 active/run 状态一致。
- 读取路径不能触发模型调用。

读取路径只读已保存结果，不调用大模型。

如果 detail projection 缺失或 stale，读取路径可以同步 repair projection。

projection repair 边界：

- 从 canonical detail 重建 projection。
- 只消费已经存在的 active `CausalHypothesis`。
- 不同步生成原因假设。
- 原因未生成时，按 eligibility 返回 `not_generated` 或 `pending`。
- 原因生成失败或未知时按已有 run 派生状态返回。

projection checksum / repair 测试断言：

- active 原因集合变化必须改变 `computeInvestmentProjectionChecksum()` 的输入 payload，并触发 stale repair。
- `causalStatus` 从 `pending`、`available`、`unknown`、`failed`、`not_generated` 之间变化时必须改变 projection checksum。
- `superseded` / `retracted` 原因、run diagnostics、input/output snapshot、trigger source、retry 链、provider 原始错误、truncation 元数据不得影响 provider-facing projection checksum。
- projection repair 可以同步重建 `InvestmentEventDetail.causalStatus` 和 active 原因展示字段，但不得创建 run、claim run、调用模型或修改原因表。
- provider API、MCP detail 和 frontend detail 必须读取同一份 repaired projection 结果，不得各自重新派生原因状态。

## 6. 生成范围与优先级

第一版自动生成不覆盖所有事件，只覆盖投资意义较高事件。

自动生成 eligibility：

- 后端 `InvestmentEventDetail.actionBucket = "actionable"` 的事件自动生成。
- 后端 `InvestmentEventDetail.actionBucket = "watch"` 的事件自动生成。
- 后端 `InvestmentEventDetail.actionBucket = "noise"` 的事件默认不自动生成。
- 内部脚本可以通过精确 `--event-id` 或显式 `--include-noise` 强制生成 `noise` 事件。

`actionBucket` 必须由 backend investment projection 从 canonical detail 计算，不能由 frontend、MCP formatter 或外部 prompt 重新判断。

候选筛选信号：

- `actionBucket`
- `materialityScore`
- `authorityScore`
- `freshnessScore`
- `tradabilityScore`
- event type / subtype
- source authority

这些信号只用于调度优先级，不能作为原因本身。

详情页访问到未生成原因时，只返回对应 `causalStatus`，不能因为读取而补排队或触发模型调用。

## 7. 降级与失败

生成失败不阻塞 canonical event 入库。

状态语义：

- `not_generated`：后端策略性未自动生成
- `pending`：应生成但尚未生成、尚未排队或排队中
- `unknown`：已分析，但材料不足以判断原因
- `available`：存在 active 原因假设
- `failed`：技术失败或输出结构不合格

`not_generated`、`pending`、`unknown` 和 `failed` 必须区分：

- `not_generated` 是策略跳过。
- `pending` 是等待生成；它可以由缺少 run 的 eligible event 派生，不要求一定已经存在 `pending` run。
- `unknown` 是语义结果。
- `failed` 是技术问题。
- 原因生成器关闭或缺少配置不新增 provider-facing 状态，不改用 `not_generated`，也不伪装成 `failed`；ops/status 负责解释 disabled / missing config。

## 8. 版本与审计

重算不能简单覆盖旧结果。

第一版采用：

- 默认读取 active 版本。
- 每个 event 最多 3 条 active。
- 同一 `causeType` 最多 1 条 active。
- 新版本生成后，将旧版本标记为 `superseded`。
- `available` run 整体替换旧 active 集合。
- `unknown` run 将旧 active 标记为 `superseded`，并返回事件级 `causalStatus = "unknown"`。
- `failed` run 不替换旧 active。
- 结构不合格或输入失效可以标记为 `retracted`。
- 保留模型、prompt、输入 checksum、生成时间和依据引用。

第一版不做人审流。以后如需人工修正，另设 correction / manual override 机制。

## 9. 一致性检查

本设计已完成实现前一致性检查，并已审批通过。

实施前必须确认：

- 与 `product-spec.md` 一致。
- 与 `research.md` 已确认边界一致。
- 与 `implementation-plan.md` 的字段、状态、流程、测试切片一致。
- 不违反 AGENTS.md 的 backend truth 规则。
- 不把核心语义移到 frontend、MCP formatter、prompt 或 skill。
- 实现必须按 `implementation-plan.md` 分步推进，不能扩大到当前生效文档或外部 repo。
