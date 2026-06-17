# Causal Hypothesis Layer Research

状态：Design Review 完成；结论已写入技术方案
最后更新：2026-05-25
范围：Stage B 第二层“为什么会发生”的原因假设层调研与边界确认

## 1. 背景

`newsnow` 当前已经完成 canonical event engine 的 foundation 闭环。

现有系统已经能回答第一层“发生了什么事”，并已具备：

- canonical event / fact / evidence / entity linkage 存储
- `InvestmentEventBrief` / `InvestmentEventDetail` provider-facing projection
- `event_projection` 与 `event_query_indexes` 在线读取模型
- `impactSummary`、方向、重要性、可交易性、观察标的候选等投资语义字段

但 Stage B 的第二层“这个事为什么会发生”还没有正式建模。当前代码里的 `relatedEvents` 和 `event_query_indexes.related` 是查询/投影邻接能力，不是原因或因果语义层。

## 2. 已确认的术语边界

### 2.1 `related-events` 不是 relation / causal layer

现有 `relatedEvents`、`InvestmentRelatedEventsSection` 和 `event_query_indexes.related` 只表示相关事件查询能力。

它们可以按 entity、topic、market、family 或显式 related index 找到相近事件，但不能被当作第二层 relation graph 或 causal hypothesis。

### 2.2 第一版先做 `CausalHypothesis`

第二层第一版先建模 `CausalHypothesis`，即“原因假设”。

不先做泛化的 `EventRelation`，因为产品主线第二问是“这个事为什么会发生”，不是“还有哪些相关事件”。

### 2.3 原因假设只回答“为什么会发生”

`CausalHypothesis` 不直接回答：

- 会影响什么
- 方向是什么
- 重要性是多少
- 是否可交易
- 后续建议是什么

这些分别属于 impact、investment mapping 和 action layer。

## 3. 推理边界

### 3.1 大模型负责主要推理

原因推理主要依赖大模型理解文本、事实和上下文。

后端不应该用规则穷举原因判断。规则很容易漏规则、误伤和过拟合。

### 3.2 后端负责结构化保存和证据约束

后端职责不是判断“原因真理”，而是：

- 保存结构化原因假设
- 绑定 evidence / fact 引用
- 标记明示原因、推断原因或未知
- 保存置信度、模型版本、输入范围和生成状态
- 支持自动重算、撤回、替换和审计

### 3.3 不允许无来源自由发挥

低置信推断可以进入原因假设，但完全没有证据来源、也没有明确输入依据的模型自由发挥不能进入。

每条原因假设都必须至少能说明它依据了哪些输入材料。

每条原因假设必须至少绑定一个 `evidenceId`。`factIds` 可以为空，因为部分原因来自标题、摘要或正文语义，不一定已经结构化成 `event_facts`。如果结构化事实参与了判断，则必须绑定对应 `factIds`。

第一版不在原因表里保存长原文摘录。原因表只保存简短 `rationale`、`evidenceIds`、`factIds` 和必要的 `evidenceSpan` 定位元数据。

`evidenceSpan` 只能用于定位依据，不能替代 canonical evidence 原文。候选字段包括：

- `evidenceId`
- `field`：`title` / `summary` / `payload`
- `snippet`
- `offset`

## 4. 数据形态结论

`CausalHypothesis` 第一版必须是结构化数组，而不是单个自由文本字段。

最小结构需要覆盖：

- `hypothesisId`
- `eventId`
- `causeType`
- `statement`
- `basis`：`stated` / `inferred`
- `confidence`
- `rationale`
- `evidenceIds`
- `factIds`
- 内部模型/运行信息
- 内部生命周期状态

其中，模型/运行信息和内部生命周期状态用于审计、去重和 diagnostics，不进入默认 provider-facing `InvestmentCausalHypothesis`。

`causeType` 第一版使用少量受控枚举：

- `policy_or_regulation`
- `macro_or_liquidity`
- `industry_supply_demand`
- `company_action`
- `market_flow_or_sentiment`
- `external_event`

`basis` 只表达真实原因假设的来源类型，不表达置信度、生命周期或生成状态。

置信度由 `confidence` 表达；单条原因假设的生命周期由 `status` 表达；整个事件的原因生成状态由 `causalStatus` 表达。

`unknown` 是事件级 `causalStatus`，不是一条伪造的原因假设。材料不足时返回 `causalStatus = "unknown"` 和空 `causalHypotheses`，不要写入 `statement = "原因待确认"` 的占位记录。

`confidence` 第一版使用 `0..1` 小数，表示模型/抽取置信度，不使用 `0..100` 投资评分语义。

`statement` 和 `rationale` 明确分工：

- `statement`：一句话说明原因假设是什么。
- `rationale`：说明系统为什么这么判断，引用了哪些输入线索。
- `evidenceIds` / `factIds`：提供机器可追踪引用。
- `evidenceSpans`：提供轻量定位，不复制长原文。

`evidenceIds` 是最低审计底线。完全没有 `evidenceId` 的原因不能进入 `CausalHypothesis`。

第一版应建立独立表，例如 `event_causal_hypotheses`，不要塞进 `events.causal_hypotheses_json`。

原因假设只引用现有 `event_facts` / `event_evidence`，不复制事实内容，避免 canonical fact/evidence 修复后出现副本漂移。

## 5. 生成与降级边界

第一版生成时机：

- 新 canonical event 创建后
- event facts 变化后
- evidence 新增或替换后
- 手动 backfill / repair 时
- 模型版本或 prompt 版本显式升级时

这里的 backfill 指历史数据回填：对功能上线前已经存在的历史事件补跑原因假设生成。

第一版不自动全量回填历史事件。

策略：

- 新事件自动生成。
- facts / evidence 更新时自动生成或重算。
- 提供手动 backfill / repair 入口。
- backfill 默认按投资优先级、小批量、低并发执行。
- 不在上线时自动扫描全部历史事件。

手动 backfill / repair 第一版作为内部 ops 能力，不新增公开 provider API，但必须提供对应脚本。

边界：

- provider API 只读结果，不触发生成。
- frontend 详情页不提供“立即生成原因”按钮。
- 本地 MCP 不提供触发 backfill 的 public tool。
- ops/manual repair 可以触发小批量补跑。
- 提供内部脚本，例如 `scripts/backfill-causal-hypotheses.ts`。
- 脚本必须支持 `--limit`、优先级过滤、`--dry-run` 或 preview、`--concurrency`。
- 第一版不提供独立 `--rate-limit-ms`、`--delay-ms` 或等价限速参数；压力控制只通过 `--limit` 和 `--concurrency`。
- 脚本默认 dry-run / preview。
- 真实执行必须显式传 `--execute`。
- dry-run 输出将处理的 event 数量、排序前若干 eventId、预计模型调用数量。
- 没有精确定位参数时必须要求 `--limit`。
- 默认 limit 上限保守，例如最大 100。
- 支持 `--event-id` 精确补跑单个事件，也支持 `--run-id` 精确定位已有 generation run。

第一版生成队列复用现有 event engine 的 worker / scheduler / backfill 体系，不新增独立常驻服务。

原因假设是 canonical event engine 的第二层能力，不应作为旁路 daemon 运行。

实现边界：

- 新增原因假设生成模块和 run 表。
- 由现有 worker / scheduler 在合适时机触发。
- manual backfill / repair 走同一套模块。
- ops/status 后续扩展原因生成 eligible 覆盖率、失败率、队列状态、策略跳过数量、配置阻塞数量和永久 provider 错误聚合摘要。
- 不新增独立服务生命周期命令。

原因假设生成运行状态接入现有 ops/status，但详细信息只在 diagnostics 模式展示。

边界：

- light 状态只给摘要：`eligibleCoverage`、失败率、pending 数量、`notGeneratedCount`、`blockedByGeneratorConfigCount`、`permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt`。
- diagnostics 模式展示：最近 failed runs、unknown 比例、平均耗时、重试次数、按 event family 的覆盖率。
- diagnostics 模式可以展示缺失配置项名称、prompt id/version、实际使用的 provider/model、被配置阻塞的少量 eventId 样例。
- diagnostics 模式固定返回 `permanentProviderErrorSamples` 数组展示少量永久 provider 错误 run 样例；样例对象固定包含 `runId`、`eventId`、`finishedAt`、`provider`、`model`、`httpStatus`、`errorType`、`requestId` 和 `errorSummary`。
- 不把每条原因假设内容塞进 ops/status。
- 不把 ops/status 变成调试所有模型输出的详情页。

coverage 统计口径：

- `eligibleCoverage` 只统计 backend `actionBucket = actionable | watch` 的事件。
- `eligibleCoverage` 分母不包含 `not_generated`。
- `notGeneratedCount` 单独统计 `actionBucket = noise` 且策略性跳过自动生成的事件。
- `not_generated` 不进入失败率。
- `not_generated` 不进入 pending 数量。
- 失败率只统计已经尝试生成的 eligible runs。
- pending 数量只统计已写入 `pending` / `running` run 的事件。
- `blockedByGeneratorConfigCount` 统计符合自动生成 eligibility、没有 active/run 覆盖、但原因生成器关闭或缺少配置而没有写入 run 的事件。
- `blockedByGeneratorConfigCount` 不进入 pending 数量、失败率或 `notGeneratedCount`。
- `permanentProviderErrorCount` 统计当前保留的 run 表全量可见历史中 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 failed run 数量。
- `latestPermanentProviderErrorAt` 使用这类 failed run 的最新 `finishedAt`。
- `permanentProviderErrorCount` 不进入 pending 数量、`notGeneratedCount` 或 `blockedByGeneratorConfigCount`，也不替代失败率。

diagnostics 模式可以暴露：

- `generationRunId`
- `eventId`
- `inputChecksum`
- `modelProvider`
- `modelName`
- `promptVersion`
- `status`
- `errorCode`
- `startedAt` / `finishedAt`
- retry count / duration
- eligible coverage by event family
- not generated count / share

diagnostics 模式仍不得暴露：

- raw prompt
- full model input
- 原始 evidence payload 全文
- provider secrets 或完整请求参数

第一版需要新增 `causal-hypothesis` 质量门禁，但门禁只检查结构和边界，不评判“原因是否绝对正确”。

门禁范围：

- active 原因必须至少有一个 `evidenceId`
- active 原因数量不能超过 3
- 同一 event + `causeType` 不能有多个 active
- `basis` 只能是 `stated` / `inferred`
- `causeType` 只能是已确认枚举
- `confidence` 必须在 `0..1`
- projection detail 中的 `causalStatus` 与 active/run 状态一致
- 读取路径不能触发模型调用

模型推理质量后续通过 replay、抽样 review 或回测评估，不放进第一版结构门禁。

读取路径不能实时生成原因假设。详情页、API 或 MCP 调用只能读取已经写入的 canonical truth。

如果 detail projection 缺失或 stale，读取路径可以同步 repair projection，但不能同步生成原因假设。

projection repair 只能消费已经存在的 active `CausalHypothesis` 和 generation run 状态：

- 自动生成 eligibility 不满足且无 active/run 覆盖：返回 `causalStatus = "not_generated"`
- 自动生成 eligibility 满足但还没生成：返回 `causalStatus = "pending"`
- 自动生成 eligibility 满足，但原因生成器关闭或缺少配置且还没有 run：provider-facing `causalStatus` 仍为 `pending`，内部 ops/status 展示 disabled / missing config
- 原因生成失败或未知：按已有 run 派生状态返回
- 不因为 repair projection 而调用大模型

如果生成失败、超时或返回不合格结构，不阻塞事件入库。第一层“发生了什么事”的主链路必须保持稳定。

`input_checksum` 只覆盖生成原因时实际喂给模型的规范化输入，而不是整个 canonical event detail。

第一版 checksum 覆盖：

- title / summary
- selected evidence title / summary / payload 摘要
- selected facts
- affected entities / markets / topics
- timeline state
- source kind / authority
- prompt version
- model name

不把 projection 展示字段、UI 文案或 unrelated metadata 纳入 checksum，避免无意义重算。

模型输入里的 selected evidence / selected facts 必须设上限，不能把事件下所有材料无差别塞进模型。

第一版选择规则：

- evidence 最多 5 条
- facts 最多 12 条
- 优先官方、交易所、协会等高权威 evidence
- 优先 primary source 和最新 evidence
- 优先与 title、primary subject、topic 命中的 evidence
- facts 优先有 `evidenceId`、有方向、数值或实体的结构化事实

输入选择必须可回放，避免模型输入随读取路径或 UI 状态变化。

原因假设生成需要单独记录 generation run，而不是只在 `event_causal_hypotheses` 中保存 `generation_run_id`。

第一版新增 run 记录，用来表达一次生成任务整体状态，并同时作为持久队列：

- `runId`
- `eventId`
- `inputChecksum`
- `inputSnapshot`
- `inputBuilderVersion`
- `outputSnapshot`
- `modelProvider`
- `modelName`
- `promptVersion`
- `status`：`pending` / `running` / `succeeded` / `unknown` / `failed`
- `errorCode`
- `attemptNumber`
- `nextAttemptAt`
- `lockedAt`
- `lockOwner`
- `leaseExpiresAt`
- `startedAt`
- `finishedAt`

`event_causal_hypotheses.generation_run_id` 引用该 run。这样可以区分“已分析但原因不足”和“技术失败”，也方便统计覆盖率、失败率和模型升级后的回放效果。

输入/输出快照只保存在 run 记录中，不复制到 `event_causal_hypotheses`。原因假设表只保存原因本体、状态和 `generation_run_id`，需要审计或回放时再通过 `generation_run_id` 关联 run 记录。

第一版不自动清理输入/输出快照，也不做压缩归档。上线初期优先保留审计、调试和回放能力；后续如有存储压力或合规要求，再设计按保留期清理、脱敏迁移、归档或压缩策略。

快照必须设置序列化后的字节上限：`inputSnapshot` 最大 64KB，`outputSnapshot` 最大 32KB。超限时保留审计骨架，记录 `truncated = true`、`originalSizeBytes`、`storedSizeBytes` 和 `truncatedFields`，并丢弃低优先级摘要字段。

审计骨架优先保留 event / run / model / prompt / input builder version、selected evidence / fact id、引用关系、状态、错误码、校验摘要、accepted / dropped / invalid count、confidence 和原因类型等结构化字段。优先丢弃 evidence payload 短摘要、evidence summary 摘要、低优先级 fact 展示摘要、hypothesis rationale 长文本和 diagnostics 示例文本。

快照截断是审计材料降级，不改变生成结果状态。只要模型输出合法、引用有效、active 替换成功，run 仍为 `succeeded`；模型明确返回材料不足时仍为 `unknown`。截断信息写入 run `metadata_json` 和 diagnostics，建议字段为 `snapshotTruncated = true`。只有连最小审计骨架都无法保存时，run 才为 `failed`，`errorCode = "causal_hypothesis_snapshot_too_large"`。

