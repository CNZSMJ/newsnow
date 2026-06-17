# Delivery Status

状态：Completed
最后更新：2026-05-25
范围：`CausalHypothesis` 原因假设层的交付状态、验证记录和剩余风险

## 1. 当前状态

- backlog 六件套已创建。
- 已记录 grill-with-docs 拷问形成的产品与技术边界。
- `technical-design.md` 已审批通过。
- `implementation-plan.md` 已完成与技术方案的一致性检查。
- 已进入代码实现。
- Step 1 shared contract 已完成：`InvestmentEventDetail` 新增 `causalStatus` 和 `causalHypotheses`，`InvestmentEventBrief` 保持不变。
- Step 2 canonical 存储已完成：新增 `CausalHypothesisTable`、两张原因假设表、SQL ownership、run 队列读写、active 替换和 projection 读取。
- Step 3 生成服务骨架已完成：新增独立 `causal-hypothesis` 子模块、prompt registry 资源、bounded input builder、结构型质量校验、固定 fixtures、独立 LLM profile、45 秒 timeout 和 live generator 调用壳层。
- Step 4 管线与脚本闭环已完成：新增原因服务入队/去重/claim/process/retry，scheduler 在 canonical 事务提交后自动入队并在 worker 轮次处理 pending，新增 backfill、run inspect 和 run consistency 三个内部脚本。
- Step 5 projection / provider API / MCP 接入已完成：已保存原因结果进入 projection checksum 与 provider-facing detail，本地 MCP detail 只读投影原因字段。
- Step 6 前端详情页接入已完成：详情页展示原因假设、依据、置信度和状态降级文案，不提供生成、强制重跑、查看 run 或查看 snapshot 的入口。
- Step 7 验证已完成：类型检查、targeted tests、文档治理、脚本 smoke、生产构建、服务重启和运行时 API smoke 均通过。
- 当前生效文档已同步 `docs/architecture.md`、`docs/api-contract.md`、`docs/event-operations-runbook.md` 和 `docs/roadmap.md`。

## 2. 已完成内容

