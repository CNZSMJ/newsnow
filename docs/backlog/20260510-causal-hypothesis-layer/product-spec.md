# Causal Hypothesis Layer Product Spec

状态：Ready for Implementation；产品定义已定稿，待实现
最后更新：2026-05-25
范围：Stage B 第二层“为什么会发生”的产品目标与用户价值

## 1. 目标

为 canonical investment event 增加“原因假设”能力，让系统在事件详情中结构化回答：

> 这个事为什么会发生？

这不是新闻摘要，也不是后续建议。它是对事件上游驱动因素的结构化解释。

## 2. 用户价值

严肃投资者不只需要知道发生了什么，还需要判断：

- 这是孤立事件，还是某个变化的结果
- 事件背后是否有政策、数据、公司动作、流动性或市场情绪驱动
- 原因是证据明确显示，还是系统基于当前材料推断
- 推断依据是否可复核
- 当前证据是否不足，不能强行解释

`CausalHypothesis` 的价值是把“为什么发生”从自由文本叙事变成可展示、可审计、可回放的结构化投资语义。

## 3. 范围

In scope：

- 新增 canonical 原因假设结构。
- 原因假设由大模型主导生成。
- 后端负责结构化保存、证据引用、状态、版本和重算。
- 事件详情 provider contract 暴露 `causalHypotheses` 和 `causalStatus`。
- 前端详情页默认展示未撤回原因假设。
- 本地 MCP 详情工具暴露 provider adapter 结构。
- 生成失败不阻塞 canonical event 入库。
- 第一版自动生成只覆盖后端判断为 `actionable` / `watch` 的投资相关事件。
- `noise` 事件默认不自动生成原因，但内部脚本可以通过精确 `--event-id` 或显式 `--include-noise` 强制生成。

Out of scope：

- 不做通用事件关系图。
- 不把 `relatedEvents` 升级成 causal layer。
- 不用后端规则穷举原因判断。
- 不在读取路径实时调用大模型。
- 不把原因假设写进 frontend、prompt、skill 或 MCP formatter 作为新真相源。
- 不在第一版做人审流。
- 不进入 `InvestmentEventBrief` 列表合同。
- 不设计最终 public MCP agent 语义；该边界属于 `nexus-fi-mcp`。

## 4. 用户可见行为

事件详情页新增“为什么会发生”区域。

当原因可用时，展示所有未撤回原因假设，并标注：

- `证据显示`：原文或证据明确支持的原因
- `可能原因`：大模型基于当前材料推断的原因
- 置信度
- 简短依据说明
- 证据与事实引用

当原因不可用时，区分：

- `未自动生成`：事件被后端判定为 `noise`，第一版策略性跳过自动生成
- `原因待确认`：已经分析过，但当前材料不足
- `原因生成中`：尚未生成或正在排队
- `原因生成失败`：技术失败，可等待后续修复

如果原因生成器因为内部配置关闭或缺少配置而无法自动工作，投资者默认界面仍显示“原因生成中”。配置原因只进入内部 ops/status，不作为新的投资者可见状态。

## 5. 验收标准