run 记录保存当次生成实际使用的规范化、限量后的模型输入快照，例如 canonical event title / summary、selected evidence 的 id / title / summary / 短 payload 摘要 / source authority、selected facts 的结构化字段、affected entities / markets / topics、timeline state、input builder version、prompt id/version 和 model provider/model name。

这个快照用于审计和回放，不等于 raw prompt 或完整 provider payload。第一版不得保存 raw prompt、完整原文、完整 provider request/response payload 或 provider secrets。快照不进入 provider-facing contract、frontend 或 ops/status light；diagnostics 默认只暴露 checksum、prompt/model 信息和摘要级定位信息，不返回完整快照。

输入构建器需要独立版本号。`input_builder_version` 写入 run 记录，`inputBuilderVersion` 写入输入快照，并参与 `input_checksum`。输入选择、排序、截断或字段结构变化时，即使 prompt 未变化，也必须提升 input builder version，使新输入产生新 checksum 并触发可控重新生成。

run 记录也保存模型输出经系统解析和校验后的结构化、脱敏快照。`outputSnapshot` 可以记录模型返回的顶层 `status`、`unknownReason`、hypotheses 结构化字段、引用的 evidence/fact id、confidence、系统接收数量、被校验丢弃数量和原因、validation error code / summary、最终 run status。

`outputSnapshot` 不保存 provider 原始 response payload、raw prompt、完整模型输入、完整原文、provider secrets 或完整请求参数。它不进入 provider-facing contract、frontend 或 ops/status light；diagnostics 默认只暴露 accepted / dropped / invalid 的计数和错误摘要，不返回完整输出快照。

完整 `input_snapshot_json` / `output_snapshot_json` 不通过 HTTP `ops/status` 暴露，即使 diagnostics 模式也只给 run id、checksum、版本、截断状态、计数、错误摘要和少量样例。完整快照只能通过本地内部脚本按 run id 显式读取，例如 `scripts/inspect-causal-hypothesis-run.ts --run-id <runId> --include-snapshots`。该脚本默认也只输出摘要，只有显式传 `--include-snapshots` 才打印完整输入/输出快照；provider secrets、raw prompt、provider 原始 request/response payload 始终不可输出。

传 `--include-snapshots` 时，脚本输出数据库中已存储的受控快照内容，不对快照内普通文本字段再做第二层隐藏。这样本地审计、回放和问题定位看到的内容与真实存储事实一致；敏感边界仍由快照构建逻辑和脚本禁止输出 raw prompt、provider 原始载荷、完整模型输入和 secrets 共同保证。

完整快照打印必须精确到 `runId`，不允许 `--event-id --include-snapshots` 隐式选择最近一次 run。`--event-id` 可以用于列出该事件下的 run 摘要和 `runId`，摘要只包含 status、时间、attempt、checksum、prompt/model/input builder 版本、`snapshotTruncated`、计数和错误摘要等定位信息。操作者必须显式选择某个 `runId` 后，才能打印完整输入/输出快照。

`--event-id` 摘要列表默认按创建时间或开始时间倒序列最近 20 条 run，支持 `--limit`，最大 100；支持 `--status pending|running|succeeded|unknown|failed` 过滤。摘要字段固定为 `runId`、status、`triggerSource`、`triggerReason`、`retryOfRunId`、attempt、created/started/finished time、checksum、prompt/model/input builder 版本、`snapshotTruncated`、accepted/dropped/invalid 计数和错误摘要。它只解决“我要选哪一次 run”的问题，不输出完整输入/输出快照，也不替代 diagnostics。

每条 run 必须记录 `trigger_source` 和 `trigger_reason`。`trigger_source` 是结构化来源，候选值包括 `auto_event_ingest`、`facts_updated`、`manual_backfill`、`manual_repair`、`retry`；`trigger_reason` 是内部可读原因摘要。它们用于区分新事件自动生成、facts/evidence 更新、手动补跑、手动修复和失败重试，只进入内部审计、diagnostics 和本地运行记录查看脚本摘要，不进入 provider-facing contract、frontend 默认展示或 MCP public contract。

`trigger_source` / `trigger_reason` 不参与 `input_checksum` 或生成去重 key。它们是审计元数据，不是模型输入身份；同一事件、同一规范化输入、同一 prompt、同一模型，不应因为自动触发、手动补跑或重试来源不同而产生重复 run。未来如果要对同 key 显式重跑，应单独设计 `--force` 语义，而不是通过改变触发来源绕过去重。

重试创建的新 run 使用 `trigger_source = "retry"`，并通过 `retry_of_run_id` 指向触发这次重试的上一条失败 run。`trigger_reason` 必须记录可读重试原因，例如 timeout、schema invalid、invalid references 或 provider error。原始触发来源保留在被重试的历史 run 上；需要追溯时通过 `retry_of_run_id` 链接查看。`retry_of_run_id` 只用于内部审计、diagnostics 和本地运行记录查看脚本摘要，不参与 `input_checksum` 或生成去重 key，也不进入 provider-facing contract、frontend 默认展示或 MCP public contract。

第一版 manual backfill / repair 不允许绕过去重。`scripts/backfill-causal-hypotheses.ts` 不提供 `--force`；手动任务仍必须通过同一个 causal service 入口，执行 `event_id + input_checksum + prompt_version + model_name` 去重。已有 `pending` / `running` / `succeeded` / `unknown` run 时必须跳过。未来如果需要同 key 强制重跑，必须单独设计 `--force`，并记录 `force_reason` 和操作者来源。

manual backfill / repair 因生成去重被跳过时，不写 `skipped` run，也不新增 `skipped` status。`event_causal_hypothesis_runs` 只记录真实生成任务或真实生成尝试。脚本执行结果返回 skipped count、skip reason 和 existing runId；skip reason 至少区分同 key 已有 `pending`、`running`、`succeeded` 或 `unknown` run。未来如果需要审计“谁发起过一次手动命令”，应单独设计 operation log，不把命令请求日志混进 generation run 表。

manual backfill / repair 全部被去重跳过时，脚本退出码为 0。全部 skipped 是正常业务结果，代表没有新任务需要创建，不是脚本失败。脚本必须在 stdout 或 `--json` 输出 queued / skipped / failed counts、skip reason 和 existing runId；在 `failedCount = 0` 时，参数错误、数据库错误、配置错误或运行时异常使用非 0 退出码，避免 cron、launchd 或其他自动化把“无新任务”误报为失败。

当前共识：`--run-id` 精确定位到已经处于 `pending` 或 `running` 的 generation run 时，不重复排队，也不把它当成错误。脚本不得创建新 run、重置已有 run 的 lease、重置 attempt、刷新 projection 或调用模型生成器。该结果不是参数错误，不是 `event_not_found`，也不是 `candidate_ineligible`；它不进入 `errors[]` 或 `wouldErrors[]`。真实 `--execute` 时输出 `queuedCount = 0`、`skippedCount = 1`、`failedCount = 0`、`queuedRunIds = []`，并在 `skipped[]` 记录这次跳过。dry-run 时输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 1`、`wouldFailCount = 0`、`wouldQueueEventIds = []`，并在 `wouldSkip[]` 记录这次预计跳过。skipped / wouldSkip 明细必须包含 requested `runId`、可获得的 `eventId`、`inputChecksum`、`existingRunId`、`skipReason` 和 `status`；`existingRunId` 等于 requested `runId`，`status` 为 `pending` 或 `running`，`skipReason` 必须区分 `run_already_pending` 和 `run_already_running`。没有其他错误时，退出码为 0。

当前共识：`--run-id` 精确定位到已经处于 `succeeded` 或 `unknown` 的 generation run 时，同样不重复排队，也不把它当成错误。脚本不得创建新 run、重算或替换 active 原因集合、刷新 projection 或调用模型生成器。该结果不是参数错误，不是 `event_not_found`，也不是 `candidate_ineligible`；它不进入 `errors[]` 或 `wouldErrors[]`。真实 `--execute` 时输出 `queuedCount = 0`、`skippedCount = 1`、`failedCount = 0`、`queuedRunIds = []`，并在 `skipped[]` 记录这次跳过。dry-run 时输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 1`、`wouldFailCount = 0`、`wouldQueueEventIds = []`，并在 `wouldSkip[]` 记录这次预计跳过。skipped / wouldSkip 明细必须包含 requested `runId`、可获得的 `eventId`、`inputChecksum`、`existingRunId`、`skipReason` 和 `status`；`existingRunId` 等于 requested `runId`，`status` 为 `succeeded` 或 `unknown`，`skipReason` 必须区分 `run_already_succeeded` 和 `run_already_unknown`。没有其他错误时，退出码为 0。未来如果需要同 key 重跑，必须单独设计 `--force`，不能让普通 repair/backfill 隐式重跑终态 run。

当前共识：`--run-id` 精确定位到已经处于 `failed` 的 generation run 时，允许创建新的 retry run，但不得复活或修改原 failed run。原 failed run 保持 `failed`，脚本不得把它改回 `pending`，不得重置它的 lease 或 attempt。满足 retry 条件时，脚本创建新的 `pending` retry run，并写入 `retry_of_run_id = requested runId`、`trigger_source = "retry"` 和可读 `trigger_reason`。新 retry run 使用同一生成去重 key：`eventId + inputChecksum + promptVersion + modelName`。如果同 key 已有新的 `pending` / `running` / `succeeded` / `unknown` run、retry backoff 尚未到期，或同 key 已达到最大尝试次数，脚本跳过而不是报错；跳过不进入 `errors[]` 或 `wouldErrors[]`。真实 `--execute` 成功创建 retry run 时输出 `queuedCount = 1`、`skippedCount = 0`、`failedCount = 0`、`queuedRunIds = [newRunId]`。dry-run 预计会创建 retry run 时输出 `candidateCount = 1`、`wouldQueueCount = 1`、`wouldSkipCount = 0`、`wouldFailCount = 0`、`wouldQueueEventIds = [eventId]`。因同 key 已有其他 run 跳过时，`skipReason` 使用对应 `run_already_pending`、`run_already_running`、`run_already_succeeded` 或 `run_already_unknown`，`existingRunId` 指向阻止 retry 的那条 run。因 retry backoff 尚未到期跳过时，`skipReason = "retry_backoff_not_due"`；因达到最大尝试次数跳过时，`skipReason = "retry_attempts_exhausted"`。skipped / wouldSkip 明细必须包含 requested `runId`、可获得的 `eventId`、`inputChecksum`、`existingRunId`、`skipReason` 和 `status`。因 backoff 或最大尝试次数跳过时，`existingRunId` 等于 requested `runId`，`status = "failed"`。成功创建 retry run 或按上述规则跳过时，没有其他错误则退出码为 0。

当前共识：`--run-id <failedRunId>` 创建 retry run 时，模型输入必须复用原 failed run 的输入身份和已保存输入材料，不重新读取当前 canonical event 生成新输入。retry run 必须复用原 failed run 的 `eventId`、`inputChecksum`、`inputBuilderVersion`、`promptVersion`、`modelProvider`、`modelName` 和可回放 `inputSnapshot`；它可以有新的 `runId`、`createdAt`、`attemptNumber`、`trigger_source`、`trigger_reason` 和 `retry_of_run_id`。脚本不得为了 retry 重新加载当前 canonical event detail 构造模型输入，也不得因为当前 event facts / evidence 已变化而改变 retry run 的 `inputChecksum`。如果操作者想基于当前 canonical event 重新生成，应使用 `--event-id`，不是 `--run-id`。如果原 failed run 缺少可回放 `inputSnapshot`，或其输入材料不足以构造模型请求，则本候选失败，不创建 retry run。真实 `--execute` 写入 `errors[]`、`failedCount = 1`、退出码非 0，并输出 `queuedCount = 0`、`skippedCount = 0`、`queuedRunIds = []`；dry-run 写入 `wouldErrors[]`、`wouldFailCount = 1`，并输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 0`、`wouldQueueEventIds = []`。错误使用 `errorCode = "input_build_failed"`、`phase = "input_build"`、`target.scope = "run"`，并在可获得时带 `runId`、`eventId` 和 `inputChecksum`；`retryable = false`。

当前共识：`--event-id <eventId>` 表示基于当前 canonical event 状态重新构造模型输入。它必须先加载当前 canonical event detail，用当前 canonical event detail 构造当前模型输入，计算当前 `inputChecksum`，再用当前 `eventId + inputChecksum + promptVersion + modelName` 计算去重 key。它不得为了当前输入构造复用历史 failed run 的 `inputSnapshot`。如果当前 key 与某条 failed run 的 key 相同，且同 key 没有 `pending` / `running` / `succeeded` / `unknown` run，并且 retry backoff 和最大尝试次数允许，则创建 retry run，写入 `retry_of_run_id`、`trigger_source = "retry"` 和可读 `trigger_reason`。该 retry run 的输入使用刚刚按当前 canonical event 构造出的输入；由于 key 相同，它应与被重试 failed run 的输入身份一致。如果当前 key 与历史 failed run 的 key 不同，则创建普通 manual run，不写 `retry_of_run_id`，`trigger_source` 使用当前手动任务来源，例如 `manual_backfill` 或 `manual_repair`，并使用当前输入的 `inputChecksum`、`inputBuilderVersion`、`promptVersion`、`modelProvider`、`modelName` 和 `inputSnapshot`。如果当前 key 已有 `pending` / `running` / `succeeded` / `unknown` run，则按既有去重规则跳过，不创建 retry run 或普通 manual run。

当前共识：`--event-id <eventId>` 当前 key 命中多条 failed run 时，`retry_of_run_id` 必须指向同 key 最新一条 failed run。选择范围只包含当前 key 相同的 failed run，不跨 key 选择。排序规则固定为：`attemptNumber` 降序、`finishedAt` 降序、`createdAt` 降序、`runId` 降序稳定兜底。retry backoff 是否到期和最大尝试次数是否耗尽都基于选中的 latest failed run 判断。如果 latest failed run 的 retry backoff 尚未到期或已经达到最大尝试次数，脚本跳过，不创建 retry run；`existingRunId` 指向选中的 latest failed run。脚本不得选择更早的 failed run 来绕过 latest failed run 的 retry backoff 或最大尝试次数。

当前共识：新建 retry run 的 `attemptNumber` 必须基于被重试的 failed run 递增。对 `--run-id <failedRunId>`，被重试的 failed run 就是 requested run；对 `--event-id <eventId>`，被重试的 failed run 是 TD-120 选中的 latest failed run。新 retry run 的 `attemptNumber = selectedFailedRun.attemptNumber + 1`。脚本不得把 retry run 的 `attemptNumber` 重置为 1，不得沿用 selected failed run 的 `attemptNumber`，也不得通过重新统计同 key 历史 run 数量或扫描同 key 最大历史 attempt 来覆盖 selected failed run 的递增规则。最大尝试次数判断必须先基于 selected failed run 完成；如果 selected failed run 已达到最大尝试次数，则不创建 retry run。

当前共识：retry backoff 是否到期，只使用 selected failed run 上保存的 `nextAttemptAt`。对 `--run-id <failedRunId>`，selected failed run 就是 requested failed run；对 `--event-id <eventId>`，selected failed run 是 TD-120 选中的 latest failed run。脚本不得用 `finishedAt + backoff` 重新计算到期时间，也不得因为 retry 策略常量变化而重新解释历史 failed run 的到期时间。最大尝试次数判断先执行；如果 selected failed run 已达到最大尝试次数，则按 `retry_attempts_exhausted` 跳过，不要求存在 `nextAttemptAt`。终止性 provider 失败判断在 `nextAttemptAt` 必填判断前执行；如果 selected failed run 是明确终止失败，则按 `retry_terminal_failure` 跳过，不要求存在 `nextAttemptAt`。如果 selected failed run 未达到最大尝试次数，且不是明确终止失败，则必须存在 `nextAttemptAt`。`nextAttemptAt > now` 时按 `retry_backoff_not_due` 跳过，`existingRunId = selectedFailedRun.runId`，`status = "failed"`，不写入 `errors[]` 或 `wouldErrors[]`，没有其他错误时退出码为 0。因明确终止失败跳过时同样写 `existingRunId = selectedFailedRun.runId` 和 `status = "failed"`，不写入 `errors[]` 或 `wouldErrors[]`，没有其他错误时退出码为 0。`nextAttemptAt <= now` 时 backoff 允许 retry 继续，后续仍受同 key 去重、输入可回放、配置、数据库和排队规则约束。未耗尽尝试次数、不是明确终止失败的 selected failed run 缺少 `nextAttemptAt` 时，这是候选级数据不完整失败，不是 skip；真实 `--execute` 不创建 retry run，输出 `failedCount = 1`、`queuedCount = 0`、`skippedCount = 0`、`queuedRunIds = []`，写入 `errors[]` 并以非 0 退出；dry-run 输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 0`、`wouldFailCount = 1`、`wouldQueueEventIds = []`，写入 `wouldErrors[]`。错误使用 `errorCode = "unexpected_candidate_error"`、`phase = "candidate_processing"`、`target.scope = "run"`，并在可获得时带 `runId`、`eventId` 和 `inputChecksum`；`retryable = false`。