- 明确 `related-events` 不是 relation / causal layer。
- 明确第一版先做 `CausalHypothesis`。
- 明确大模型负责主要原因推理，后端负责结构化保存和证据约束。
- 明确原因假设进入 canonical truth，并由 projection 消费。
- 明确第一版使用独立表。
- 明确 provider detail contract 暴露原因假设，brief 暂不暴露。
- 明确读取路径不实时生成原因。
- 明确失败不阻塞事件入库。
- 明确第一版不做人审流。
- 明确 `causeType` 第一版使用少量受控枚举。
- 明确 `basis` 只表达来源类型，不混入置信度或状态。
- 明确 `confidence` 使用 `0..1` 小数。
- 明确 `unknown` 是事件级 `causalStatus`，不是伪造的原因假设记录。
- 明确 `causeType` 不包含 `unknown`。
- 明确 `statement` 和 `rationale` 的字段分工。
- 明确每条原因假设必须至少绑定一个 `evidenceId`，`factIds` 可为空但有结构化事实参与时必须填写。
- 明确第一版不复制长原文，只保存简短依据说明和轻量 `evidenceSpans` 定位。
- 明确 `input_checksum` 只覆盖模型实际输入和版本信息。
- 明确模型输入里的 selected evidence / selected facts 必须设上限并按权威性、相关性和结构化质量选择。
- 明确 `event_causal_hypothesis_runs.input_snapshot_json` 保存规范化、限量后的模型输入快照，用于审计和回放。
- 明确输入快照不保存 raw prompt、完整原文、完整 provider payload 或 provider secrets，也不进入 provider/frontend/ops light。
- 明确输入构建器使用独立 `input_builder_version`，写入 run 和输入快照，并参与 `input_checksum`。
- 明确 `event_causal_hypothesis_runs.output_snapshot_json` 保存结构化、脱敏后的模型输出快照，用于审计和回放。
- 明确输出快照不保存 provider 原始响应、raw prompt、完整模型输入、完整原文或 secrets，也不进入 provider/frontend/ops light。
- 明确 schema invalid 时仍保存最小输出快照，只含解析状态、错误摘要、输出大小和版本信息，不保存原始输出文本。
- 明确 `output_snapshot_json` 不参与 `input_checksum` 或生成去重 key。
- 明确输入/输出快照只保存在 `event_causal_hypothesis_runs`，不复制到 `event_causal_hypotheses`；原因假设表只通过 `generation_run_id` 关联 run。
- 明确第一版不自动清理、压缩归档或迁移输入/输出快照，只保留后续保留期、脱敏和归档扩展点。
- 明确 `input_snapshot_json` 最大 64KB，`output_snapshot_json` 最大 32KB；超限时保留审计骨架、记录 truncation 元数据并丢弃低优先级摘要字段。
- 明确快照截断不改变 `succeeded` / `unknown` run 状态，只记录 `snapshotTruncated`；只有连最小审计骨架都无法保存时才 `failed`。
- 明确快照截断、`snapshotTruncated` 和 truncation metadata 不进入 projection checksum，也不触发 projection stale。
- 明确 ops/status light 和 diagnostics 都不暴露完整 `input_snapshot_json` / `output_snapshot_json`；完整快照只能通过本地运行记录查看脚本按 `runId` 显式读取。
- 明确本地运行记录查看脚本默认只输出摘要，必须显式 `--include-snapshots` 才输出完整输入/输出快照，且始终不得输出 provider secrets、raw prompt 或 provider 原始 request/response payload。
- 明确本地运行记录查看脚本传 `--include-snapshots` 时输出已存储快照内容，不对快照内普通文本字段再做第二层隐藏。
- 明确完整快照打印必须精确到 `runId`；`--event-id` 只能列出 run 摘要和 `runId`，不能隐式选择某一次 run 打印快照。
- 明确 `--event-id` 摘要列表默认倒序列最近 20 条 run，支持 `--limit` 最大 100 和 `--status pending|running|succeeded|unknown|failed` 过滤，且只输出固定定位字段。
- 明确每条 run 必须记录 `trigger_source` / `trigger_reason`，用于内部审计、diagnostics 和本地脚本摘要，不进入 provider/frontend/MCP public contract。
- 明确 `trigger_source` / `trigger_reason` 不参与 `input_checksum` 或生成去重 key；同 key 重跑未来必须单独设计 `--force` 语义。
- 明确 retry run 使用 `trigger_source = "retry"`，通过 `retry_of_run_id` 指向上一条失败 run，并在 `trigger_reason` 记录可读重试原因。
- 明确第一版手动 backfill / repair 不提供 `--force`，不能绕过同 key 的 `pending` / `running` / `succeeded` / `unknown` run；未来 `--force` 必须单独设计 `force_reason` 和操作者来源。
- 明确 manual backfill / repair 因去重跳过时不写 `skipped` run、不新增 `skipped` status；脚本结果返回 skipped count、skip reason 和 existing runId。
- 明确 manual backfill / repair 全部 skipped 且 `failedCount = 0` 时退出码为 0；参数、数据库、配置、运行时异常或 `failedCount > 0` 时使用非 0。
- 明确 manual backfill / repair 部分候选失败时退出码非 0，但不回滚已成功排队的 run。
- 明确 manual backfill / repair 单候选失败后继续处理后续候选；全局预检失败立即停止且不写 run。
- 明确 manual backfill / repair 全局预检失败不计入 `failedCount`，返回 `queuedCount = 0`、`skippedCount = 0`、`failedCount = 0`，并通过 `target.scope = "global"` 的 `errors[]` 和非 0 退出码暴露。
- 明确 manual backfill / repair 脚本必须提供稳定 `--json` 输出契约，供内部自动化消费，且不暴露完整快照、raw prompt、provider 原始 payload 或 secrets。
- 明确 `--json` 顶层显式输出 `schemaVersion = 1`，参数解析失败时也输出；破坏性契约变更才递增。
- 明确 `scripts/backfill-causal-hypotheses.ts --json` 的 `mode` 固定为 `causal_hypothesis_backfill`，参数解析失败时也保持不变。
- 明确 `--json` 顶层显式输出整数 `exitCode`，并与进程实际退出码一致；第一版不输出 `ok` / `success` 布尔字段。
- 明确 `--json` 顶层显式输出非负整数 `durationMs`，参数解析失败时也输出；第一版不输出 `startedAt` / `finishedAt`。
- 明确 `requested` 只保存规范化安全请求字段，不保存原始 argv、环境变量、secret、prompt、provider payload、完整模型配置或 provider 参数。
- 明确 `requested` 记录应用稳定机器契约默认值后的有效请求，不记录显式参数集合；内部实现默认值不进入 `requested`。
- 明确 `requested` 当前版本已定义字段保持稳定形状；不适用的已定义可选字段写 `null`，未知或未来字段省略。
- 明确 `--json` 模式下已处理的非 0 失败仍向 stdout 输出唯一、完整、可解析 JSON；日志和人读错误只能走 stderr。
- 明确参数解析失败时 `requested = null`，并通过 global `invalid_arguments` / `argument_parse` / `retryable = false` 错误表达。
- 明确参数解析失败固定进入 `errors[]`，不得进入 `wouldErrors[]`，且不输出 dry-run 预览字段。
- 明确未知参数、拼写错误参数和当前版本不支持的未来参数必须严格失败，不得被忽略；它们使用 global `invalid_arguments` / `argument_parse` 错误表达。
- 明确 `scripts/backfill-causal-hypotheses.ts` 的 `--event-id` 和 `--run-id` 是互斥定位模式，同时出现时必须按参数解析失败处理，不选择优先级或隐式覆盖。
- 明确 manual backfill / repair 的 `errors[]` 和 `wouldErrors[]` 使用固定 `errorCode` 和固定 `phase`，自由文本只允许出现在 `message` 字段；`skipped` / `wouldSkip` 不进入错误数组。
- 明确 manual backfill / repair 的第一版错误对象只输出 `message`，不输出 `summary`。
- 明确 manual backfill / repair 的 `message` 必须脱敏，不得包含 raw exception、SQL、堆栈、provider 原始报错、prompt、payload、secret 或完整配置。
- 明确 manual backfill / repair 的默认 stderr / 本地日志必须脱敏；显式本地 debug 模式才允许更详细 raw exception 和堆栈，且仍不得输出 prompt、完整模型材料、provider 原始 request / response payload、secret 或完整配置。
- 明确 manual backfill / repair 的 debug 模式只能通过显式 `--debug` 开启，不支持环境变量开启；`--debug` 不进入 `requested`，不影响 stdout JSON 或业务执行结果。
- 明确 manual backfill / repair 的 `errors[]` 和 `wouldErrors[]` 必须包含 `retryable`，且由固定 `errorCode` / `phase` 计算，不依赖 `message` 文案。
- 明确 manual backfill / repair 的 `errors[]` 和 `wouldErrors[]` 必须使用固定 `target` 对象定位失败范围，不允许自由文本 `target`。
- 明确 `target.candidateIndex` 使用过滤、排序、`--limit` 截断后的最终候选列表 0-based 位置，并在可获得时同时带 `eventId`。
- 明确 dry-run JSON 必须用 `would*` 字段和 `executionBlocked` 表达预估结果，不能把预估结果写成真实执行结果。
- 明确 dry-run JSON 的 `executionBlocked` 表示真实 `--execute` 是否会被全局预检阻断；为 true 时 `wouldErrors[]` 必须包含 `target.scope = "global"` 的错误。
- 明确 `executionBlocked = true` 时 `would*` 字段仍是候选级预览，自动化不得把 `wouldQueueCount > 0` 当成当前可真实执行。
- 明确 `wouldFailCount` 只统计候选级预计失败，不统计 global 阻断；`executionBlocked = true` 时它仍可以因候选级失败大于 0。
- 明确 dry-run 完整候选级预览时 `wouldQueueCount + wouldSkipCount + wouldFailCount` 等于最终候选数量；无法产出最终候选列表时不要求守恒但必须返回 global error。
- 明确 dry-run JSON 显式输出 `candidateCount`，表示过滤、排序、`--limit` 截断后的最终候选数量；完整候选级预览时它等于三类 `would*Count` 之和。
- 明确 dry-run 无法产出最终候选列表时仍输出 `candidateCount = null`，不得省略字段或用 `0` 表示不可用。
- 明确 `candidateCount = null` 时三类 `would*Count` 固定为 `0`，候选级结果数组为空，但 `wouldErrors[]` 必须包含 global error。
- 明确 `--run-id` 精确定位到 `pending` 或 `running` run 时不重复排队，不进入 `errors[]` / `wouldErrors[]`；真实执行使用 `skipped[]`，dry-run 使用 `wouldSkip[]`，没有其他错误时退出码为 0。
- 明确 `--run-id` 精确定位到 `succeeded` 或 `unknown` run 时不重复排队，不进入 `errors[]` / `wouldErrors[]`；真实执行使用 `skipped[]`，dry-run 使用 `wouldSkip[]`，没有其他错误时退出码为 0。
- 明确 `--run-id` 精确定位到 `failed` run 时可以创建新的 retry run，但不复活旧 run，且仍受同 key 去重、retry backoff 和最大尝试次数约束。
- 明确 `--run-id <failedRunId>` retry 复用原 failed run 的输入身份和已保存输入材料；基于当前 canonical event 重新生成必须走 `--event-id`。
- 明确 `--event-id <eventId>` 先按当前 canonical event 构造输入；当前 key 命中 failed 历史时可进入 retry 链，当前 key 不同时创建普通 manual run。
- 明确 `--event-id <eventId>` 当前 key 命中多条 failed run 时，`retry_of_run_id` 指向同 key latest failed run，不能选择更早 failed run 绕过退避或最大尝试次数。
- 明确新 retry run 的 `attemptNumber` 固定为被重试 failed run 的 `attemptNumber + 1`，不重置、不沿用、不按历史数量重新统计。
- 明确 retry backoff 是否到期只使用 selected failed run 保存的 `nextAttemptAt`；不从 `finishedAt + backoff` 重算，明确终止失败缺少 `nextAttemptAt` 时按 `retry_terminal_failure` 跳过，未耗尽尝试次数且非终止失败缺少 `nextAttemptAt` 时作为候选级失败。
- 明确新建 `pending` retry run 的 `nextAttemptAt` 写入本次 run 创建时间，并立即满足 `nextAttemptAt <= now` 的 claim 条件。
- 明确原因假设生成需要单独记录 generation run。
- 明确每个 event 第一版最多 3 条 `active` 原因假设，且同一 `causeType` 最多 1 条 `active`。
- 明确成功 run 整体替换 active 集合，failed run 不替换旧 active。
- 明确 `causalStatus` 由 run 表和 active hypotheses 派生，不写入 `events` 表。
- 明确 projection checksum 包含当前 active 原因集合和派生 `causalStatus`，不包含历史审计。
- 明确读取路径可以同步 repair projection，但不能同步生成原因假设。
- 明确生成队列按 `eventId + inputChecksum + promptVersion + modelName` 去重，且 `failed` 可以按退避策略重试。
- 明确第一版复用现有 event engine worker / scheduler / backfill 体系，不新增独立常驻服务。
- 明确原因假设生成状态接入现有 ops/status，详细信息只在 diagnostics 模式展示。
- 明确第一版新增结构型 `causal-hypothesis` 质量门禁，不评判模型推理是否绝对正确。
- 明确技术方案已完成审批，可按实施计划进入代码实现。
- 明确原因假设实现为独立 `server/services/event-engine/causal-hypothesis/*` 子模块。
- 明确数据库读写拆到 `server/database/causal-hypotheses.ts`，不继续扩胖 `server/database/events.ts`。
- 明确 provider-facing 类型放在 `shared/types.ts`，内部生成/存储类型留在后端模块。
- 明确 `InvestmentCausalHypothesis` provider-facing 字段只暴露最小审计信息，不暴露 raw prompt、full input、checksum 或内部错误。
- 明确单条 `InvestmentCausalHypothesis` 不对外暴露内部 `status`。
- 明确 diagnostics 模式可暴露 run 级定位信息，但不得暴露 raw prompt、full model input、原始 payload 或 provider secrets。
- 明确 structured-output schema / prompt 沿用现有 event-engine prompt registry 模式，generator 不内联维护完整 prompt/schema。
- 明确模型 structured-output 顶层直接区分 `available` 和 `unknown`，技术失败由 generator/run 捕获为 `failed`。
- 明确模型单条 hypothesis 只输出可验证原因字段，系统补 id、label、状态、时间和 active 截断。
- 明确模型只能引用输入中给过的 evidence/fact id，无效引用直接判 invalid。
- 明确部分无效 hypothesis 会被丢弃并记录 diagnostics，仍有有效结果时 run 继续 succeeded。
- 明确第一版不设置最低 `confidence` 硬阈值，低置信但有有效证据的推断可以进入 active。
- 明确 active 排序优先 `basis = stated`，再看 confidence、evidence 权威性和稳定兜底顺序。
- 明确同一 `causeType` 只保留排序最高的一条 active，其他有效结果写入 `superseded`。
- 明确未入选 active 的 suppressed / superseded 审计记录不进入 projection checksum。
- 明确 backfill 是历史数据回填，第一版不自动全量回填历史事件，只提供手动、小批量、按投资优先级的补跑入口。
- 明确第一版必须提供内部 backfill/repair 脚本，不新增公开 provider API、frontend 按钮或 MCP public tool。
- 明确内部 backfill 脚本默认 dry-run，真实执行必须显式 `--execute`，并要求 `--limit` 或精确定位参数 `--event-id` / `--run-id`。
- 明确自动触发点放在 `scheduler.ts` 的 `persistResolvedEvent()` 事务提交之后，不把模型调用放进 canonical event 写入事务。
- 明确 `scheduler.ts` 只调用 causal service 小接口，原因业务逻辑留在 `server/services/event-engine/causal-hypothesis/service.ts`。
- 明确 projection repair / rebuild 只能消费已有原因结果，不能触发模型生成。
- 明确 `event_causal_hypothesis_runs` 同时作为持久队列和 run 审计记录，不新增独立 queue table，也不把纯内存队列当事实源。
- 明确 pending/running 任务通过 lease、attempt 和 retry backoff 恢复，进程重启不能丢任务。
- 明确第一版原因生成默认单并发，手动 backfill 最多允许 `--concurrency 2`。
- 明确第一版模型调用超时 45 秒、run lease 120 秒、最大尝试 4 次，即 1 次初始生成 + 3 次 retry；retry backoff 分别为 attempt 1 失败后 5 分钟、attempt 2 失败后 30 分钟、attempt 3 失败后 2 小时。
- 明确 attempt 4 终止失败 run 的 `nextAttemptAt = null`；是否 exhausted 由 `status = "failed"` 和 `attemptNumber >= 4` 判断。
- 明确 retry backoff 的 `failedAt` 使用失败实际生效时间；普通失败用失败落库时间，worker lease 超时用 `leaseExpiresAt`，不是发现超时的时间。
- 明确失败处理不立即创建 retry run；它只关闭当前 run 并保存 `nextAttemptAt`，到期后由统一 retry 入队流程创建可立即 claim 的 `pending` retry run。
- 明确统一 retry 入队由现有原因生成 worker / scheduler 调度轮次触发；自动调度顺序固定为恢复超时 `running`、入队 due retry、再 claim pending，手动 backfill / repair 复用同一套 retry 入队服务路径。
- 明确自动调度每轮最多成功创建 1 条 due retry run；候选排序复用后端投资优先级，再按 `nextAttemptAt`、`createdAt`、`runId` 稳定兜底；手动 backfill / repair 不继承这个自动每轮上限。
- 明确自动调度本轮创建的 due retry run 可以参与同一轮 pending claim；它不获得特殊优先级，是否被本轮 claim 取决于剩余 claim 容量和普通 pending 排序。
- 明确普通 pending claim 对初始自动 run、manual run 和 retry run 使用同一套稳定排序：后端投资优先级、`nextAttemptAt`、`createdAt`、`runId`；触发来源和 `retry_of_run_id` 不提供插队权。
- 明确 pending claim 必须通过数据库条件更新原子完成；只有把 `pending` 且到期的目标 run 更新为 `running` 并影响 1 行才算 claim 成功，影响 0 行不是 run 技术失败。
- 明确模型调用不放在 claim 数据库事务里；结果写回必须用 `runId`、`status = "running"`、`lockOwner` 和未过期 lease 做条件更新，防止过期 worker 覆盖后续状态。
- 明确结果写回影响行数为 0 后，当前 worker 已失去 run 所有权，不得再标记 failed、写失败字段、替换 active 原因假设或创建 retry；lease 过期由 scheduler 超时恢复处理。
- 明确第一版不支持 lease 续租；worker 不得通过心跳续租、保活字段、续租循环或续租 API 延长 `leaseExpiresAt`，超过 lease 的结果写回按过期写回处理。
- 明确模型调用达到 45 秒超时时必须主动取消或停止等待 provider 请求；lease 仍有效时写 `causal_hypothesis_model_timeout`，provider 迟到结果必须丢弃。
- 明确网络连接失败、HTTP 429、HTTP 500-599 和 provider 明确的临时不可用、过载、限流按 `causal_hypothesis_provider_transient_error` 写 failed 并进入统一 retry。
- 明确鉴权失败、权限不足、模型不存在、无效模型、请求非法和不支持的参数 / 格式 / 模型能力按 `causal_hypothesis_provider_permanent_error` 写 failed，`nextAttemptAt = null`，普通 retry 按 `retry_terminal_failure` 跳过。
- 明确修复凭证、权限、模型配置或请求结构后，普通 retry 仍不得自动重跑永久 provider 终止失败；未来如需重跑必须单独设计显式强制修复入口。
- 明确显式强制修复入口不进入第一版实现范围，不新增 force 命令行参数、脚本入口、API、frontend 按钮、MCP public tool、后台自动修复任务或 force 审计字段。
- 明确 ops/status light 展示永久 provider 错误聚合摘要：`permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt`；原始 provider 错误和 run 级定位只允许在 diagnostics 脱敏展示。
- 明确永久 provider 错误聚合摘要第一版使用当前保留 run 表的全量可见历史，不新增 rolling window 或统计窗口配置。
- 明确无永久 provider 错误时 ops/status light 仍固定返回 `permanentProviderErrorCount = 0` 和 `latestPermanentProviderErrorAt = null`。
- 明确 `permanentProviderErrorCount` 统计当前保留 run 表里所有 `status = "failed"` 且 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 run，不受 samples 字段完整性影响；`permanentProviderErrorCount > 0` 但没有可用 `finishedAt` 时，`latestPermanentProviderErrorAt = null`。
- 明确 ops/status diagnostics 固定返回 `permanentProviderErrorSamples` 数组；无样例时返回 `[]`，light 不返回该字段。
- 明确 `permanentProviderErrorSamples` 最多 10 条，按同一 run 记录持久化 `finishedAt` 倒序、`runId` 升序稳定排序后截断，且第一版不提供分页或筛选。
- 明确 `permanentProviderErrorSamples[]` 样例对象固定包含 `runId`、`eventId`、`finishedAt`、`provider`、`model`、`httpStatus`、`errorType`、`requestId` 和 `errorSummary`；`errorType` 必须是非空后端归一化枚举，其他缺失的诊断字段返回 `null`，不得省略字段或暴露原始 payload。
- 明确 `runId` 只能来自样例对应 failed run 自身的持久化主键，不得从日志行、provider request id、provider correlation id、provider payload、provider message、`retry_of_run_id`、其他关联 run、`eventId` 或 `inputChecksum` 推断；缺失时该 run 不进入 samples。
- 明确 `eventId` 只能来自同一 run 记录保存的 canonical event 绑定，不得从 provider payload、provider message、当前 canonical event lookup、当前 projection lookup、`retry_of_run_id` 链或其他历史 run 推断；缺失时该 run 不进入 samples。
- 明确 `finishedAt` 只能来自同一 run 记录持久化完成时间，不得使用 provider 时间、查询时间、脚本扫描时间、scheduler 发现失败时间、本地日志时间或重新推导出的时间；缺失时该 run 不进入 samples，也不得合成 `latestPermanentProviderErrorAt`。
- 明确第一版提供本地只读数据一致性检查脚本 `scripts/check-causal-hypothesis-run-consistency.ts`，用稳定 JSON 报告缺少持久化 `runId`、`eventId` 或 `finishedAt` 的永久 provider failed run；`errors[]` 复用 `target` / `errorCode` / `phase` / `retryable` / `message` 形状，但只允许 `invalid_arguments`、`database_unavailable`、`unexpected_runtime_error` 和 `argument_parse`、`database_scan`、`runtime`；全量 findings 先按影响 `latestPermanentProviderErrorAt`、缺字段数量、同一 run 持久化时间、`runId` / `eventId` 稳定排序，再应用 `--findings-limit`；`--findings-limit` 默认 `100`、最大 `1000`，只截断 `findings[]`，不影响 `summary` 全量统计；非 `--json` 人读模式和 `--json` 使用同一套退出码语义：无 findings 退出 `0`，有 findings 退出 `2`，参数、数据库或运行时失败退出 `1`；该脚本不进入 ops/status light，不新增公开 API、frontend 按钮或 MCP public tool，不自动修复，也不提供 `--repair`、`--fix`、`--execute` 或等价变更模式。
- 明确 `errorType` 第一版固定为 `authentication_failed`、`permission_denied`、`model_not_found`、`provider_config_invalid`、`invalid_request`、`unsupported_request` 或 `unknown_permanent_provider_error`，不得直接使用 provider 原始错误码或自由文本。
- 明确 `provider` 和 `model` 只能来自本系统发起 run 时已知的调用上下文或配置元数据，各自最多 128 个 Unicode code point，超限返回 `null`，不得裁剪、哈希、重编码、压缩或从 provider message、原始报错、`errorSummary`、response payload、stack trace、日志行、异常字符串中解析。
- 明确 `httpStatus` 只能是真实 HTTP 状态码整数 `100..599` 或 `null`，不得使用 SDK 自定义状态、provider 自定义错误码、网络错误码、系统错误码、DNS / TLS / socket 错误码、字符串状态码、`0`、负数或小数。
- 明确 `requestId` 只能来自 provider SDK / response metadata / response header 明确提供的 request id 或 correlation id，最多 128 个 Unicode code point，超限返回 `null`，不得裁剪、哈希、重编码、压缩或从 provider message、原始报错、`errorSummary`、stack trace、日志行、异常字符串中解析。
- 明确 `errorSummary` 必须是系统生成的脱敏短摘要，不得直接透传、截断、翻译、同义改写或轻度摘要 provider message；无法安全映射时返回 `errorSummary = null`。
- 明确 `errorSummary` 最多 200 个字符；超限时必须选择更短系统模板或返回 `null`，不得截断 provider message。
- 明确 `errorSummary` 的 200 字符上限按 Unicode code point 计数，不按 UTF-8 字节数或 JavaScript UTF-16 code unit。
- 明确达到最大尝试次数后的 `failed` 不阻塞事件入库，不清除已有 active 原因假设，只在 diagnostics 暴露。
- 明确第一版自动生成只覆盖 backend `actionBucket = actionable | watch` 的事件；`noise` 默认不自动生成，但内部脚本可通过精确 `--event-id` 或显式 `--include-noise` 强制。
- 明确批量 backfill 默认候选只包含 `actionable` / `watch`；`noise` 只有精确 `--event-id` 或显式 `--include-noise` 时进入。
- 明确 `--include-noise` 不能替代批量 `--limit`；没有 `--event-id` 或 `--run-id` 时，缺少 `--limit` 固定按参数解析失败处理。
- 明确批量 backfill 默认排序复用后端投资排序：bucket、投资分数、时间、`eventId`。
- 明确 `--limit` 必须是 `1..100` 的整数；`0`、负数、小数、非数字和超过 `100` 的值固定按参数解析失败处理，不做自动修正或静默截断。
- 明确当前版本已定义的命令行参数重复出现时固定按参数解析失败处理，不采用第一个值、最后一个值或合并值。
- 明确 `--execute` 和显式 `--dry-run` 互斥，同时出现时固定按参数解析失败处理，不选择优先级或隐式覆盖。
- 明确批量 backfill 的 `--limit` 在候选过滤和完整排序之后截断。
- 明确批量 backfill 的 `--limit` 限制候选数量，不限制最终新排队 run 数量；第一版不提供 `--target-queued`。
- 明确 `not_generated` 是事件级 `causalStatus`，用于表达策略性未自动生成；它不是 run 状态，也不是单条原因假设状态。
- 明确 ops/status 使用 `eligibleCoverage` 统计应自动生成事件覆盖率，`notGeneratedCount` 单独统计策略跳过；`not_generated` 不进入失败率或 pending。
- 明确原因假设生成使用独立大模型配置档：`event-engine-causal-hypothesis` / `EVENT_ENGINE_CAUSAL_HYPOTHESIS`，不复用 subject-role 或 watch-target 配置。
- 明确缺少原因生成模型配置时，自动触发不写入新的 `pending` run，不伪装成模型失败，ops/status 暴露 disabled / missing config。
- 明确手动 backfill / repair 缺少原因生成配置时，dry-run 可成功提示，`--execute` 预检失败且不写 `pending` / `failed` run。
- 明确缺少原因生成模型配置时，符合自动生成条件的事件 provider-facing `causalStatus` 仍为 `pending`，不新增状态、不复用 `not_generated`。
- 明确 ops/status 使用 `blockedByGeneratorConfigCount` 单独统计因原因生成器关闭或缺配置而无法写入 run 的 eligible event；它不进入 pending、failure 或 `notGeneratedCount`。
- 明确数据库迁移方式沿用当前 init + ensureColumn + SQL ownership 模式，第一版不新增独立 migration runner。
- 明确 run 表时间字段为 `created_at NOT NULL` + 可空 `started_at`，pending claim 排序不能依赖 `started_at`。
- 明确数据库读写接口、原因服务小接口、projection repair 边界和 provider/MCP/frontend 只读接入方式。
- 明确 structured-output prompt id/version、prompt 约束、fixture 和 schema 测试断言。
- 明确 projection checksum / repair 测试断言，run diagnostics、snapshot、trigger source 和 retry 链不影响 provider-facing projection。
- 明确 ops/status 使用固定 `causalHypothesis` 对象，light 不暴露 run/event 定位样例或内部 payload。
- 明确手动 backfill / repair 第一版只用 `--limit` 和 `--concurrency` 控制压力，不提供独立 `--rate-limit-ms` / `--delay-ms`。