- 原因假设作为 canonical truth 存储，而不是只存在于 projection。
- 每条原因假设都有明确输入依据，不能保存无来源自由发挥。
- `InvestmentEventDetail` 能返回 `causalStatus` 和 `causalHypotheses`。
- `InvestmentEventBrief` 第一版不新增原因字段。
- 前端详情页不把推断原因写成确定结论。
- 前端详情页不提供立即生成、强制重跑、查看 run 或查看 snapshot 的入口。
- 读取路径不会实时调用大模型。
- 生成失败不阻塞事件入库。
- `noise` 事件不会因为被打开详情页而触发自动生成。
- 状态能区分 `not_generated`、`pending`、`unknown`、`available`、`failed`。
- 原因生成器关闭或缺少配置时，符合自动生成条件的事件仍返回 `pending`，内部 ops/status 解释 disabled / missing config。
- 内部 backfill / repair 脚本能用稳定 `--json` 输出支持自动化调用，且不暴露完整快照、原始提示词、供应商原始载荷或密钥。
- 内部 backfill / repair 脚本的 `schemaVersion` 第一版固定为整数 `1`，参数解析失败时也输出。
- 内部 backfill / repair 脚本的 `mode` 固定为 `causal_hypothesis_backfill`，参数解析失败时也保持不变。
- 内部 backfill / repair 脚本的 `exitCode` 是整数，且与进程实际退出码一致。
- 内部 backfill / repair 脚本的 `durationMs` 是非负整数毫秒，参数解析失败时也输出。
- 内部 backfill / repair 脚本的 `requested` 只包含规范化后的安全请求字段，用于审计和复现用户意图。
- 内部 backfill / repair 脚本的 `requested` 记录应用稳定机器契约默认值后的有效请求，不记录显式参数集合。
- `requested` 包含 `includeNoise = false`、`concurrency = 1` 等稳定默认值；如果 `limit` 存在稳定机器契约默认值，也记录最终有效 limit。
- `requested` 不包含内部批大小、数据库分页大小等内部实现默认值。
- `requested` 的当前版本已定义字段保持稳定形状；不适用于当前请求的已定义可选字段写 `null`。
- `eventId`、`runId` 和 `limit` 不适用时写 `null`；未知字段、未来字段或当前版本没有定义的字段省略。
- `includeNoise`、`dryRun` 和 `execute` 是布尔字段，只要 `requested` 不是 `null` 就始终存在；`concurrency` 是整数，默认值为 `1`。
- 内部 backfill / repair 脚本在 `--json` 模式下，即使已处理失败导致非 0 退出，也向 stdout 输出唯一、完整、可解析 JSON。
- 内部 backfill / repair 脚本在参数解析失败时仍保留 `requested` 字段并设为 `null`，不用半解析参数或原始命令行填充它。
- 内部 backfill / repair 脚本在参数解析失败时使用 `errors[]`，不使用 `wouldErrors[]`，也不输出 dry-run 预览字段。
- 未知参数、拼写错误参数和当前版本不支持的未来参数必须严格失败，使用 `invalid_arguments` / `argument_parse` / `target.scope = "global"` 表达，不得被忽略。
- `scripts/backfill-causal-hypotheses.ts` 的 `--event-id` 和 `--run-id` 是互斥定位模式；二者同时出现时必须按参数解析失败处理，不能选择优先级或隐式覆盖。
- `--include-noise` 不能替代批量 `--limit`；没有 `--event-id` 或 `--run-id` 时，缺少 `--limit` 必须按参数解析失败处理。
- `--limit` 必须是 `1..100` 的整数；`0`、负数、小数、非数字和超过 `100` 的值必须按参数解析失败处理，不得自动修正或静默截断。
- `--concurrency` 必须是 `1..2` 的整数；`0`、负数、小数、非数字和超过 `2` 的值必须按参数解析失败处理，不得自动修正或静默截断。
- 第一版不提供独立 `--rate-limit-ms`、`--delay-ms` 或等价限速参数；模型调用压力只通过 `--limit` 和 `--concurrency` 控制。
- 当前版本已定义的命令行参数重复出现时必须按参数解析失败处理，不得选择第一个值、最后一个值或合并多个值。
- `--execute` 和显式 `--dry-run` 互斥；二者同时出现时必须按参数解析失败处理，不能让一个覆盖另一个。
- 内部 backfill / repair 脚本的 dry-run JSON 能明确区分预估结果和真实执行结果。
- 内部 backfill / repair 脚本的 dry-run JSON 使用 `executionBlocked` 明确表达真实执行是否会被全局预检阻断。
- 当 `executionBlocked = true` 时，dry-run 的 `would*` 字段仍是候选级预览，不能被自动化当成当前可真实执行。
- dry-run 的 `wouldFailCount` 只统计候选级预计失败，不统计全局阻断。
- dry-run 完整产出候选级预览时，`wouldQueueCount + wouldSkipCount + wouldFailCount` 等于过滤、排序、`--limit` 截断后的最终候选数量。
- dry-run JSON 显式输出 `candidateCount`，表示过滤、排序、`--limit` 截断后的最终候选数量。
- dry-run 无法产出最终候选列表时仍输出 `candidateCount = null`，并通过 `executionBlocked = true` 和 global `wouldErrors[]` 表达不可执行原因。
- `candidateCount = null` 时，dry-run 仍输出稳定的 `would*Count = 0` 和空候选级结果数组，自动化不得把这些 `0` 解释成有效空候选列表。
- `--run-id` 精确定位到 `pending` 或 `running` run 时不重复排队，不进入 `errors[]` / `wouldErrors[]`；真实执行用 `skipped[]` 表达，dry-run 用 `wouldSkip[]` 表达，没有其他错误时退出码为 0。
- `--run-id` 精确定位到 `succeeded` 或 `unknown` run 时不重复排队，不进入 `errors[]` / `wouldErrors[]`；真实执行用 `skipped[]` 表达，dry-run 用 `wouldSkip[]` 表达，没有其他错误时退出码为 0。
- `--run-id` 精确定位到 `failed` run 时允许创建新的 retry run；不复活旧 run，且仍受同 key 去重、retry backoff 和最大尝试次数约束。
- `--run-id <failedRunId>` retry 复用原 failed run 的输入身份和已保存输入材料；如果要基于当前 canonical event 重新生成，必须使用 `--event-id`。
- `--event-id <eventId>` 先按当前 canonical event 构造输入；当前 key 命中 failed 历史时可进入 retry 链，当前 key 不同时创建普通 manual run。
- `--event-id <eventId>` 当前 key 命中多条 failed run 时，`retry_of_run_id` 指向同 key 最新 failed run，不能选择更早 failed run 绕过退避或最大尝试次数。
- 新 retry run 的 `attemptNumber` 固定为被重试 failed run 的 `attemptNumber + 1`，不重置、不沿用、不按历史数量重新统计。
- retry backoff 是否到期只使用 selected failed run 保存的 `nextAttemptAt`；不从 `finishedAt + backoff` 重算，明确终止失败缺少 `nextAttemptAt` 时按 `retry_terminal_failure` 跳过，未耗尽尝试次数且非终止失败缺少 `nextAttemptAt` 时作为候选级失败。
- 新建 `pending` retry run 的 `nextAttemptAt` 写入本次 run 创建时间，并立即满足 `nextAttemptAt <= now` 的 claim 条件。
- 失败处理不立即创建 retry run；它只把当前 run 关闭为 `failed` 并保存 `nextAttemptAt`，到期后再由统一 retry 入队流程创建可立即 claim 的 `pending` retry run。
- 统一 retry 入队由现有原因生成 worker / scheduler 调度轮次触发；自动调度顺序固定为恢复超时 `running`、入队 due retry、再 claim pending，手动 backfill / repair 也复用同一套 retry 入队服务路径。
- 自动调度每轮最多成功创建 1 条 due retry run；候选排序复用后端投资优先级，再按 `nextAttemptAt` 最早、`createdAt` 最早、`runId` 稳定兜底。手动 backfill / repair 不继承这个自动每轮上限。
- 自动调度本轮创建的 due retry run 可以进入同一轮 pending claim；它不获得特殊优先级，是否被本轮 claim 取决于剩余 claim 容量和既有 pending claim 排序。
- 普通 pending claim 对初始自动 run、manual run 和 retry run 使用同一套稳定排序：后端投资优先级、`nextAttemptAt`、`createdAt`、`runId`；触发来源和 `retry_of_run_id` 不提供插队权。
- pending claim 必须通过数据库条件更新原子完成，只能把 `status = "pending"` 且 `nextAttemptAt <= now` 的目标 run 改为 `running` 并写入 `lockedAt`、`lockOwner`、`leaseExpiresAt`；影响行数为 1 才算 claim 成功。
- 模型调用不放在 claim 数据库事务里；结果写回必须用 `runId`、`status = "running"`、`lockOwner`、`leaseExpiresAt > now` 做条件更新，影响 1 行才算落库成功。
- 结果写回影响行数为 0 表示当前 worker 已失去所有权；它不得再标记 `failed`、写 `finishedAt` / `nextAttemptAt` / 错误码 / 输出快照、替换 active 原因假设或创建 retry，后续由 scheduler 超时恢复或当前所有者处理。
- 第一版不支持 lease 续租；claim 成功后不得通过心跳续租、保活字段、续租循环或续租 API 延长 `leaseExpiresAt`，超过 lease 的结果写回按过期写回处理。
- 模型调用达到 45 秒超时时，worker 必须主动取消或停止等待 provider 请求；lease 仍有效时写 `failed`、`causal_hypothesis_model_timeout` 和 `nextAttemptAt`，迟到 provider 结果必须丢弃。
- 网络连接失败、HTTP 429、HTTP 500-599 和 provider 明确的临时不可用、过载或限流按临时 provider 错误处理；lease 仍有效时写 `failed`、`causal_hypothesis_provider_transient_error` 和 `nextAttemptAt`，后续进入统一 retry。
- 鉴权失败、权限不足、模型不存在、无效模型、请求非法和不支持的参数 / 格式 / 模型能力按永久 provider 错误处理；lease 仍有效时写 `failed`、`causal_hypothesis_provider_permanent_error` 和 `nextAttemptAt = null`，后续普通 retry 按 `retry_terminal_failure` 跳过。
- 修复凭证、权限、模型配置或请求结构后，普通 retry 仍不得自动重跑永久 provider 终止失败；第一版不提供隐式 force 或自动修复后重跑。
- 第一版不提供显式强制修复入口；不新增 force 命令行参数、脚本入口、公开 provider API、frontend 按钮、MCP public tool 或后台自动修复任务。
- ops/status light 展示 `permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt`，但不暴露 provider 原始报错或内部定位列表；永久 provider 错误 run 级详情只在 diagnostics 脱敏展示。
- `permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt` 第一版基于当前保留 run 表的全量可见历史统计，不新增 rolling window 或统计窗口配置。
- ops/status light 始终返回 `permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt`；没有永久 provider 错误时分别为 `0` 和 `null`。
- `permanentProviderErrorCount` 统计当前保留 run 表里所有 `status = "failed"` 且 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 run；不得因为 run 缺少 samples 所需的 `runId`、`eventId`、`finishedAt` 或其他诊断字段而排除。
- `latestPermanentProviderErrorAt` 只从永久 provider failed run 中已有持久化 `finishedAt` 的 run 取最大值；`permanentProviderErrorCount > 0` 但没有可用 `finishedAt` 时，`latestPermanentProviderErrorAt = null`。
- ops/status diagnostics 始终返回 `permanentProviderErrorSamples` 数组；没有样例时返回 `[]`，light 不返回该字段。
- `permanentProviderErrorSamples` 最多 10 条，按同一 run 记录持久化 `finishedAt` 倒序、`runId` 升序稳定排序后截断；第一版不提供分页、offset、cursor 或按事件筛选。
- `permanentProviderErrorSamples[]` 固定包含 `runId`、`eventId`、`finishedAt`、`provider`、`model`、`httpStatus`、`errorType`、`requestId` 和 `errorSummary`；`errorType` 必须是非空后端归一化枚举，其他缺失的诊断字段返回 `null`，不得省略字段。
- `runId` 只能来自样例对应 failed run 自身的持久化主键；不得从日志行、provider request id、provider correlation id、provider payload、provider message、`retry_of_run_id`、其他关联 run、`eventId` 或 `inputChecksum` 推断；缺失时该 run 不进入 samples。
- `eventId` 只能来自同一 run 记录保存的 canonical event 绑定；不得从 provider payload、provider message、当前 canonical event lookup、当前 projection lookup、`retry_of_run_id` 链或其他历史 run 推断；缺失时该 run 不进入 samples。
- `finishedAt` 只能来自同一 run 记录的持久化完成时间；不得使用 provider 时间、查询时间、脚本扫描时间、scheduler 发现失败时间、本地日志时间或重新推导出的时间；缺失时该 run 不进入 samples，也不得为 `latestPermanentProviderErrorAt` 合成替代时间。
- 第一版提供本地只读数据一致性检查脚本 `scripts/check-causal-hypothesis-run-consistency.ts`，用于报告因缺少持久化 `runId`、`eventId` 或 `finishedAt` 而不能进入 `permanentProviderErrorSamples[]` 的永久 provider failed run；该脚本不进入 ops/status light，不新增公开 API、frontend 按钮或 MCP public tool。
- `scripts/check-causal-hypothesis-run-consistency.ts --json` 的 `mode` 固定为 `causal_hypothesis_run_consistency_check`，`schemaVersion = 1`，`exitCode` 与实际退出码一致；检查完成无问题退出 `0`，发现一致性问题退出 `2`，参数、数据库或运行时失败退出 `1`。
- 数据一致性检查脚本非 `--json` 模式可以输出简短人读摘要，但退出码必须和 `--json` 完全一致：无 findings 退出 `0`，有 findings 退出 `2`，参数、数据库或运行时失败退出 `1`。
- 数据一致性检查脚本的 `errors[]` 复用 `target`、`errorCode`、`phase`、`retryable`、`message` 对象形状，但第一版只允许 `invalid_arguments`、`database_unavailable`、`unexpected_runtime_error` 三个 `errorCode`，以及 `argument_parse`、`database_scan`、`runtime` 三个 `phase`；数据一致性问题进入 `findings[]`，不进入 `errors[]`。
- 数据一致性检查脚本的 `summary` 基于当前保留 run 表全量统计，`findingsLimit` 只限制 `findings[]` 返回数量；`--findings-limit` 默认 `100`、最大 `1000`，超过上限或非法值按参数解析失败处理，不自动截断；缺失 `provider`、`model`、`httpStatus`、`requestId` 或 `errorSummary` 不算 samples 排除问题。
- 数据一致性检查脚本必须先对全量 findings 稳定排序，再应用 `findingsLimit`；排序优先级为影响 `latestPermanentProviderErrorAt` 优先、缺字段数量多优先、同一 run 记录可用持久化时间倒序、`runId` / `eventId` 升序兜底。
- 数据一致性检查脚本第一版不提供 `--repair`、`--fix`、`--execute` 或等价变更模式；`recommendedAction` 只是稳定建议枚举，不表示脚本能执行修复。
- `errorType` 第一版固定为 `authentication_failed`、`permission_denied`、`model_not_found`、`provider_config_invalid`、`invalid_request`、`unsupported_request` 或 `unknown_permanent_provider_error`，不得直接使用 provider 原始错误码或自由文本。
- `provider` 和 `model` 只能来自本系统发起 run 时已知的调用上下文或配置元数据；各自最多 128 个 Unicode code point；超限或无法确认时返回 `null`；不得裁剪、加省略号、哈希、重编码、压缩，也不得从 provider message、原始报错、`errorSummary`、response payload、stack trace、日志行或异常字符串中解析。
- `httpStatus` 只能是真实 HTTP 状态码整数 `100..599` 或 `null`；不得使用 SDK 自定义状态、provider 自定义错误码、网络错误码、系统错误码、DNS / TLS / socket 错误码、`0`、负数、小数或字符串状态码；无法确认真实 HTTP response status 时返回 `null`。
- `requestId` 只能来自 provider SDK / response metadata / response header 明确提供的 request id 或 correlation id；最多 128 个 Unicode code point；超限或缺失时返回 `null`；不得裁剪、加省略号、哈希、重编码、压缩，也不得从 provider message、原始报错、`errorSummary`、stack trace、日志行或异常字符串中解析。
- `errorSummary` 是系统生成的脱敏短摘要，不得直接透传、截断、翻译、同义改写或轻度摘要 provider message；无法安全映射时返回 `errorSummary = null`。
- `errorSummary` 最多 200 个字符；超限时必须选择更短系统模板或返回 `null`，不得截断 provider message。
- `errorSummary` 的 200 字符上限按 Unicode code point 计数，不按 UTF-8 字节数或 JavaScript UTF-16 code unit。
- 最大尝试次数为 4 次，即 1 次初始生成 + 3 次 retry；三档 retry backoff 分别对应 attempt 1、2、3 失败后，attempt 4 失败后保持 `failed`。
- attempt 4 终止失败 run 的 `nextAttemptAt = null`；是否 exhausted 由 `status = "failed"` 和 `attemptNumber >= 4` 判断。
- retry backoff 的 `failedAt` 使用失败实际生效时间；普通失败用失败落库时间，worker lease 超时用 `leaseExpiresAt`，不是发现超时的时间。
- 批量 backfill 默认候选只包含 `actionable` / `watch`，`noise` 只在精确 `--event-id` 或显式 `--include-noise` 时进入。
- 批量 backfill 默认排序复用后端投资排序，不新增原因生成专属优先级。
- 批量 backfill 的 `--limit` 在候选过滤和完整排序之后截断。
- 批量 backfill 的 `--limit` 是候选安全边界，不承诺排满同数量的新 run。
- 手动 backfill / repair 缺少原因生成配置时，dry-run 可以暴露候选和阻塞原因，execute 不写入任何 run 并以配置错误失败。
- 手动 backfill / repair 部分候选失败时整体退出码非 0，但已经成功排队的 run 不回滚。
- 手动 backfill / repair 单个候选失败时继续处理后续候选；全局预检错误在写 run 前停止。
- 手动 backfill / repair 全局预检失败不计入 `failedCount`；它使用 `target.scope = "global"` 的错误和非 0 退出码表达。
- 手动 backfill / repair 的 `errors[]` 和 `wouldErrors[]` 使用固定 `errorCode` 和 `phase`，不能依赖自由文本做机器判断。
- 第一版 `errorCode` 和 `phase` 是固定枚举；自由文本只允许出现在 `message`。
- 第一版错误对象只输出 `message`，不输出 `summary`。
- `message` 是简短脱敏的人读说明，不包含 raw exception、SQL、堆栈、provider 原始报错、prompt、payload、secret 或完整配置。
- 默认 stderr / 本地日志必须脱敏，并输出 `errorCode`、`phase`、`target`、run / event 定位信息或 correlation id。
- 显式本地 debug 模式可以输出更详细 raw exception 和堆栈；stderr / 本地日志始终不得输出 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload、secret、token、credential 或完整配置。
- 显式本地 debug 模式只能通过命令行 `--debug` 开启，不支持环境变量开启。
- `--debug` 不进入 `requested`，不影响 stdout JSON、候选选择、执行行为、去重行为、退出码或数据库写入。
- 参数解析失败使用 `errorCode = "invalid_arguments"`、`phase = "argument_parse"`、`target.scope = "global"` 和 `retryable = false`。
- 参数解析失败时 `dryRun = false`、`execute = false`，不能因为原始命令行看起来包含 dry-run 意图就写入 `wouldErrors[]`。
- 参数解析失败时请求是否成立由 `requested`、`dryRun`、`execute` 和结构化错误表达，不由 `mode` 表达。
- 自动化按 `mode + schemaVersion` 选择 JSON 解析逻辑；兼容性新增字段不提升 `schemaVersion`。
- `exitCode = 0` 不代表真实 execute 一定可执行；dry-run 是否被全局阻断仍看 `executionBlocked`。
- 第一版不输出 `ok` 或 `success` 布尔字段。
- 第一版不输出 `startedAt` 或 `finishedAt`，墙钟时间由外层调度日志记录。
- `requested` 不保存原始 argv、环境变量、secret、raw prompt、完整模型输入、provider 原始 payload、完整模型配置或 provider 参数。
- 手动 backfill / repair 的 `errors[]` 和 `wouldErrors[]` 包含 `retryable`，供自动化判断是否可自动重试。
- 手动 backfill / repair 的 `errors[]` 和 `wouldErrors[]` 使用固定 `target` 对象定位失败范围，不能用自由文本描述目标。
- `target.candidateIndex` 使用过滤、排序、`--limit` 截断后的最终候选列表 0-based 位置，并在可获得时同时带 `eventId`。
- 文档、测试和质量指标能覆盖主要降级路径。