当前共识：当 selected failed run 的 `nextAttemptAt <= now` 且其他 retry 条件都允许时，新建 `pending` retry run 的 `nextAttemptAt` 写入本次 run 的创建时间。创建时间和 `nextAttemptAt` 必须使用同一个时钟源：如果创建时间由数据库时间生成，则 `nextAttemptAt` 使用同一次数据库时间；如果创建时间由应用进程时间生成，则 `nextAttemptAt` 使用同一个应用进程时间值。新 retry run 不继承 selected failed run 的旧 `nextAttemptAt`，不写未来退避时间，也不预先计算“如果本次 retry 失败后的下一次退避时间”。新 retry run 插入后必须立即满足 `pending` claim 条件中的 `nextAttemptAt <= now`。如果这条 retry run 后续失败，再由失败处理流程基于本次失败时间和 attempt 计算并保存下一次 `nextAttemptAt`。

当前共识：第一版同一生成 key 的最大尝试次数为 4 次，表示 1 次初始生成加 3 次 retry。初始生成 run 的 `attemptNumber = 1`；第一次 retry run 的 `attemptNumber = 2`；第二次 retry run 的 `attemptNumber = 3`；第三次 retry run 的 `attemptNumber = 4`。attempt 1 失败后保存 `nextAttemptAt = failedAt + 5 分钟`；attempt 2 失败后保存 `nextAttemptAt = failedAt + 30 分钟`；attempt 3 失败后保存 `nextAttemptAt = failedAt + 2 小时`；attempt 4 失败后保持 `failed`，不再创建 retry run。最大尝试次数判断使用 `selectedFailedRun.attemptNumber >= 4`；当 `selectedFailedRun.attemptNumber >= 4` 时，`--run-id` 或 `--event-id` retry 都按 `retry_attempts_exhausted` 跳过。达到最大尝试次数后的 `failed` 不阻塞事件入库，不清除已有 active 原因假设，默认只在 diagnostics 暴露。

当前共识：当 attempt 4 失败后，这条终止失败 run 必须写入 `status = "failed"`、保留 `attemptNumber = 4`，并把 `nextAttemptAt` 写为 `null`。终止失败 run 指 `status = "failed"` 且 `attemptNumber >= 4` 的 run，表示没有下一次自动 retry 窗口。failure handler 不得为 attempt 4 失败写未来退避时间，不得保留这条 run 进入执行前的旧 `nextAttemptAt`，也不得把 `nextAttemptAt` 写成 `failedAt` 或当前时间。是否 retry exhausted 由 `status = "failed"` 和 `attemptNumber >= 4` 判断，不依赖 `nextAttemptAt`。`--run-id` 或 `--event-id` 选中终止失败 run 时，按 `retry_attempts_exhausted` 跳过，不要求 `nextAttemptAt` 存在，也不进入 `errors[]` 或 `wouldErrors[]`。`attemptNumber < 4` 且不是明确终止失败的 failed run 缺少 `nextAttemptAt` 仍按 TD-122 的候选级数据不完整失败处理。

当前共识：计算 retry backoff 时，`failedAt` 表示失败实际生效时间，不表示后台任务发现失败的时间。`failedAt` 是失败处理中的计算值，不要求新增持久字段，但 failed run 的 `finishedAt` 必须写入本次 `failedAt`。可重试的 `attemptNumber < 4` 失败时，`nextAttemptAt` 按 `failedAt + backoff` 计算。明确终止失败例外：它写 `finishedAt = failedAt`，但 `nextAttemptAt = null`，即使 `attemptNumber < 4`。普通模型失败、provider 错误、模型调用超时、schema invalid、引用全 invalid 或快照过大等在 worker 正常处理路径中当场判定的失败，`failedAt = finishedAt = 失败落库时间`。worker lease 超时恢复时，`failedAt = finishedAt = leaseExpiresAt`，不得用扫描发现超时的时间、修复脚本运行时间或当前时间作为 `failedAt`。如果 worker lease 超时被晚发现，retry backoff 仍从 `leaseExpiresAt` 开始计算；若 `leaseExpiresAt + backoff <= now`，后续统一 retry 入队流程创建出的 retry run 可以立即进入可 claim 状态。attempt 4 失败时仍按同样规则写 `finishedAt = failedAt`，但 `nextAttemptAt = null`。发现超时的时间可以进入 diagnostics 或 metadata，但不得参与 retry backoff 计算。

当前共识：失败处理和 retry 入队是两个逻辑步骤。普通 worker 失败或 worker lease 超时恢复把 `attemptNumber < 4` 的 run 转为 `failed` 时，只关闭当前 run：写入 `status = "failed"`、`finishedAt = failedAt`、`nextAttemptAt = failedAt + backoff`、错误码和诊断信息，并按既有 lease 设计释放或清理该 run 的执行锁字段。失败处理不得立即插入下一条 `pending` retry run，也不得创建带未来 `nextAttemptAt` 的 `pending` run。只有当 failed run 的 `nextAttemptAt <= now` 且 retry gate 全部通过时，统一 retry 入队流程才创建新的 `pending` retry run；新 run 仍遵守 TD-121 的 attempt 递增、TD-123 的创建时间 `nextAttemptAt`、`trigger_source = "retry"`、`retry_of_run_id` 和可读 `trigger_reason`。如果超时恢复发现时退避已经到期，实现可以在同一次 scheduler tick 或安全事务中继续调用统一 retry 入队流程，但语义上仍必须先持久化旧 run 的失败事实，再执行独立的 due retry 入队检查。

当前共识：统一 retry 入队流程由现有原因生成 worker / scheduler 调度轮次触发，不新增独立 daemon、独立 queue table 或第二套状态机。每个自动调度轮次的固定顺序是：第一步，恢复已过期 `running` run，把它们按 TD-126 / TD-127 标记为 `failed` 并保存 `nextAttemptAt`；第二步，扫描已经到期的 failed run，并通过统一 retry 入队流程创建新的 `pending` retry run；第三步，再 claim 可执行的 `pending` run。手动 backfill / repair 不实现另一套 retry 规则，它在 `--run-id` 或 `--event-id` 命中 due failed run 时也调用同一套 retry 入队服务路径。这样自动重试、手动修复和超时恢复共享同一组 retry gate、attempt 递增、去重和 `nextAttemptAt` 规则。

当前共识：第一版自动调度轮次每轮最多成功创建 1 条 due retry run。这个上限只约束自动调度轮次，不约束手动 backfill / repair。自动 due retry 候选排序复用后端投资优先级；同一投资优先级下，按 `nextAttemptAt` 最早、`createdAt` 最早、`runId` 稳定兜底排序。手动 backfill / repair 继续按用户提供的 `--run-id`、`--event-id` 或批量 `--limit` 工作，不继承自动调度每轮 1 条的上限，但仍受脚本自己的 `--limit`、并发、去重、backoff、最大尝试次数、配置和输入材料 gate 约束。

当前共识：自动调度轮次创建出的 due retry run 允许在同一个调度轮次的 pending claim 阶段被领取执行。原因是 TD-128 已经规定自动轮次先入队 due retry 再 claim pending，TD-123 又要求新 retry run 的 `nextAttemptAt` 等于创建时间并立即满足 claim 条件。新 retry run 不需要人为等待下一轮，也不得获得特殊优先级；它进入普通 pending claim 查询，是否在本轮被 claim 只取决于本轮剩余 claim 容量和既有 pending claim 排序。没有 claim 容量或未被排序选中时，它保留为 `pending`，等待下一轮。

当前共识：普通 pending claim 的排序必须固定为完整稳定规则，并适用于初始自动 run、manual run 和 retry run。eligible pending run 指 `status = "pending"` 且 `nextAttemptAt <= now` 的 run。claim 查询先按后端投资优先级排序；同一投资优先级下，按 `nextAttemptAt` 最早、`createdAt` 最早、`runId` 稳定兜底排序。`trigger_source`、`trigger_reason` 和 `retry_of_run_id` 不改变 claim 排序；manual run 和 retry run 都不因为来源获得插队权。

当前共识：pending claim 必须是数据库原子领取，不能依赖默认单并发、进程内锁或“理论上只有一个 worker”保证正确性。worker 先按 TD-131 的稳定排序选择候选，再用数据库条件更新把目标 run 从 `status = "pending"` 且 `nextAttemptAt <= now` 原子改为 `status = "running"`，同时写入 `lockedAt`、`lockOwner` 和 `leaseExpiresAt`。只有影响行数为 1 才算 claim 成功；影响行数为 0 表示该 run 已被其他 worker 抢先领取、状态变化或不再到期，这不是技术失败，当前 worker 应重新查询或结束本轮 claim。数据库异常才作为运行时错误处理。这样即使未来出现多个 worker、重复调度或手动脚本与自动 worker 同时运行，也不会让同一个 run 被两个执行者领取。

当前共识：claim 成功后，模型调用不得放在同一个数据库事务里。数据库事务只覆盖 TD-132 的 claim 状态切换；claim 成功并提交后，worker 在事务外构造请求、调用模型并校验输出。最终写入 `succeeded`、`unknown` 或 `failed` 结果时，再用 `runId`、`status = "running"`、`lockOwner` 和 `leaseExpiresAt > now` 做条件更新。只有结果更新影响行数为 1，才算结果落库成功；影响行数为 0 表示 worker 已失去 run 所有权、run 已被恢复流程改写或 lease 已过期，不得覆盖后续状态，也不得替换 active 原因假设。数据库异常才作为写回失败处理。这样长模型调用不会占住数据库事务，也不会让过期 worker 覆盖后续有效结果。

当前共识：当最终结果写回影响行数为 0 是因为 `status`、`lockOwner` 或 `leaseExpiresAt` 条件不再成立，当前 worker 已经失去 run 所有权，必须停止改写该 run。它不得再把 run 标记为 `failed`，不得写入 `finishedAt`、`nextAttemptAt`、错误码、输出快照或 active 原因假设替换，也不得在过期写回路径创建 retry run 或触发 retry 入队。它只可以写脱敏本地诊断日志，记录 `runId`、`lockOwner` 和写回冲突类型，不得包含 raw prompt、完整模型材料、provider 原始 payload 或 secrets。若 lease 已过期，后续由 scheduler 超时恢复流程按 TD-126 / TD-127 使用 `leaseExpiresAt` 写 `failedAt` / `finishedAt` 并保存 `nextAttemptAt`；若 run 已被其他所有者推进，失效 worker 不做任何覆盖。数据库异常不同于影响行数为 0，仍按写回失败处理。

当前共识：第一版原因生成不支持 lease 续租。claim 成功时一次性写入 `leaseExpiresAt = claimedAt + 120 秒`；worker 在模型调用、输出校验或结果写回前不得延长 `leaseExpiresAt`。第一版不实现心跳续租、保活字段、续租循环或独立续租 API。单次模型调用超时保持 45 秒，run lease 保持 120 秒，二者之间的时间差就是第一版安全余量。如果模型调用、输出校验或结果写回已经超过 lease，结果写回必须按 TD-133 / TD-134 处理为过期写回，不能通过续租重新获得所有权；后续失败事实、`nextAttemptAt` 和 retry 入队仍由 scheduler 超时恢复与统一 retry 入队流程处理。

当前共识：单次模型调用达到 45 秒超时时，worker 必须停止等待 provider 请求。provider SDK 支持 `AbortSignal` 或等价取消能力时，worker 必须主动取消 provider 请求；provider SDK 不支持取消时，worker 仍按本地模型调用超时处理，不继续等待 provider 最终返回。模型调用超时的 run 内部错误码使用 `causal_hypothesis_model_timeout`。只要当前 worker 仍拥有 run 且 lease 未过期，超时写回就把 run 写为 `failed`，写入 `finishedAt = failedAt = 失败落库时间`、timeout 错误和 `nextAttemptAt`；写回仍必须使用 TD-133 的 `runId`、`status = "running"`、`lockOwner` 和 `leaseExpiresAt > now` 条件更新。若影响行数为 0，则按 TD-134 处理，当前 worker 不再写失败字段，也不创建 retry。provider 在本地超时后才返回成功、unknown 或错误时，返回结果必须丢弃，不得写 run、不得替换 active 原因假设、不得刷新 projection；只允许写脱敏本地诊断日志，并且 provider promise 后续 resolve / reject 必须被消费，不能形成未处理异常。