## 3. 未完成内容

- 无。

## 4. 验证记录

最终验证：

- `pnpm docs:check`：通过。
- `git diff --check`：通过。
- `git diff --no-index --check -- /dev/null docs/backlog/20260510-causal-hypothesis-layer/*.md`：通过。
- `pnpm typecheck`：通过。
- `pnpm exec vitest run -c vitest.config.ts server/services/event-engine/investment-view.test.ts server/database/event-projections.test.ts server/services/investment-query/service.test.ts server/mcp/projection.test.ts`：通过，54 个测试通过。
- 初次用 `pnpm test ...` 跑同一组文件时，`server/database/event-projections.test.ts` 的一个用例触发 5 秒超时；随后单文件复跑和 `vitest run` 复跑均通过，未发现代码失败。
- `pnpm exec vitest run -c vitest.config.ts server/database/causal-hypotheses.test.ts`：通过，5 个测试通过。
- `pnpm exec vitest run -c vitest.config.ts server/services/event-engine/causal-hypothesis/prompt.test.ts server/services/event-engine/causal-hypothesis/generator.test.ts`：通过，11 个测试通过。
- `pnpm exec vitest run -c vitest.config.ts server/services/event-engine/causal-hypothesis/prompt.test.ts server/services/event-engine/causal-hypothesis/generator.test.ts server/database/causal-hypotheses.test.ts server/database/event-projections.test.ts server/services/event-engine/investment-view.test.ts server/services/investment-query/service.test.ts server/mcp/projection.test.ts`：通过，70 个测试通过。
- `pnpm exec vitest run -c vitest.config.ts server/services/event-engine/causal-hypothesis/service.test.ts`：通过，5 个测试通过。
- `pnpm exec vitest run -c vitest.config.ts server/services/event-engine/causal-hypothesis/prompt.test.ts server/services/event-engine/causal-hypothesis/generator.test.ts server/services/event-engine/causal-hypothesis/service.test.ts server/database/causal-hypotheses.test.ts server/database/event-projections.test.ts server/services/event-engine/investment-view.test.ts server/services/investment-query/service.test.ts server/mcp/projection.test.ts`：通过，75 个测试通过。
- `pnpm --silent events:backfill-causal-hypotheses --json --limit 1`：通过，dry-run 返回 `mode = causal_hypothesis_backfill`，`exitCode = 0`，`candidateCount = 1`，`wouldQueueCount = 1`。
- `pnpm exec vitest run -c vitest.config.ts server/services/event-engine/projection-pipeline.test.ts server/mcp/projection.test.ts server/services/investment-query/service.test.ts server/services/event-engine/causal-hypothesis/service.test.ts`：通过，29 个测试通过。
- `pnpm --silent events:backfill-causal-hypotheses --json --limit 1 --concurrency 2`：通过，dry-run 返回 `requested.concurrency = 2`、`exitCode = 0`。
- `pnpm --silent events:backfill-causal-hypotheses --json --limit 1 --concurrency 3`：按预期失败，返回 `errorCode = invalid_arguments`、`exitCode = 1`。
- `pnpm --silent events:check-causal-hypothesis-runs --json`：通过，`exitCode = 0`，当前 `permanentProviderFailedRunCount = 0`，`findingCount = 0`。
- `pnpm exec vitest run -c vitest.config.ts server/services/event-engine/causal-hypothesis/service.test.ts`：通过，6 个测试通过，覆盖 provider 异常落 failed run。
- `pnpm exec vitest run -c vitest.config.ts server/services/event-engine/causal-hypothesis/prompt.test.ts server/services/event-engine/causal-hypothesis/generator.test.ts server/services/event-engine/causal-hypothesis/service.test.ts server/database/causal-hypotheses.test.ts server/database/event-projections.test.ts server/services/event-engine/projection-pipeline.test.ts server/services/event-engine/investment-view.test.ts server/services/investment-query/service.test.ts server/mcp/projection.test.ts`：通过，82 个测试通过。
- `pnpm --silent events:backfill-causal-hypotheses --json --event-id evt_7e7c910b2dcd9b3bb3aa8c7da335adde`：通过，dry-run 返回 `candidateCount = 1`、`wouldQueueCount = 1`。
- `./scripts/service.sh build-start`：通过，生产构建完成并通过 launchd 重启本地服务。
- `GET http://127.0.0.1:3000/api/investment-events/evt_7e7c910b2dcd9b3bb3aa8c7da335adde`：通过，返回 `causalStatus = pending`、`causalHypotheses.length = 0`、`keyFacts[0].factId` 存在。
- `GET http://127.0.0.1:3000/api/ops/events/status?mode=light`：通过，返回 `causalHypothesis` 聚合对象。
- `HEAD http://127.0.0.1:3000/events/evt_7e7c910b2dcd9b3bb3aa8c7da335adde`：通过，返回 `200 OK`。

## 5. 剩余风险

- 原因假设如果没有严格输入依据，容易退化成不可审计叙事。
- 如果在读取路径实时生成，会破坏性能、成本和可回放性。
- 如果只写 projection，不写 canonical truth，会导致 frontend/API/MCP 语义漂移。
- 如果过早扩展成通用关系图，会偏离“为什么会发生”的产品主线。

## 6. 下一步

- 可进入 code review / commit。