当前共识：第一版把非本地 45 秒超时的临时 provider 错误作为可自动重试的技术失败处理。临时 provider 错误包括网络连接失败、DNS / TLS / socket 等传输层失败、HTTP 429、HTTP 500-599，以及 provider 明确返回的临时不可用、过载或限流。run 内部错误码使用 `causal_hypothesis_provider_transient_error`。只要当前 worker 仍拥有 run 且 lease 未过期，写回就把 run 写为 `failed`，写入 `finishedAt = failedAt = 失败落库时间`、脱敏 provider 诊断信息和 `nextAttemptAt = failedAt + backoff`；attempt 4 仍按既有规则写 `nextAttemptAt = null`。写回必须使用 TD-133 的 `runId`、`status = "running"`、`lockOwner` 和 `leaseExpiresAt > now` 条件更新；影响行数为 0 时按 TD-134 处理，不再写失败字段，也不创建 retry。临时 provider 错误不替换 active 原因假设，不刷新 projection，不阻塞 canonical event 入库，也不立即创建 retry run；后续仍由统一 retry 入队流程在 `nextAttemptAt <= now` 后创建 retry run。脱敏 provider 诊断可以包含 provider 名称、model 名称、HTTP status、错误类型、request id 或脱敏错误摘要，不得包含 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload、secret、token、credential 或完整配置。配置错误、鉴权错误、模型不存在和请求非法不属于本决策；永久 provider 错误按终止性技术失败处理，缺少本地配置仍按配置预检处理。

当前共识：第一版把永久 provider 错误作为终止性技术失败处理，不进入自动 retry。永久 provider 错误包括鉴权失败、权限不足、模型不存在、模型 id 或 provider 配置指向无效模型、provider 明确返回请求非法、不支持的参数 / 格式 / 模型能力，或者明确要求修改凭证、配置或请求后才可能成功。run 内部错误码使用 `causal_hypothesis_provider_permanent_error`。只要当前 worker 仍拥有 run 且 lease 未过期，写回就把 run 写为 `failed`，写入 `finishedAt = failedAt = 失败落库时间`、脱敏 provider 诊断信息和 `nextAttemptAt = null`，即使 `attemptNumber < 4`。写回必须使用 TD-133 的 `runId`、`status = "running"`、`lockOwner` 和 `leaseExpiresAt > now` 条件更新；影响行数为 0 时按 TD-134 处理，不再写失败字段，也不创建 retry。永久 provider 错误不替换 active 原因假设，不刷新 projection，不阻塞 canonical event 入库，不立即创建 retry run，也不由统一 retry 入队流程自动创建 retry run。普通 `--run-id` / `--event-id` retry 选中这类 failed run 时按 `retry_terminal_failure` 跳过，`existingRunId = selectedFailedRun.runId`，`status = "failed"`，不写入 `errors[]` 或 `wouldErrors[]`，没有其他错误时退出码为 0。`attemptNumber < 4` 且 `nextAttemptAt = null` 不再一律表示数据损坏；如果错误码是明确终止失败，`nextAttemptAt = null` 是正常终止语义。当前已定义的明确终止失败错误码为 `causal_hypothesis_provider_permanent_error`。缺少原因生成器本地配置仍按既有配置预检规则处理：自动触发不写 `pending` run，手动 `--execute` 预检失败且不写 run；该路径不复用 `causal_hypothesis_provider_permanent_error`。

当前共识：修复凭证、权限、模型配置或请求结构后，第一版普通 retry 仍不得自动重跑已经终止的永久 provider 错误。普通 `--run-id` retry 选中 `causal_hypothesis_provider_permanent_error` failed run 时仍按 `retry_terminal_failure` 跳过；普通 `--event-id` retry 命中同 key latest failed run 且该 run 是 `causal_hypothesis_provider_permanent_error` 时也按 `retry_terminal_failure` 跳过。自动 due retry 入队流程和手动批量 backfill / repair 都不得因为当前配置已修复而重新纳入或重新排队这类 run。第一版不实现检测配置已修复后重开终止失败的后台逻辑，也不通过比较 provider 配置版本、凭证状态或模型 id 变化来自动重启终止失败 run。第一版不为永久 provider 错误提供隐式 force 行为；修复后如果要重跑同一 key，必须未来单独设计显式强制修复入口。未来显式强制修复入口不得复用普通 retry 语义，且必须定义目标范围、操作者来源、`force_reason`、active 替换、projection refresh、审计记录和风险控制。

当前共识：显式强制修复入口不进入第一版实现范围。第一版不新增 `--force`、`--force-terminal-failure` 或等价命令行参数，不新增专门用于重跑永久 provider 终止失败的脚本入口，不新增公开 provider API、frontend 按钮或 MCP public tool，也不新增后台自动修复任务。第一版不为永久 provider 终止失败新增 `force_reason`、operator 或审批字段。当前实现只需要保证普通 retry、自动 due retry 和手动批量 backfill / repair 继续跳过永久 provider 终止失败；已有未来显式强制修复入口描述只作为未来设计约束，不是当前实现任务。

manual backfill / repair 脚本必须提供稳定的 `--json` 输出结构。默认输出可以是给人看的摘要，但 `--json` 是内部自动化契约，需要有测试覆盖。JSON 顶层至少包含 `schemaVersion`、`mode`、`exitCode`、`durationMs`、`dryRun`、`execute` 和 `requested`。`schemaVersion` 第一版固定为整数 `1`。`scripts/backfill-causal-hypotheses.ts --json` 的 `mode` 固定为 `causal_hypothesis_backfill`。`exitCode` 必须是整数，并与进程实际退出码一致。`durationMs` 必须是非负整数毫秒。`requested` 只保存规范化后的安全请求字段。真实执行结果字段至少包含 `queuedCount`、`skippedCount`、`failedCount`、`queuedRunIds`、`skipped` 和 `errors`；`skipped[]` 至少包含 `eventId`、`inputChecksum`、`existingRunId`、`skipReason` 和 `status`；`errors[]` 至少包含固定 `target` 对象、固定 `errorCode`、固定 `phase`、`retryable` 和 `message`。这个 JSON 不能包含完整输入/输出快照、raw prompt、provider 原始 payload 或 secrets。

进入 `--json` 模式后，stdout 必须只输出一份完整 JSON 对象，不能混入进度、日志、人读摘要或错误文本；这些内容只能输出到 stderr。只要脚本已经进入自己的错误处理流程，即使最终退出码非 0，也必须尽力输出可解析 JSON：参数解析成功并进入 dry-run 语义后，dry-run 失败写入 `wouldErrors[]`；execute 失败写入 `errors[]`。参数错误、配置错误、数据库错误、候选级部分失败和已捕获运行时异常，只要能构造 JSON envelope，都必须走这条机器契约。只有脚本无法接管的进程级失败才允许没有 JSON，例如 Node 启动失败、模块加载失败、进程被操作系统终止或严重崩溃。调用方遇到“非 0 且无 JSON”时，应按进程级失败处理，而不是按业务失败处理。

当前共识：stderr 和本地日志不是 JSON 机器契约，但默认 cron / launchd / 自动化日志仍必须脱敏。默认日志应优先输出 `errorCode`、`phase`、`target`、`runId`、`eventId`、`candidateIndex` 或 correlation id 等定位信息；不得输出 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload、secret、token、credential、完整配置、带参数值的完整 SQL 或完整堆栈。显式本地 debug 模式可以输出更详细的 raw exception 和堆栈，但仍不得输出 prompt、完整模型材料、provider 原始 request / response payload、secret 或完整配置。provider 诊断默认只输出 provider 名称、model 名称、HTTP status、错误类型、request id 或脱敏后的错误摘要；SQL 诊断默认只输出 query name、表名、错误类型或脱敏 SQL 摘要。

当前共识：第一版 debug 模式只能通过显式命令行 `--debug` 开启，不支持环境变量开启。`--debug` 只影响 stderr / 本地日志，不影响 stdout JSON，不进入 `requested`，也不改变候选选择、dry-run 预览、execute 行为、去重行为、退出码或数据库写入。这样可以避免 shell、cron、launchd 或长期进程环境变量被继承后让自动化日志意外变详细。

`requested` 字段必须始终存在。参数解析成功时，`requested` 输出应用稳定机器契约默认值后的有效请求，只包含已经被系统接受、对审计和复现有用的安全请求字段。第一版允许的 `requested` 字段包括 `eventId`、`runId`、`limit`、`includeNoise`、`dryRun` 和 `execute`；未来新增筛选、排序或截断参数时，只能保存规范化后的安全参数。`requested` 必须包含稳定机器契约默认值，例如用户省略 `--include-noise` 时输出 `requested.includeNoise = false`；如果 `limit` 存在稳定机器契约默认值，`requested.limit` 记录最终有效值；`requested.dryRun` 和 `requested.execute` 记录最终有效执行模式。`requested` 不得保存原始 `argv`、环境变量、profile secret、API key、token、credential、raw prompt、完整模型输入、provider 原始 request / response payload、完整模型配置、provider 参数、内部批大小、数据库分页大小、临时并发策略或其他内部实现默认值。参数解析失败时，`requested = null`，不得把半解析参数塞进 `requested`，也不得把原始命令行完整回显进 JSON。参数解析失败必须以结构化 global error 表达：`errorCode = "invalid_arguments"`、`phase = "argument_parse"`、`target.scope = "global"`、`retryable = false`，并固定放入 `errors[]`，不得放入 `wouldErrors[]`。

当前共识：未知命令行参数必须严格失败。未定义参数、拼写错误参数和当前版本不支持的未来参数都视为参数解析失败，不得忽略，也不得继续执行半解析请求。未知参数使用 `invalid_arguments` / `argument_parse` / `target.scope = "global"` / `retryable = false`，输出 `requested = null`、`dryRun = false`、`execute = false`，退出码非 0。若已经进入 `--json` 错误处理流程，stdout 仍输出唯一可解析 JSON，错误固定进入 `errors[]`，不得进入 `wouldErrors[]`。

当前共识：`--event-id` 和 `--run-id` 是 `scripts/backfill-causal-hypotheses.ts` 第一版 backfill / repair 的互斥定位模式，不能组合。二者同时出现时，不选择优先级，不做隐式覆盖，固定视为参数解析失败，并在候选选择、input build、去重检查、配置预检和数据库写入之前停止。JSON 使用 `invalid_arguments` / `argument_parse` / `target.scope = "global"` / `retryable = false`，输出 `requested = null`、`dryRun = false`、`execute = false`，退出码非 0；错误进入 `errors[]`，不得进入 `wouldErrors[]`，不得输出 dry-run 预览字段。其他 inspect 类脚本如果未来允许组合定位，应单独定义自己的参数契约。

当前共识：`--include-noise` 不能替代批量 `--limit`。没有精确定位参数时，请求属于批量模式；精确定位参数包括 `--event-id` 和 `--run-id`。批量模式必须显式提供 `--limit`，即使传入了 `--include-noise`。`--include-noise` 只表示把 `actionBucket = noise` 纳入候选范围，不提供候选数量上限，也不改变排序、去重、质量门禁、`--limit`、`--concurrency`、退出码或 run 记录规则。缺少精确定位参数且缺少 `--limit` 时，固定视为参数解析失败；JSON 使用 `invalid_arguments` / `argument_parse` / `target.scope = "global"` / `retryable = false`，输出 `requested = null`、`dryRun = false`、`execute = false`，退出码非 0；错误进入 `errors[]`，不得进入 `wouldErrors[]`，不得输出 dry-run 预览字段。

当前共识：`--limit` 必须是 `1..100` 的十进制整数。只要请求传入 `--limit`，`0`、负数、小数、非数字和超过 `100` 的值都固定视为参数解析失败。脚本不得自动修正非法值，不得把超过 `100` 的值静默截断为 `100`，也不得把小数取整、向上取整或向下取整。JSON 使用 `invalid_arguments` / `argument_parse` / `target.scope = "global"` / `retryable = false`，输出 `requested = null`、`dryRun = false`、`execute = false`，退出码非 0；错误进入 `errors[]`，不得进入 `wouldErrors[]`，不得输出 dry-run 预览字段。

当前共识：当前版本已定义的每个命令行参数最多只能出现一次。第一版不定义任何可重复参数；带值参数重复出现非法，例如 `--limit 10 --limit 20` 或 `--limit 10 --limit 10`；定位参数重复出现非法，例如 `--event-id A --event-id B`；布尔开关重复出现也非法，例如 `--include-noise --include-noise`。脚本不得选择第一个值、最后一个值或合并多个值。重复参数固定视为参数解析失败，并在候选选择、input build、去重检查、配置预检和数据库写入之前停止。JSON 使用 `invalid_arguments` / `argument_parse` / `target.scope = "global"` / `retryable = false`，输出 `requested = null`、`dryRun = false`、`execute = false`，退出码非 0；错误进入 `errors[]`，不得进入 `wouldErrors[]`，不得输出 dry-run 预览字段。

当前共识：manual backfill / repair 默认是 dry-run / preview，默认 dry-run 不需要显式传 `--dry-run`。如果当前或未来版本提供显式 `--dry-run` 参数，它必须和 `--execute` 互斥。单独传显式 `--dry-run` 时，如脚本支持该参数，可表达显式预览意图；`--execute` 表示真实执行。二者同时出现时，不选择优先级，不允许一个覆盖另一个，固定视为参数解析失败，并在候选选择、input build、去重检查、配置预检和数据库写入之前停止。JSON 使用 `invalid_arguments` / `argument_parse` / `target.scope = "global"` / `retryable = false`，输出 `requested = null`、`dryRun = false`、`execute = false`，退出码非 0；错误进入 `errors[]`，不得进入 `wouldErrors[]`，不得输出 dry-run 预览字段。

当前共识：`requested` 中已经进入当前 JSON 字段契约的可选字段保持稳定形状，不适用于当前请求时写 `null`；未知字段、未来字段或当前版本没有定义的字段才省略。第一版中，`eventId` 和 `runId` 不适用时为 `null`；`limit` 在批量模式下有显式值或稳定默认值时为数字，在精确单事件或单 run 模式下不适用时为 `null`；`includeNoise`、`dryRun` 和 `execute` 是布尔字段，只要 `requested` 不是 `null` 就始终存在。

参数解析失败时，脚本不得根据原始命令行里是否出现 `--dry-run` 或其他预览意图来决定错误归属。参数解析失败表示请求尚未被系统接受，因此 JSON 顶层必须使用 `dryRun = false`、`execute = false`、`requested = null` 和 `errors[]`。此时不得输出 dry-run 预览字段，包括 `candidateCount`、`wouldQueueCount`、`wouldSkipCount`、`wouldFailCount`、`wouldQueueEventIds`、`wouldSkip`、`wouldErrors` 和 `executionBlocked`。

`mode` 表示机器接口来源，不表示请求执行模式。参数解析成功和失败时都必须输出同一个脚本级固定值 `causal_hypothesis_backfill`。参数解析失败时不得把 `mode` 设为 `null`，也不得改成 `dry_run`、`execute`、`argument_error` 或其他请求状态。自动化应先用 `mode` 路由到对应 schema，再用 `requested = null`、`dryRun = false`、`execute = false` 和 global `invalid_arguments` 错误判断请求未成立。

`schemaVersion` 表示机器 JSON 契约版本，不表示业务版本或脚本版本。第一版固定输出 `schemaVersion = 1`，参数解析成功和失败时都必须输出。`schemaVersion` 使用整数，不使用 semver 字符串；破坏性 JSON 契约变更才递增，兼容性新增字段不递增。自动化应按 `mode + schemaVersion` 选择解析逻辑。

`exitCode` 表示脚本最终进程退出语义。只要脚本输出 JSON，就必须输出整数 `exitCode`，且它必须与进程实际退出码一致。`exitCode = 0` 只表示脚本按契约完成，不表示真实 execute 一定可执行；dry-run 中是否可真实执行仍必须看 `executionBlocked`。非 0 且有 JSON 表示脚本已处理的失败，结构化原因在 `errors[]` 或 `wouldErrors[]`；非 0 且无 JSON 表示脚本无法接管的进程级失败。第一版不增加 `ok` 或 `success` 布尔字段，避免把 dry-run 阻断、候选级失败和进程级失败压成一个模糊布尔值。

`durationMs` 表示脚本可接管范围内的运行耗时，必须是非负整数毫秒。计时范围从脚本进入可接管的 main 流程开始，到生成 JSON envelope 为止；参数解析失败时也必须输出。`durationMs` 不包括 Node 启动、模块加载失败或进程被操作系统终止这类脚本无法接管的阶段。第一版不输出 `startedAt` 或 `finishedAt`；墙钟时间先由外层 cron、launchd 或运维日志记录，避免时区、时钟漂移和时间格式争议进入第一版机器契约。

dry-run JSON 必须区分预估结果和真实执行结果。dry-run 使用 `dryRun = true`、`execute = false`，并通过 `candidateCount`、`wouldQueueCount`、`wouldSkipCount`、`wouldFailCount`、`wouldQueueEventIds`、`wouldSkip`、`wouldErrors` 和 `executionBlocked` 表达“如果执行将会怎样”；真实 `--execute` 才使用 `queuedCount`、`skippedCount`、`failedCount`、`queuedRunIds`、`skipped` 和 `errors`。`wouldErrors[]` 与 `errors[]` 使用同一错误对象结构，也包含固定 `errorCode`、固定 `phase`、`retryable` 和 `message`。dry-run 不创建 run、不写数据库、不刷新 projection；参数错误、数据库错误、配置错误或运行时异常仍按错误处理，不计入 `wouldFailCount`。

当前共识：`errors[]` 和 `wouldErrors[]` 的 `errorCode` 与 `phase` 使用第一版固定枚举，不允许自由字符串。机器判断只能依赖 `errorCode`、`phase`、`target` 和 `retryable`；自由文本只放在 `message` 里给人读。第一版错误对象不输出 `summary`。`message` 必须是脚本生成的简短脱敏说明，不得直接放入 raw exception、SQL、数据库驱动原始错误、堆栈信息、provider 原始报错、provider 原始 request / response payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential 或完整配置。第一版 `errorCode` 覆盖 `invalid_arguments`、`generator_config_missing`、`database_unavailable`、`event_not_found`、`candidate_ineligible`、`input_build_failed`、`dedupe_check_failed`、`enqueue_failed`、`unexpected_candidate_error` 和 `unexpected_runtime_error`。第一版 `phase` 覆盖 `argument_parse`、`config_preflight`、`database_preflight`、`candidate_selection`、`input_build`、`dedupe_check`、`enqueue`、`candidate_processing` 和 `runtime`。

`executionBlocked` 是 dry-run JSON 的显式布尔字段，用来表达同样请求如果真实 `--execute` 是否会被全局预检阻断。`executionBlocked = true` 时，`wouldErrors[]` 必须包含至少一条 `target.scope = "global"` 的错误；`executionBlocked = false` 时，不得把 `wouldErrors[]` 解释成全局阻断。缺少原因生成配置但 dry-run 仍能成功返回候选时，dry-run 可以退出 0，同时设置 `executionBlocked = true`。如果参数错误、数据库不可用或运行环境错误导致 dry-run 本身无法产出有效预览，dry-run 仍应非 0；若能输出 JSON envelope，也应设置 `executionBlocked = true` 并写入 global `wouldErrors[]`。候选级预计失败只进入 `wouldFailCount` / `wouldErrors[]`，不设置 `executionBlocked = true`。

当 `executionBlocked = true` 时，`wouldQueueCount`、`wouldSkipCount`、`wouldFailCount`、`wouldQueueEventIds`、`wouldSkip` 和候选级 `wouldErrors[]` 仍然表达候选级预览，也就是如果全局阻断被修复，这批候选在去重和候选级检查后会怎样。但自动化不得把 `wouldQueueCount > 0` 当成当前可真实执行；当前真实 `--execute` 仍会整批失败，且写入 0 个 run。`executionBlocked = true` 时，候选级 `wouldErrors[]` 可以和 global `wouldErrors[]` 同时存在。`executionBlocked = false` 时，`would*` 字段按普通候选级 dry-run 预览解释。

`wouldFailCount` 只统计候选级预计失败，不统计 global 阻断。global 阻断只由 `executionBlocked = true` 和 `target.scope = "global"` 的 `wouldErrors[]` 表达。候选级预计失败仍进入 `wouldFailCount`；因此 `executionBlocked = true` 且存在候选级预计失败时，`wouldFailCount` 可以大于 0。候选级 `wouldErrors[]` 使用 `target.scope = "event"` 或 `target.scope = "run"`。自动化判断当前是否可真实执行时先看 `executionBlocked`；判断候选质量或预计部分失败时再看 `wouldFailCount` 和候选级 `wouldErrors[]`。

dry-run 成功产出完整候选级预览时，`wouldQueueCount + wouldSkipCount + wouldFailCount` 必须等于过滤、排序、`--limit` 截断后的最终候选数量。完整候选级预览是指脚本已经得到最终候选列表，并能把每个候选归入预计排队、预计跳过或预计候选级失败之一。每个候选必须且只能进入这三类中的一类。即使 `executionBlocked = true`，只要候选级预览完整，这条计数守恒仍然成立。global 阻断本身不计入 `wouldFailCount`，也不破坏计数守恒。如果 dry-run 因参数错误、数据库不可用或运行环境错误无法产出最终候选列表，可以不要求三者之和守恒；此时 dry-run 应非 0，并通过 `target.scope = "global"` 的 `wouldErrors[]` 说明原因。

dry-run JSON 必须显式输出 `candidateCount`，表示过滤、排序、`--limit` 截断后的最终候选列表长度。`candidateCount` 不是数据库原始候选总量，也不是过滤前数量、排序前数量、分页前数量或新排队目标数量。dry-run 成功产出完整候选级预览时，`candidateCount = wouldQueueCount + wouldSkipCount + wouldFailCount`。即使 `executionBlocked = true`，只要候选级预览完整，也必须输出 `candidateCount` 并满足计数守恒。如果 dry-run 无法产出最终候选列表，仍必须输出 `candidateCount = null`，`executionBlocked` 必须为 `true`，且 `wouldErrors[]` 必须至少包含一个 `target.scope = "global"` 的错误。`candidateCount = 0` 只表示已经成功产出最终候选列表且候选数量确实为 0，不得用于表示不可用。

当 `candidateCount = null` 时，`wouldQueueCount`、`wouldSkipCount` 和 `wouldFailCount` 固定输出 `0`，`wouldQueueEventIds` 和 `wouldSkip` 固定输出空数组，不得输出候选级 `wouldErrors[]`。此时 `wouldErrors[]` 只能承载 global 错误，且必须至少包含一个 `target.scope = "global"` 的错误。自动化必须先看 `candidateCount` 和 `executionBlocked` 再解释 `would*Count`；三个 `0` 只是在候选列表不可用时维持字段类型稳定，不表示最终候选列表已成功计算为空。

当模型输出 schema 不合法，无法构造完整结构化输出快照时，仍写入最小 `outputSnapshot`。最小快照只包含 `parseStatus = "schema_invalid"`、`errorCode`、`validationSummary`、`outputSizeBytes`、model provider / model name、prompt id/version、input builder version 和最终 run status；不得保存原始输出文本、provider 原始 response payload、raw prompt、完整模型输入、完整原文或 secrets。

`outputSnapshot` 是结果和审计材料，不参与 `input_checksum`，也不参与生成去重 key。生成去重仍只由事件、规范化输入、输入构建器版本、prompt version 和 model name 决定。

第一版不新增独立 queue table，也不把纯内存队列作为事实源。自动触发或手动 backfill 先写入 `pending` run；worker 通过数据库原子 claim 和 lease 将 pending run 改为 `running`；claim 事务提交后，模型调用在事务外执行，结果写回再用 run 所有权和 lease 条件更新保护。结果写回失去所有权时，当前 worker 不再改写该 run，不标记 failed，也不创建 retry。进程重启后，过期的 `running` run 靠 `leaseExpiresAt` 恢复为 failed run 并保存 `nextAttemptAt`，再由统一 retry 入队流程在到期后创建 retry run。自动调度轮次先恢复超时 run，再入队 due retry run，最后 claim pending run；本轮新创建的 due retry run 可以参与同一轮 pending claim。普通 pending claim 对初始自动 run、manual run 和 retry run 使用同一套稳定排序，不按触发来源插队。

第一版原因生成默认单并发。自动 worker 默认一次只 claim / 执行 1 个 pending run；自动调度轮次每轮最多成功创建 1 条 due retry run。手动 backfill 脚本默认 `--concurrency 1`，最多允许 `--concurrency 2`。并发参数只影响同时执行的 run 数量，不改变去重 key、lease 语义或 active 替换规则。

第一版运行参数保持保守：单次模型调用超时 45 秒，达到超时时主动取消或停止等待 provider 请求；临时 provider 错误进入同一套自动 backoff / retry；永久 provider 错误作为终止性技术失败，不进入自动 retry，配置修复后普通 retry 仍按 `retry_terminal_failure` 跳过；run lease 120 秒，不支持 lease 续租；同一 key 最大尝试 4 次，即 1 次初始生成 + 3 次 retry；retry backoff 为 attempt 1 失败后 5 分钟、attempt 2 失败后 30 分钟、attempt 3 失败后 2 小时。达到最大尝试次数后保持 `failed`，不阻塞事件入库，不清除已有 active 原因假设，只在 diagnostics 暴露。

当前共识：永久 provider 错误需要进入 ops/status light 的聚合健康摘要。light 只暴露 `permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt`，不得暴露 provider 原始报错、原始 request / response payload、raw prompt、完整模型输入/输出、完整原文、secret、token、credential、完整配置、runId、eventId、inputChecksum 或 request id 列表。diagnostics 可以暴露少量 run 级脱敏样例。该计数不改变 provider-facing `causalStatus`，不替代失败率，不进入 pending、`notGeneratedCount` 或 `blockedByGeneratorConfigCount`；缺少本地生成器配置仍由配置阻塞口径表达。

当前共识：永久 provider 错误的 ops/status 统计窗口第一版使用当前保留的 run 表全量可见历史，不新增 24 小时、7 天、30 天或其他 rolling window，也不新增统计窗口配置。run 表未来如果执行保留期清理，统计自然反映清理后的当前保留历史。diagnostics 样例可以限量，但 light 聚合计数和最新时间不能受样例限量影响。`latestPermanentProviderErrorAt` 用来表达问题新鲜度；未来若需要固定窗口，必须和 run 保留策略、ops/status schema 和告警语义一起重新设计。

当前共识：ops/status light 必须始终返回 `permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt`。没有永久 provider 错误时，`permanentProviderErrorCount = 0`，`latestPermanentProviderErrorAt = null`；不得省略字段，也不得用空字符串、`undefined`、`false` 或 `0` 代替 null。调用方判断是否存在永久 provider 错误时，应先看 `permanentProviderErrorCount > 0`。

当前共识：`permanentProviderErrorCount` 第一版统计当前保留 run 表里所有 `status = "failed"` 且 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 run。它是 light 健康摘要计数，不是 diagnostics 样例数量；不得因为某条 run 缺少 samples 所需的自身持久化 `runId`、持久化 `eventId`、持久化 `finishedAt`、`provider`、`model`、`httpStatus`、`requestId` 或 `errorSummary` 而排除。`latestPermanentProviderErrorAt` 只从这些匹配 run 中已有持久化 `finishedAt` 的 run 取最大值；如果 `permanentProviderErrorCount > 0` 但没有任何匹配 run 有持久化 `finishedAt`，`latestPermanentProviderErrorAt = null`。`permanentProviderErrorSamples = []` 或 `latestPermanentProviderErrorAt = null` 都不代表 `permanentProviderErrorCount = 0`。

当前共识：ops/status diagnostics 必须始终返回 `permanentProviderErrorSamples` 数组。没有样例时返回 `[]`，不得省略字段，也不得用 `null`、空对象、`undefined` 或 `false` 代替空数组。该字段只在 diagnostics 模式返回，light 不返回；样例只允许脱敏 run 级字段，不参与 `permanentProviderErrorCount` 或 `latestPermanentProviderErrorAt` 的计算。

当前共识：`permanentProviderErrorSamples` 第一版最多返回 10 条。样例候选只包含 `status = "failed"`、`errorCode = "causal_hypothesis_provider_permanent_error"` 且同一 run 记录已有自身持久化 `runId`、`eventId` 和 `finishedAt` 的 run；先按该 run 记录 `finishedAt` 倒序排序，同一 `finishedAt` 下按该样例 run 自身 `runId` 升序稳定兜底，然后截断到 10 条。这个上限只影响 diagnostics 样例数组，不影响 light 的 count 和 latest time。第一版不在 ops/status diagnostics 上提供分页、offset、cursor 或按事件筛选；完整 run 历史由本地运行记录查看脚本承担。

当前共识：`permanentProviderErrorSamples[]` 第一版使用固定字段形状，每个样例固定包含 `runId`、`eventId`、`finishedAt`、`provider`、`model`、`httpStatus`、`errorType`、`requestId` 和 `errorSummary`。`runId`、`eventId`、`finishedAt` 和 `errorType` 来自 run 记录或后端归一化错误分类，必须存在；`runId` 只能来自样例对应 failed run 自身的持久化主键，不得从本地日志行、provider request id、provider correlation id、provider payload、provider message、`retry_of_run_id`、其他关联 run、`eventId` 或 `inputChecksum` 推断；`eventId` 只能来自同一 run 记录保存的 canonical event 绑定，不得从 provider payload、provider message、当前 canonical event lookup、当前 projection lookup、`retry_of_run_id` 链或其他历史 run 推断；`finishedAt` 只能来自同一 run 记录的持久化完成时间，不得使用 provider 返回时间、provider error timestamp、模型输出时间、ops/status 查询时间、脚本扫描时间、scheduler 发现失败时间、本地日志时间或重新推导出的时间；`provider`、`model`、`httpStatus`、`requestId` 和 `errorSummary` 缺失时返回 `null`，不得省略字段，也不得用空字符串、`undefined`、`false` 或空对象代替 `null`。`provider` 和 `model` 只能来自本系统发起该 run 时已知的调用上下文或配置元数据，且各自最多 128 个 Unicode code point，超限时返回 `null`；`httpStatus` 只能是真实 HTTP 状态码整数 `100..599` 或 `null`，`requestId` 只能来自 provider 明确提供的 request id / correlation id 元数据且最多 128 个 Unicode code point，超限时返回 `null`，`errorSummary` 只能是系统生成的脱敏短摘要或 `null`。样例对象不得加入原始 provider payload、raw prompt、完整模型输入/输出、完整原文、secret、token、credential、完整配置、stack trace、SQL 或未定义的 provider-specific payload 字段。

当前共识：`permanentProviderErrorSamples[].errorSummary` 第一版不得直接使用 provider message。它必须由系统根据归一化后的错误类型、HTTP status、provider / model 标识和安全定位信息生成，可以使用受控模板或固定短语；不得直接复制、截断、翻译、同义改写或轻度摘要 provider message。如果只能从 provider message 获得错误信息，系统必须先映射到粗粒度 `errorType` 或安全模板；无法安全映射时返回 `errorSummary = null`。`errorSummary` 只供 diagnostics 人读快速定位，机器判断仍依赖 `errorType`、`httpStatus`、`requestId`、`runId`、`eventId` 和固定错误码。

当前共识：`permanentProviderErrorSamples[].errorSummary` 第一版最终输出最多 200 个字符。这个上限只约束 `errorSummary` 字段，不约束 `provider`、`model`、`httpStatus`、`errorType`、`requestId`、`runId`、`eventId` 或 `finishedAt`。如果受控模板生成的摘要超过 200 个字符，系统必须选择更短模板或移除非必要安全上下文；不得通过截断 provider message、复制 provider message 前 200 个字符、追加省略号或保留不完整 provider 原始错误片段来满足上限。无法生成安全且不超过 200 个字符的摘要时返回 `errorSummary = null`。

当前共识：`permanentProviderErrorSamples[].errorSummary` 的 200 字符上限按 Unicode code point 计数，不按 UTF-8 字节数，也不按 JavaScript UTF-16 code unit。`errorSummary = null` 不参与字符数计算；200 个 Unicode code point 合法，201 个不合法。实现不得使用 JavaScript `string.length` 作为最终长度判定口径。含有非 BMP 字符时，仍按 Unicode code point 计数；超限时按既有规则选择更短系统模板、移除非必要安全上下文或返回 `null`。

当前共识：`permanentProviderErrorSamples[].errorType` 第一版使用后端归一化枚举，不允许 provider-specific 自由字符串、provider 原始错误码、provider 原始错误文本或 HTTP status 文本。允许值固定为 `authentication_failed`、`permission_denied`、`model_not_found`、`provider_config_invalid`、`invalid_request`、`unsupported_request` 和 `unknown_permanent_provider_error`。每个样例必须包含非空 `errorType`；已经确定是永久 provider 错误但无法安全归类时，用 `unknown_permanent_provider_error`，不得返回 `null`。缺少原因生成器本地配置仍按配置预检处理，不进入样例数组，也不映射为 `provider_config_invalid`。

当前共识：`permanentProviderErrorSamples[].httpStatus` 第一版只能是真实 HTTP 状态码整数 `100..599` 或 `null`。`100` 和 `599` 合法；`99`、`600`、`0`、负数、小数和字符串状态码非法。SDK 自定义状态、provider 自定义错误码、网络错误码、系统错误码、DNS / TLS / socket 错误码不得放入 `httpStatus`。provider 没有返回可确认的 HTTP response status，或者 SDK 只返回无法确认是 HTTP response status 的抽象 code / status 字段时，返回 `httpStatus = null`。不得从 provider error message 中解析或猜测 `httpStatus`，也不得把 `errorType`、provider 原始错误码或本地错误码映射成 `httpStatus`。真实 HTTP status 只用于 diagnostics 定位，不替代 `errorType`、固定错误码或 retry 语义。

当前共识：`permanentProviderErrorSamples[].requestId` 第一版只能使用 provider SDK / response metadata 明确提供的 request id 或 correlation id。provider SDK、response metadata 或 response header 明确标注为 request id / correlation id 时可以使用；否则返回 `requestId = null`。`requestId` 作为 opaque string 使用，不解析、不改写语义。不得从 provider message、provider 原始报错文本、`errorSummary`、stack trace、本地日志行或异常字符串中解析 `requestId`；不得把 `runId`、`eventId`、`inputChecksum`、`httpStatus`、`errorType`、provider 原始错误码或本地错误码映射成 `requestId`；不得为了填充字段而生成、拼接或伪造 provider `requestId`。`requestId` 只用于 diagnostics 定位，不替代 `errorType`、固定错误码、retry 语义或本地 run 定位字段。

当前共识：`permanentProviderErrorSamples[].requestId` 第一版最多 128 个 Unicode code point。`requestId = null` 不参与长度计算；128 个 Unicode code point 合法，129 个不合法。长度必须按 Unicode code point 计数，不按 UTF-8 字节数，也不按 JavaScript UTF-16 code unit；实现不得使用 JavaScript `string.length` 作为最终长度判定口径。含有非 BMP 字符时仍按 Unicode code point 计数。provider 明确提供的 request id 或 correlation id 超过 128 个 Unicode code point 时，必须返回 `requestId = null`，不得裁剪、复制前 128 个字符、追加省略号、保留不完整片段，也不得哈希、重编码或压缩 provider request id 来绕过长度上限。

当前共识：`permanentProviderErrorSamples[].provider` 和 `permanentProviderErrorSamples[].model` 第一版只能来自本系统发起该 run 时已知的调用上下文或配置元数据。可用来源包括 run 记录中保存的 provider / model 标识、本次 run 创建或模型调用时选中的 provider / model 配置，以及 retry run 实际使用的输入身份和调用上下文。run 记录、输入身份和调用上下文都无法确认时，分别返回 `provider = null` 或 `model = null`。不得从 provider message、provider 原始报错文本、`errorSummary`、provider 原始 response payload、stack trace、本地日志行或异常字符串中解析 `provider` / `model`；不得从 `requestId`、`httpStatus`、`errorType`、provider 原始错误码或本地错误码映射；不得为了填充字段而猜测、生成、拼接或伪造。`provider` / `model` 只用于 diagnostics 定位，不替代 `errorType`、固定错误码、retry 语义或本地 run 定位字段。

当前共识：`permanentProviderErrorSamples[].provider` 和 `permanentProviderErrorSamples[].model` 第一版各自最多 128 个 Unicode code point。`provider = null` 和 `model = null` 不参与长度计算；128 个 Unicode code point 合法，129 个不合法。长度必须按 Unicode code point 计数，不按 UTF-8 字节数，也不按 JavaScript UTF-16 code unit；实现不得使用 JavaScript `string.length` 作为最终长度判定口径。含有非 BMP 字符时仍按 Unicode code point 计数。本系统调用上下文或配置元数据中的 provider / model 标识超过 128 个 Unicode code point 时，分别返回 `provider = null` / `model = null`，不得裁剪、复制前 128 个字符、追加省略号、保留不完整片段，也不得哈希、重编码或压缩来绕过长度上限。

当前共识：`permanentProviderErrorSamples[].finishedAt` 第一版只能来自同一 run 记录的持久化完成时间，且不得为 `null`。不得使用 provider 返回时间、provider error timestamp、模型输出时间、ops/status 查询时间、脚本扫描时间、scheduler 发现失败时间、本地日志时间，也不得用 `finishedAt + backoff`、`nextAttemptAt - backoff` 或当前时间重新推导。不得从 provider message、provider 原始报错、provider 原始 response payload、`errorSummary`、stack trace、本地日志行或异常字符串中解析 `finishedAt`。永久 provider failed run 缺少持久化 `finishedAt` 时，不进入 `permanentProviderErrorSamples[]`，也不得为了 `latestPermanentProviderErrorAt` 合成替代时间；缺失 `finishedAt` 属于 run 数据一致性问题，应由 diagnostics 之外的数据一致性检查或修复流程处理。

当前共识：`permanentProviderErrorSamples[].eventId` 第一版只能来自同一 run 记录保存的 canonical event 绑定，且不得为 `null`。不得从 provider payload、provider message、provider 原始报错、provider 原始 response payload、`errorSummary`、stack trace、本地日志行或异常字符串中解析 `eventId`；不得用当前 canonical event lookup、当前 projection lookup、`retry_of_run_id` 链或其他历史 run 替代缺失的 run 记录事件绑定；不得从 `requestId`、`httpStatus`、`errorType`、provider 原始错误码、本地错误码或 `inputChecksum` 映射。永久 provider failed run 缺少持久化 `eventId` 时，不进入 `permanentProviderErrorSamples[]`；缺失 `eventId` 属于 run 数据一致性问题，应由 diagnostics 之外的数据一致性检查或修复流程处理。

当前共识：`permanentProviderErrorSamples[].runId` 第一版只能来自样例对应 failed run 自身的持久化主键，且不得为 `null`。不得从本地日志行、provider request id、provider correlation id、provider payload、provider message、provider 原始报错、provider 原始 response payload、`errorSummary`、stack trace 或异常字符串中解析 `runId`；不得使用 `retry_of_run_id`、被重试 run、触发 retry 的 run、阻止 retry 的 `existingRunId`、其他关联 run 或新建 retry run 的 id 替代样例 failed run 自身主键；不得从 `eventId`、`inputChecksum`、`httpStatus`、`errorType`、provider 原始错误码或本地错误码映射。永久 provider failed run 缺少自身持久化 `runId` 时，不进入 `permanentProviderErrorSamples[]`；缺失 `runId` 属于 run 数据一致性问题，应由 diagnostics 之外的数据一致性检查或修复流程处理。

当前共识：第一版必须提供本地只读数据一致性检查脚本 `scripts/check-causal-hypothesis-run-consistency.ts`，用于报告因缺少样例 run 自身持久化 `runId`、同一 run 记录持久化 `eventId` 或同一 run 记录持久化 `finishedAt` 而不能进入 `permanentProviderErrorSamples[]` 的永久 provider failed run。该脚本不进入 ops/status light，不新增公开 provider API、frontend 按钮或 MCP public tool，不写数据库、不创建 run、不重试 run、不修复 run、不刷新 projection、不替换 active 原因假设。`--json` 顶层固定包含 `schemaVersion`、`mode`、`exitCode`、`durationMs`、`requested`、`summary`、`findings` 和 `errors`，其中 `mode = "causal_hypothesis_run_consistency_check"`，`schemaVersion = 1`，`summary` 基于当前保留 run 表全量统计，`findingsLimit` 只限制 `findings[]` 返回数量。`errors[]` 复用 `target`、`errorCode`、`phase`、`retryable`、`message` 对象形状，但第一版只允许 `target.scope = "global"`；`errorCode` 只允许 `invalid_arguments`、`database_unavailable`、`unexpected_runtime_error`；`phase` 只允许 `argument_parse`、`database_scan`、`runtime`。数据一致性问题只进入 `findings[]`，不进入 `errors[]`；检查完成但发现 findings 时，`exitCode = 2` 且 `errors = []`；参数、数据库或运行时失败时，`findings = []`。全量 findings 必须先稳定排序，再应用 `findingsLimit`；排序优先级为影响 `latestPermanentProviderErrorAt` 优先、`missingFields` 数量多优先、同一 run 记录可用持久化时间倒序、`runId` 升序、`eventId` 升序；可用持久化时间只能取同一 run 记录的 `finishedAt`、`startedAt`、`createdAt` 中第一个非空值，不得使用 provider 时间、查询时间、脚本扫描时间、本地日志时间或当前时间。`--findings-limit` 省略时 `requested.findingsLimit = 100`；显式传入时必须是 `1..1000` 的十进制整数，超过上限或非法值按参数解析失败处理，不自动截断或取整。检查完成且无 findings 退出 `0`，检查完成但有一致性问题退出 `2`，参数、数据库或运行时失败退出 `1`；非 `--json` 模式可以输出简短人读摘要，但退出码必须和 `--json` 完全一致，不得因为输出是人读摘要而在发现 findings 时退出 `0`。第一版不提供 `--repair`、`--fix`、`--execute` 或等价变更模式；遇到这些参数必须按参数解析失败处理。`recommendedAction = "repair_run_record_consistency"` 只是稳定建议枚举，不表示脚本能执行修复。缺失 `provider`、`model`、`httpStatus`、`requestId` 或 `errorSummary` 不作为 samples 排除问题报告；输出不得包含 provider 原始 payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential、完整配置、SQL 或 stack trace。

第一版自动生成只覆盖 backend `InvestmentEventDetail.actionBucket = actionable | watch` 的事件。`noise` 事件默认不自动生成，避免为低投资意义事件消耗模型预算；内部脚本仍可以通过精确 `--event-id` 或显式 `--include-noise` 强制生成。eligibility 必须由 backend canonical detail / investment projection 计算，不能由 frontend、MCP formatter 或外部 prompt 重新判断。

批量 backfill 默认候选范围只包含 `actionable` / `watch`。`noise` 只能通过精确 `--event-id` 或显式 `--include-noise` 进入候选。`--include-noise` 只改变候选范围，不改变去重、质量门禁、`--limit`、`--concurrency`、run 记录或 JSON 输出语义。dry-run JSON 必须能表达 `noise` 是被策略跳过，还是因为精确指定或显式 include 被纳入候选。

批量 backfill 默认排序复用现有后端投资排序信号，不新增原因生成专属优先级。候选 bucket 顺序为 `actionable`、`watch`、`noise`；同一 bucket 内按 `materialityScore * 0.4 + tradabilityScore * 0.35 + authorityScore * 0.25` 降序，再按 `latestLifecycleAt` / `publishedAt` / `ingestedAt` 倒序，最后按 `eventId` 升序稳定排序。精确 `--event-id` 不走批量候选排序。

批量 backfill 的 `--limit` 必须在候选过滤和完整排序之后应用。`--limit 100` 表示“排序后投资优先级最高的 100 条候选”，不能实现成“先按时间取最近 100 条再排序”。dry-run JSON 的 `wouldQueueEventIds` / `wouldSkip` 也必须反映排序后截断的最终候选顺序。

`--limit` 限制排序后要检查的候选数量，不限制最终成功新排队的 run 数量。脚本对排序后截断的候选逐条执行去重、配置检查、质量门禁和排队；如果候选里很多已经有 `pending` / `running` / `succeeded` / `unknown` run，`queuedCount` 可以小于 `--limit`。第一版不得为了凑满新排队数量继续往后扫。未来如果需要“尽量排满 N 个新 run”，应单独设计 `--target-queued`。

manual backfill / repair 遇到原因生成器未启用或缺少必要配置时，dry-run 可以成功返回候选、排序、去重预估和配置阻塞提示；dry-run JSON 用 `wouldErrors` 或等价结构化字段表达执行会因配置错误失败。真实 `--execute` 必须先做配置预检，缺配置时退出码非 0，不创建 `pending` run，不写 `failed` run，不刷新 projection。错误输出可以包含缺失配置项名称、profile id、prompt id/version，但不得包含 secrets。

manual backfill / repair 的 `--execute` 如果部分候选失败，脚本整体退出码为非 0，但已经成功写入的 `pending` run 不回滚。`skipped` 不计入 `failedCount`；`failedCount > 0` 表示本次执行不完全成功。JSON 必须同时列出 `queuedRunIds`、`skipped[]` 和 `errors[]`，其中 `errors[]` 包含失败候选的固定 `target` 对象、固定 `errorCode`、固定 `phase`、`retryable` 和 `message`。

manual backfill / repair 的 `--execute` 遇到单个候选失败时继续处理后续候选。参数错误、原因生成器配置错误、数据库不可用或基础运行环境不可用属于全局预检错误，必须在写 run 前停止；输入构建失败、去重检查失败、候选级排队写入失败或候选级数据不完整属于候选级失败，记录到 `errors[]` 后继续处理。若数据库进入无法可靠继续写入的全局错误状态，应停止后续处理。

全局预检失败不计入 `failedCount`。真实 `--execute` 的 `failedCount` 只统计候选级失败数量；全局预检失败时返回 `queuedCount = 0`、`skippedCount = 0`、`failedCount = 0`，在 `errors[]` 中写入至少一条 `target.scope = "global"` 的错误，并以非 0 退出码结束。全局预检失败不写 run、不刷新 projection。候选级失败才计入 `failedCount`，并使用 `target.scope = "event"` 或 `target.scope = "run"`。

`errors[]` 和 `wouldErrors[]` 的 `errorCode` 和 `phase` 是固定枚举，不能用自由文本做机器判断。第一版 `errorCode` 包括 `invalid_arguments`、`generator_config_missing`、`database_unavailable`、`event_not_found`、`candidate_ineligible`、`input_build_failed`、`dedupe_check_failed`、`enqueue_failed`、`unexpected_candidate_error` 和 `unexpected_runtime_error`。第一版 `phase` 包括 `argument_parse`、`config_preflight`、`database_preflight`、`candidate_selection`、`input_build`、`dedupe_check`、`enqueue`、`candidate_processing` 和 `runtime`。自由文本只放 `message`；第一版错误对象不输出 `summary`；`message` 必须是脱敏说明，不能承载原始异常、SQL、堆栈、provider 原始报错、内部载荷或敏感配置；`skipped` 和 `wouldSkip` 不进入错误数组。

`errors[]` 和 `wouldErrors[]` 都必须带 `retryable` 布尔字段。`retryable` 由脚本/服务根据固定 `errorCode` 和 `phase` 计算，不能让 cron、launchd 或内部自动化从 `message` 推断。第一版把 `database_unavailable`、`enqueue_failed`、`unexpected_runtime_error` 标为可重试；把 `invalid_arguments`、`generator_config_missing`、`event_not_found`、`candidate_ineligible`、`input_build_failed`、`dedupe_check_failed`、`unexpected_candidate_error` 标为不可自动重试。这个字段不改变退出码，也不改变 `skipped` / `wouldSkip` 不是错误的边界。

`errors[]` 和 `wouldErrors[]` 每项必须用固定 `target` 对象定位失败范围。`target` 不能是自由文本字符串；自由文本只进入 `message`。第一版 `target.scope` 枚举为 `global`、`event`、`run`。全局错误使用 `scope = "global"`；候选级事件错误使用 `scope = "event"`，并在可获得时带 `eventId`；run 级错误使用 `scope = "run"`，并在可获得时带 `runId` 和 `eventId`。批量候选错误在可获得时带 `candidateIndex`；输入已经构建完成后，在可获得时带 `inputChecksum`。第一版 `target` 结构为 `{ scope, eventId?, runId?, candidateIndex?, inputChecksum? }`。

`target.candidateIndex` 使用 0-based index，指向过滤、排序、`--limit` 截断后的最终候选列表。这个 index 必须和 dry-run `wouldQueueEventIds` / `wouldSkip` 以及 execute 实际遍历顺序一致，不能使用数据库原始 offset、分页 offset、进入过滤前的位置或截断前的位置。如果能获得 `eventId`，带 `candidateIndex` 的 `target` 必须同时带 `eventId`。精确 `--event-id` 模式如果构造单元素候选列表，候选级错误使用 `candidateIndex = 0`。

生成队列按 `eventId + inputChecksum + promptVersion + modelName` 去重。

`triggerSource` / `triggerReason` 不进入去重 key。
`retryOfRunId` 不进入去重 key。

去重规则：

- 同 key 已经有 `succeeded` 或 `unknown` run：不再生成。
- 同 key 已经有 `pending` 或 `running` run：不重复排队。
- 同 key 之前是 `failed`：允许按退避策略重试。
- manual backfill / repair 也必须遵守同一去重规则，第一版不允许 `--force`。
- manual backfill / repair 因去重跳过时不写 `skipped` run，只在脚本结果里返回 skipped count、skip reason 和 existing runId。
- manual backfill / repair 全部 skipped 时退出码仍为 0。
- manual backfill / repair 必须提供稳定 `--json` 输出契约，供内部自动化消费。
- `--json` 顶层显式输出 `schemaVersion = 1`，参数解析失败时也输出。
- `scripts/backfill-causal-hypotheses.ts --json` 的 `mode` 固定为 `causal_hypothesis_backfill`，参数解析失败时也不变。
- `--json` 顶层显式输出整数 `exitCode`，并与进程实际退出码一致。
- `--json` 顶层显式输出非负整数 `durationMs`，参数解析失败时也输出；第一版不输出 `startedAt` / `finishedAt`。
- `--json` 模式下，已捕获或可处理的非 0 失败仍必须向 stdout 输出唯一、完整、可解析 JSON；日志和人读错误只能走 stderr。
- 参数解析失败时，`requested = null`，并使用 `errorCode = "invalid_arguments"`、`phase = "argument_parse"`、`target.scope = "global"` 的结构化错误表达。
- 未知参数、拼写错误参数和当前版本不支持的未来参数必须严格失败，不得忽略；它们使用 `invalid_arguments` / `argument_parse` / `target.scope = "global"` 表达。
- `scripts/backfill-causal-hypotheses.ts` 中 `--event-id` 和 `--run-id` 互斥，同时出现时固定按参数解析失败处理。
- `--include-noise` 不能替代批量 `--limit`；没有 `--event-id` 或 `--run-id` 时，缺少 `--limit` 固定按参数解析失败处理。
- `--limit` 必须是 `1..100` 的整数；`0`、负数、小数、非数字和超过 `100` 的值固定按参数解析失败处理，不做自动修正。
- 当前版本已定义的命令行参数重复出现固定按参数解析失败处理，不采用第一个值、最后一个值或合并值。
- `--execute` 和显式 `--dry-run` 互斥，同时出现固定按参数解析失败处理。
- `--run-id` 精确定位到 `pending` 或 `running` run 时不重复排队，使用 skipped / wouldSkip 表达，退出码为 0。
- `--run-id` 精确定位到 `succeeded` 或 `unknown` run 时不重复排队，使用 skipped / wouldSkip 表达，退出码为 0；第一版不通过普通 repair/backfill 隐式重跑终态 run。
- `--run-id` 精确定位到 `failed` run 时可以创建新的 retry run，但不复活旧 run；retry 仍受同 key 去重、retry backoff 和最大尝试次数约束。
- `--run-id <failedRunId>` retry 复用原 failed run 的输入身份和已保存输入材料；基于当前 canonical event 重新生成必须走 `--event-id`。
- `--event-id <eventId>` 先按当前 canonical event 构造输入；当前 key 命中 failed 历史时可进入 retry 链，当前 key 不同时创建普通 manual run。
- `--event-id <eventId>` 当前 key 命中多条 failed run 时，`retry_of_run_id` 指向同 key 最新 failed run，不能选择更早 failed run 绕过退避或最大尝试次数。
- 新 retry run 的 `attemptNumber` 固定为被重试 failed run 的 `attemptNumber + 1`，不重置、不沿用、不按历史数量重新统计。
- retry backoff 是否到期只使用 selected failed run 保存的 `nextAttemptAt`；不从 `finishedAt + backoff` 重算，明确终止失败缺少 `nextAttemptAt` 时按 `retry_terminal_failure` 跳过，未耗尽尝试次数且非终止失败缺少 `nextAttemptAt` 时作为候选级失败。
- 修复凭证、权限、模型配置或请求结构后，普通 retry 仍不得自动重跑永久 provider 终止失败；未来如需重跑，必须单独设计显式强制修复入口。
- 显式强制修复入口不进入第一版实现范围；第一版不新增 force 命令行参数、脚本入口、API、frontend 按钮、MCP public tool 或后台自动修复任务。
- ops/status light 暴露永久 provider 错误聚合摘要：`permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt`；run 级详情只在 diagnostics 脱敏暴露，light 不暴露原始 provider 错误或内部定位列表。
- 永久 provider 错误的 ops/status 聚合摘要使用当前保留 run 表的全量可见历史；第一版不新增 rolling window 或窗口配置。
- ops/status light 固定返回永久 provider 错误聚合字段；无错误时 `permanentProviderErrorCount = 0`，`latestPermanentProviderErrorAt = null`。
- `permanentProviderErrorCount` 统计当前保留 run 表里所有 `status = "failed"` 且 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 run，不受 samples 字段完整性影响；`permanentProviderErrorCount > 0` 但没有可用 `finishedAt` 时，`latestPermanentProviderErrorAt = null`。
- ops/status diagnostics 固定返回 `permanentProviderErrorSamples` 数组；无样例时返回 `[]`，light 不返回该字段。
- `permanentProviderErrorSamples` 最多 10 条，候选必须有样例 run 自身持久化 `runId` 以及同一 run 记录持久化 `eventId` 和 `finishedAt`，按同一 run 记录持久化 `finishedAt` 倒序、样例 run 自身 `runId` 升序稳定排序后截断；第一版不提供分页或筛选。
- `permanentProviderErrorSamples[]` 固定包含 `runId`、`eventId`、`finishedAt`、`provider`、`model`、`httpStatus`、`errorType`、`requestId` 和 `errorSummary`；`errorType` 必须是非空后端归一化枚举，其他缺失的诊断字段返回 `null`，不得省略字段或加入未定义 provider-specific payload。
- `runId` 只能来自样例对应 failed run 自身的持久化主键；不得从日志行、provider request id、provider correlation id、provider payload、provider message、`retry_of_run_id`、其他关联 run、`eventId` 或 `inputChecksum` 推断；缺失时该 run 不进入 samples。
- `eventId` 只能来自同一 run 记录保存的 canonical event 绑定；不得从 provider payload、provider message、当前 canonical event lookup、当前 projection lookup、`retry_of_run_id` 链或其他历史 run 推断；缺失时该 run 不进入 samples。
- `finishedAt` 只能来自同一 run 记录的持久化完成时间；不得使用 provider 时间、查询时间、扫描时间、scheduler 发现失败时间、本地日志时间或重新推导出的时间；缺失时该 run 不进入 samples，也不得合成 `latestPermanentProviderErrorAt`。
- 第一版提供本地只读数据一致性检查脚本 `scripts/check-causal-hypothesis-run-consistency.ts`，用稳定 JSON 报告缺少持久化 `runId`、`eventId` 或 `finishedAt` 的永久 provider failed run；`errors[]` 复用 `target` / `errorCode` / `phase` / `retryable` / `message` 形状，但只允许小枚举；全量 findings 先按影响 `latestPermanentProviderErrorAt`、缺字段数量、同一 run 持久化时间、`runId` / `eventId` 稳定排序，再应用 `--findings-limit`；`--findings-limit` 默认 `100`、最大 `1000`，只截断 `findings[]`，不影响 `summary` 全量统计；发现一致性问题退出 `2`，无问题退出 `0`，参数、数据库或运行时失败退出 `1`，且非 `--json` 模式保持同一套退出码语义；不进入 ops/status light，也不自动修复，不提供 `--repair`、`--fix`、`--execute` 或等价变更模式。
- `errorType` 第一版固定为 `authentication_failed`、`permission_denied`、`model_not_found`、`provider_config_invalid`、`invalid_request`、`unsupported_request` 或 `unknown_permanent_provider_error`，不得直接使用 provider 原始错误码或自由文本。
- `provider` 和 `model` 只能来自本系统发起 run 时已知的调用上下文或配置元数据；各自最多 128 个 Unicode code point，超限返回 `null`；不得裁剪、哈希、重编码、压缩或从 provider message、原始报错、`errorSummary`、response payload、stack trace、日志行、异常字符串中解析。
- `httpStatus` 只能是真实 HTTP 状态码整数 `100..599` 或 `null`，不得混入 SDK 自定义状态、provider 自定义错误码、网络错误码、系统错误码、字符串状态码、`0`、负数或小数。
- `requestId` 只能来自 provider SDK / response metadata / response header 明确提供的 request id 或 correlation id；最多 128 个 Unicode code point，超限返回 `null`，不得裁剪、哈希、重编码、压缩或从 provider message、原始报错、`errorSummary`、stack trace、日志行、异常字符串中解析。
- `errorSummary` 必须是系统生成的脱敏短摘要，不得直接透传、截断、翻译、同义改写或轻度摘要 provider message；无法安全映射时返回 `errorSummary = null`。
- `errorSummary` 最多 200 个字符；超限时必须选择更短系统模板或返回 `null`，不得截断 provider message。
- `errorSummary` 的 200 字符上限按 Unicode code point 计数，不按 UTF-8 字节数或 JavaScript UTF-16 code unit。
- 新建 `pending` retry run 的 `nextAttemptAt` 写入本次 run 创建时间，并立即满足 `nextAttemptAt <= now` 的 claim 条件。
- 最大尝试次数为 4 次，即 1 次初始生成 + 3 次 retry；三档 retry backoff 分别对应 attempt 1、2、3 失败后，attempt 4 失败后保持 `failed`。
- attempt 4 终止失败 run 的 `nextAttemptAt = null`；是否 exhausted 由 `status = "failed"` 和 `attemptNumber >= 4` 判断。
- retry backoff 的 `failedAt` 使用失败实际生效时间；普通失败用失败落库时间，worker lease 超时用 `leaseExpiresAt`，不是发现超时的时间。
- `requested` 只保存规范化安全请求字段，不保存原始 argv、环境变量、secret、prompt、provider payload、完整模型配置或 provider 参数。
- 参数解析失败固定进入 `errors[]`，不得进入 `wouldErrors[]`，也不得输出 dry-run 预览字段。
- dry-run JSON 必须用 `would*` 字段和 `executionBlocked` 表达预估结果，不能把预估结果写成真实执行结果。
- `executionBlocked = true` 时，`would*` 字段仍是候选级预览，不能被自动化当成当前可真实执行。
- `wouldFailCount` 只统计候选级预计失败，不统计 global 阻断。
- dry-run 完整候选级预览时，`wouldQueueCount + wouldSkipCount + wouldFailCount` 必须等于最终候选数量。
- dry-run JSON 显式输出 `candidateCount`，并在完整候选级预览时等于三类 `would*Count` 之和。
- dry-run 无法产出最终候选列表时，仍必须输出 `candidateCount = null`，不得省略字段或用 `0` 表示不可用。
- `candidateCount = null` 时，三类 `would*Count` 固定为 `0`，候选级结果数组为空，但 `wouldErrors[]` 必须包含 global error。
- 批量 backfill 默认复用后端投资排序，不新增原因生成专属优先级。
- 批量 backfill 的 `--limit` 在候选过滤和完整排序之后截断。
- 批量 backfill 的 `--limit` 限制候选数量，不限制最终新排队 run 数量。
- manual backfill / repair 缺少原因生成配置时，dry-run 可成功提示，execute 预检失败且不写 run。
- manual backfill / repair execute 部分失败时退出码非 0，但不回滚已排队 run。
- manual backfill / repair execute 单候选失败后继续处理后续候选；全局预检失败立即停止。
- manual backfill / repair execute 全局预检失败不计入 `failedCount`，但通过 `target.scope = "global"` 的 `errors[]` 和非 0 退出码暴露。
- manual backfill / repair 的 `errors[]` 和 `wouldErrors[]` 使用固定 `errorCode` 和 `phase`，自由文本只进入 `message`。
- manual backfill / repair 的第一版错误对象只输出 `message`，不输出 `summary`。
- manual backfill / repair 的 `message` 必须脱敏，不能包含 raw exception、SQL、堆栈、provider 原始报错、prompt、payload、secret 或完整配置。
- manual backfill / repair 的默认 stderr / 本地日志必须脱敏；显式本地 debug 模式才允许更详细的 raw exception 和堆栈。
- manual backfill / repair 的 stderr / 本地日志始终不得输出 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload、secret、token、credential 或完整配置。
- manual backfill / repair 的 debug 模式只能通过显式 `--debug` 开启，不支持环境变量开启。
- manual backfill / repair 的 `--debug` 不进入 `requested`，不影响 stdout JSON、候选选择、执行行为、去重行为、退出码或数据库写入。
- manual backfill / repair 的 `errors[]` 和 `wouldErrors[]` 都包含 `retryable`，且由固定 `errorCode` / `phase` 计算。
- manual backfill / repair 的 `errors[]` 和 `wouldErrors[]` 都使用固定 `target` 对象定位失败范围。
- `target.candidateIndex` 使用最终候选列表的 0-based 位置，并在可获得时同时带 `eventId`。
- prompt 或 model 版本变化时 key 变化，可以重新生成。

这条规则避免 facts / evidence 更新、自动触发和内部 backfill 把同一份模型输入重复生成多次，同时保留失败重试和模型升级能力。

每个事件第一版最多保留 3 条 `active` 原因假设。

约束：

- 同一 event 最多 3 条 `active`
- 同一 `causeType` 最多 1 条 `active`
- 按 `basis`、`confidence`、evidence 权威性、selected evidence 顺序和 `causeType` 稳定顺序排序
- 旧版本或被替代结果标记为 `superseded`，不进入默认详情

目标是保持详情解释力，而不是展示大量相似推断。

新一次 generation run 成功后，按 run 结果整体替换该事件当前 active 集合：

- `available`：旧 active 全部标记为 `superseded`，新结果按规则选最多 3 条 active。
- `unknown`：旧 active 全部标记为 `superseded`，事件级 `causalStatus = "unknown"`，不保留 active 原因假设。
- `failed`：不替换旧 active，保留旧结果，run 标记为 `failed`。

这样避免同一事件默认详情混杂不同模型版本或不同输入版本生成的原因。

## 6. 状态语义

API 和详情页需要区分：

- `not_generated`：后端策略性未自动生成
- `pending`：还没生成或正在排队
- `unknown`：已经分析过，但当前材料不足以判断原因
- `available`：存在至少一条原因假设
- `failed`：生成过程发生技术失败

原因不足不是生成失败。它是系统对现有证据边界的诚实表达。

`causalStatus` 第一版由 generation run 和 active hypotheses 派生，不写入 `events` 表。

派生规则：

- 有 active hypotheses：`available`
- 最近一个成功 run 是 `unknown` 且没有 active：`unknown`
- 事件不符合自动生成 eligibility，且没有 active/run 覆盖：`not_generated`
- 有排队或运行中 run：`pending`
- 事件符合自动生成 eligibility 但还没有 run：`pending`
- 事件符合自动生成 eligibility，但原因生成器关闭或缺少配置且还没有 run：`pending`
- 最近一个 run 是 `failed` 且没有 active：`failed`
- 最近一个 run 是 `failed` 但仍有旧 active：用户侧返回 `available`，内部 diagnostics 显示最新 run 失败

原因生成器关闭或缺少配置不新增 provider-facing 状态，不复用 `not_generated`，也不伪装成 `failed`。默认用户界面只表达“原因生成中”；内部 ops/status 负责展示 disabled / missing config。

单条原因假设的生命周期状态第一版只表达自动化状态，不表达人工审核：

- `active`
- `superseded`
- `retracted`
- `failed`

第一版不做人审流。以后如需人工修正，单独设计 correction / manual override 机制。

## 7. 展示边界

默认事件详情可以展示所有未撤回的原因假设，包括低置信推断。

系统不替投资者隐藏原因，但必须让投资者能判断：

- 这是明示原因还是推断原因
- 置信度是多少
- 依据说明是什么
- 关联了哪些 evidence / fact
- 由哪个模型和输入范围生成

中文用户语言：

- UI 标题：原因假设
- 明示原因文案：证据显示
- 推断原因文案：可能原因
- 不足文案：原因待确认

## 8. Provider 与 MCP 边界

`CausalHypothesis` 属于 canonical event truth，应写入 canonical event engine，再由 projection 消费。

第一版进入 `InvestmentEventDetail`，不进入 `InvestmentEventBrief`。

`event_projection` 的 canonical checksum 必须包含 projection 会消费的当前 active 原因集合和派生 `causalStatus`。

不纳入 checksum 的内容：

- 历史 `superseded` 原因假设
- 未入选 active 的 suppressed / superseded 有效原因假设
- failed run diagnostics
- 内部错误信息
- 与 provider detail 无关的审计元数据
- 输入/输出快照
- snapshot truncation metadata
- `snapshotTruncated`

这样 active 原因变化会触发 projection refresh，但历史审计变化或快照截断不会导致无意义刷新。

快照截断不影响 projection checksum。projection checksum 只反映 provider 会消费的当前 active 原因集合和事件级 `causalStatus`；`snapshotTruncated`、`truncatedFields`、`originalSizeBytes`、`storedSizeBytes` 等内部审计质量信息不能让 projection stale。

projection stale 规则：

- active 原因集合变化：stale。
- `causalStatus` 变化：stale。
- suppressed / superseded 审计记录变化：不 stale。
- 仅快照截断状态变化：不 stale。
- diagnostics 读取 suppressed / superseded，不通过 provider detail 读取。

`newsnow` 本地 MCP 可以在事件详情工具中暴露 `causalHypotheses`，但只作为 provider adapter 输出。最终 public MCP 语义仍由 `nexus-fi-mcp` 归一。

## 9. 审批状态

实现级问题已完成收敛，`technical-design.md` 已进入“审批通过”状态。后续不再把本文件作为未决问题清单；当前可执行边界以 `technical-design.md`、`implementation-plan.md` 和 `decisions.md` 为准。

实现时原因假设作为独立子模块，不塞进现有 `impact.ts`、`investment-view.ts` 或 `scheduler.ts`。

建议模块：

- `server/services/event-engine/causal-hypothesis/types.ts`
- `server/services/event-engine/causal-hypothesis/input.ts`
- `server/services/event-engine/causal-hypothesis/generator.ts`
- `server/services/event-engine/causal-hypothesis/service.ts`
- `server/services/event-engine/causal-hypothesis/quality.ts`
- `server/services/event-engine/causal-hypothesis/index.ts`

边界：

- `impact.ts` 不承载原因推理，因为原因层不是影响层。
- `investment-view.ts` 只消费结果生成 projection，不生成原因。
- `scheduler.ts` 只负责触发，不承载原因业务逻辑。

数据库读写拆成独立模块 `server/database/causal-hypotheses.ts`，不继续扩胖 `server/database/events.ts`。

边界：

- `causal-hypotheses.ts` 负责新表、读写、run、active 替换、状态派生和统计查询。
- `events.ts` 只在需要组装 `EventDetail` 或 projection canonical input 时通过小接口消费。
- SQL ownership 单独声明，owner 仍为 `investment-event`。
- migration/init 由现有 db 初始化路径调用该模块。

类型边界：

- `shared/types.ts` 只放 provider-facing contract 类型，例如 `InvestmentCausalStatus`、`InvestmentCausalHypothesis`、`InvestmentEvidenceSpan`。
- `server/services/event-engine/causal-hypothesis/types.ts` 放模型输入、模型输出、run input、内部候选和质量门禁结果。
- `server/database/causal-hypotheses.ts` 放数据库 row/input 类型，或仅保留文件内私有类型。

这样 `shared/` 只承载前端、provider API 和本地 MCP 需要共享的对外合同，不暴露内部生成和存储细节。

`InvestmentCausalHypothesis` provider-facing 字段只保留用户和下游审计所需的最小信息。

对外字段：

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

不对外直接暴露：

- raw prompt
- full model input
- `inputChecksum`
- `generationRunId`
- 单条内部 `status`
- 内部 error code
- 完整 provider/model 参数

原因假设的 structured-output schema / prompt 独立注册到现有 prompt/schema 体系，不内联写在 generator 里。

边界：

- 沿用现有 `server/services/event-engine/prompt-registry.ts` 模式。
- `server/services/event-engine/prompts/causal-hypothesis-generator.ts` 放 prompt definition，并注册到 `EVENT_ENGINE_PROMPTS`。
- `server/services/event-engine/causal-hypothesis/prompt.ts` 放 schema 常量、prompt id/version 导出和 bounded input builder。
- `server/services/event-engine/causal-hypothesis/generator.ts` 加载 `prompt.ts` 并调用 structured-output 模型。
- schema / prompt 作为版本化资源维护。
- `promptVersion` 和 `inputBuilderVersion` 明确进入 generation run 和 `input_checksum`。
- generator 只加载当前版本并调用模型。
- schema 变化必须触发新 key，可以重新生成。
- 测试覆盖 schema 校验和 invalid output 降级。

原因假设生成必须使用独立大模型配置档，不复用 subject-role 或 watch-target 的配置。

实现边界：

- profile id 为 `event-engine-causal-hypothesis`。
- `envPrefix` 为 `EVENT_ENGINE_CAUSAL_HYPOTHESIS`。
- 支持 `EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_ENABLED`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_PROVIDER`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_BASE_URL`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_API_KEY`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_MODEL`。
- 使用独立 `EVENT_ENGINE_CAUSAL_HYPOTHESIS_TIMEOUT_MS`，默认 45 秒，最大 45 秒。
- 配置未启用或缺少必要配置时，自动触发不写入新的 `pending` run，不伪装成模型失败；ops/status 必须展示原因生成器 disabled / missing config。

模型 structured-output 顶层直接区分 `available` 和 `unknown`：

- `status`: `available` / `unknown`
- `confidence`
- `hypotheses`
- `unknownReason`

规则：

- `status = "available"` 时，`hypotheses` 必须有 1-3 条。
- `status = "unknown"` 时，`hypotheses` 必须为空，`unknownReason` 必填。
- 技术失败不由模型输出表达，而由 generator / run 捕获为 `failed`。

模型单条 hypothesis 只输出可验证原因字段：

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

模型输出的 `evidenceIds` 和 `factIds` 只能引用输入里给过的 id，不能由模型自由编造。

校验规则：

- `evidenceIds` 必须非空。
- 每个 `evidenceId` 必须存在于 selected evidence 输入集合。
- 每个 `factId` 必须存在于 selected facts 输入集合。
- `evidenceSpans[].evidenceId` 必须存在于 `evidenceIds`。
- 引用不存在 id 的 hypothesis 直接 invalid。
- 如果所有 hypotheses invalid，则 run 记为 `failed` 或 schema invalid，不保存原因。

多条 hypothesis 中部分无效时，不让整次 run 直接失败：

- 逐条校验 hypothesis。
- 无效引用的单条 hypothesis 丢弃，并记录 `invalidHypothesisCount`。
- 只要剩余有效 hypotheses >= 1：run 仍为 `succeeded`。
- 如果全部无效：run 为 `failed`，`errorCode = "causal_hypothesis_invalid_references"`。
- diagnostics 记录无效数量和原因，但不进入 provider detail。

第一版不设置最低 `confidence` 硬阈值。低置信但有有效证据的推断可以进入 active。

规则：

- `confidence` 必须在 `0..1`。
- 低置信可以进入 active，只要 evidence 引用有效。
- active 排序时使用 `confidence`。
- UI 明确显示置信度或高/中/低。
- diagnostics 可统计低置信占比。

active 排序不是纯按 `confidence`。

排序规则：

1. `basis = stated` 优先于 `inferred`
2. `confidence` 高优先
3. evidence 权威性高优先
4. selected evidence 排序靠前优先
5. `causeType` 稳定顺序兜底，保证结果可重复

同一 `causeType` 多条有效结果时，只保留排序最高的一条 active，其他有效结果写入为 `superseded`。

规则：

- 同一 run 内同一 `causeType` 多条有效 hypothesis：排序最高的一条进入 active。
- 其他有效但未入选的同类型 hypothesis 写入为 `superseded`。
- 超过 3 条 active 容量的有效 hypothesis 也写入为 `superseded`。
- diagnostics 记录 `suppressedHypothesisCount`。

单条 `InvestmentCausalHypothesis` 不暴露 `status`。provider/detail 默认只返回 active 原因假设；事件级状态由 `causalStatus` 表达。

- 生成队列与现有 scheduler / worker 的具体集成方式需要进一步设计；去重 key 已确认。
- 大模型输入快照持久化口径已确认；具体字段 schema 和测试 fixture 仍需实现时细化。
- 质量指标与回放验证方案需要进一步设计。
- 第一版是否需要 migration/backfill 全量覆盖历史高价值事件，需要进一步评估。
