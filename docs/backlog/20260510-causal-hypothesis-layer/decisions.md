# Decisions

状态：Ready for Implementation；拷问共识已写入技术方案
最后更新：2026-05-25
范围：`CausalHypothesis` 原因假设层的产品与技术决策

## Product Decisions

### PD-1 第一版先回答“为什么会发生”

Stage B 第二层第一版聚焦 `CausalHypothesis`，即原因假设。

不先做通用 `EventRelation` 或事件关系图。

### PD-2 原因假设不是影响判断或行动建议

原因假设只回答 upstream cause / trigger / context。

它不直接产出 directional view、materiality、tradability、watch-next 或 action recommendation。

### PD-3 默认详情展示所有未撤回原因假设

系统不替投资者隐藏低置信推断。

但每条原因必须标注明示/推断、置信度、依据说明和证据/事实引用。

### PD-4 无来源自由发挥不能进入

完全没有证据来源、也没有明确输入依据的模型自由发挥不能进入 `CausalHypothesis`。

低置信可以展示，推断可以展示，但不能无来源。

### PD-5 第一版不做人审流

第一版追求自动化生成、保存、展示和重算。

人工修正以后单独设计，不混进第一版生命周期状态。

## Technical Decisions

### TD-1 大模型负责主要原因推理

后端不使用规则穷举原因判断。

大模型负责从 canonical event 内已有材料中生成候选原因假设。

### TD-2 后端负责结构化保存和证据约束

后端保存原因假设、绑定 evidence/fact 引用、记录状态、版本、模型信息和输入范围。

后端不把原因假设转换成最终投资结论。

### TD-3 原因假设进入 canonical truth

`CausalHypothesis` 是核心投资语义，必须写入 canonical event truth，再由 projection 消费。

不能只写入 `InvestmentEventDetail` projection。

### TD-4 使用独立表

第一版使用独立表 `event_causal_hypotheses`。

不把原因假设塞进 `events` 表的大 JSON 字段。

### TD-5 只引用 facts / evidence，不复制事实内容

原因假设只引用 `event_facts` 和 `event_evidence`。

不复制 fact value、delta、direction、source title 等内容，避免副本漂移。

### TD-6 第一版进入 detail，不进入 brief

`InvestmentEventDetail` 新增 `causalStatus` 和 `causalHypotheses`。

`InvestmentEventBrief` 第一版不新增原因字段。

### TD-7 读取路径不生成

大模型生成只在写入、修复、回放或版本升级路径触发。

详情页、provider API 和 MCP 调用只读已保存原因假设。

### TD-8 区分 not_generated / pending / unknown / available / failed

API 和详情页必须区分策略性未自动生成、等待生成、已分析但原因不足、原因可用、技术失败。

`unknown` 不是失败，是语义结果。

`not_generated` 不是等待队列，是后端策略性跳过自动生成。

### TD-9 `causeType` 使用少量受控枚举

第一版 `causeType` 不允许任意字符串。

初始集合为：

- `policy_or_regulation`
- `macro_or_liquidity`
- `industry_supply_demand`
- `company_action`
- `market_flow_or_sentiment`
- `external_event`

不在第一版细分过多原因类型，避免形成另一套不稳定分类系统。

如果原因无法判断，不创建原因假设，使用事件级 `causalStatus = "unknown"`。

### TD-10 `basis` 只表达真实原因假设的来源类型

`basis` 第一版只包含：

- `stated`
- `inferred`

它不表达置信度、生命周期或生成状态。

置信度由 `confidence` 表达；单条原因假设生命周期由 `status` 表达；事件级原因生成状态由 `causalStatus` 表达。

`unknown` 是事件级 `causalStatus`，不是一条伪造的原因假设。材料不足时返回空 `causalHypotheses`。

### TD-11 `confidence` 使用 `0..1` 小数

`confidence` 第一版使用 `0..1` 小数，表示模型/抽取置信度。

它不是 `materialityScore`、`tradabilityScore` 这类 `0..100` 投资评分。

UI 可以把它渲染为百分比或高/中/低。

### TD-12 `statement` 和 `rationale` 分工

`statement` 只负责一句话说明原因假设是什么。

`rationale` 负责说明系统为什么这么判断，引用了哪些输入线索。

`evidenceIds` / `factIds` 负责机器可追踪引用。

### TD-13 每条原因假设至少绑定一个 evidence

每条 `CausalHypothesis` 必须至少绑定一个 `evidenceId`。

`factIds` 可以为空，因为部分原因来自标题、摘要或正文语义，不一定已经结构化成 `event_facts`。

如果结构化事实参与原因判断，则必须记录对应 `factIds`。

完全没有 `evidenceId` 的原因不能进入 `CausalHypothesis`。

### TD-14 第一版不保存长原文摘录

原因表不复制长 evidence 原文。

第一版只保存简短 `rationale`、`evidenceIds`、`factIds` 和必要的 `evidenceSpans`。

`evidenceSpans` 只能用于定位依据，不能替代 canonical evidence 原文。

候选字段包括：

- `evidenceId`
- `field`
- `snippet`
- `offset`

### TD-15 `input_checksum` 只覆盖模型实际输入

`input_checksum` 只覆盖生成原因时实际喂给模型的规范化输入，而不是整个 canonical event detail。

第一版纳入 title / summary、selected evidence、selected facts、affected entities / markets / topics、timeline state、source kind / authority、input builder version、prompt version 和 model name。

projection 展示字段、UI 文案或 unrelated metadata 不纳入 checksum，避免无意义重算。

### TD-16 模型输入材料设上限

第一版不把一个事件的所有 evidence / facts 全部喂给模型。

输入上限：

- evidence 最多 5 条
- facts 最多 12 条

evidence 按权威性、primary source、新近程度和与 title / primary subject / topic 的相关性选择。

facts 优先选择有 `evidenceId`、有方向、数值或实体的结构化事实。

### TD-17 单独记录 generation run

第一版新增轻量 `event_causal_hypothesis_runs`，记录一次原因假设生成任务的整体状态。

run 记录包括：

- `runId`
- `eventId`
- `inputChecksum`
- `inputSnapshot`
- `inputBuilderVersion`
- `outputSnapshot`
- `modelProvider`
- `modelName`
- `promptVersion`
- `status`
- `errorCode`
- `startedAt`
- `finishedAt`

`event_causal_hypotheses.generation_run_id` 引用 run。

这样可以区分“已分析但原因不足”和“技术失败”，也方便统计覆盖率、失败率和模型升级后的回放效果。

### TD-18 限制 active 原因假设数量

每个 event 第一版最多保留 3 条 `active` 原因假设。

同一 `causeType` 最多 1 条 `active`。

默认详情只读取 `active`，旧版本或被替代结果标记为 `superseded`。

active 排序按 `basis`、`confidence`、evidence 权威性、selected evidence 顺序和 `causeType` 稳定顺序处理。

### TD-19 成功 run 整体替换 active 集合

新一次 generation run 成功后，按 run 结果整体替换该事件当前 active 集合。

- `available`：旧 active 全部标记为 `superseded`，新结果按规则选最多 3 条 active。
- `unknown`：旧 active 全部标记为 `superseded`，事件级 `causalStatus = "unknown"`。
- `failed`：不替换旧 active，保留旧结果，run 标记为 `failed`。

默认详情不能混杂不同模型版本或不同输入版本生成的原因。

### TD-20 `causalStatus` 由 run 和 active hypotheses 派生

第一版不在 `events` 表写 `causal_status` snapshot 字段。

派生规则：

- 有 active hypotheses：`available`
- 最近一个成功 run 是 `unknown` 且没有 active：`unknown`
- 事件不符合自动生成 eligibility，且没有 active/run 覆盖：`not_generated`
- 有排队或运行中 run：`pending`
- 事件符合自动生成 eligibility 但还没有 run：`pending`
- 事件符合自动生成 eligibility，但原因生成器关闭或缺少配置且还没有 run：`pending`
- 最近一个 run 是 `failed` 且没有 active：`failed`
- 最近一个 run 是 `failed` 但仍有旧 active：用户侧返回 `available`，内部 diagnostics 显示最新 run 失败

这样避免 `events` 表再增加容易漂移的派生状态。

### TD-21 projection checksum 包含当前原因集合

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

projection stale 规则：

- active 原因集合变化：stale。
- `causalStatus` 变化：stale。
- suppressed / superseded 审计记录变化：不 stale。
- 仅快照截断状态变化：不 stale。
- diagnostics 读取 suppressed / superseded，不通过 provider detail 读取。

### TD-22 读取路径可以 repair projection，但不能生成原因

如果 detail projection 缺失或 stale，读取路径可以同步从 canonical detail 重建 projection。

但 projection repair 只能消费已经存在的 active `CausalHypothesis` 和 generation run 状态，不能调用大模型生成原因假设。

原因还没生成时，按自动生成 eligibility 返回 `not_generated` 或 `pending`；原因生成失败或未知时按已有 run 派生状态返回。

### TD-23 生成队列按模型输入和版本去重

生成队列按 `eventId + inputChecksum + promptVersion + modelName` 去重。

去重规则：

- 同 key 已经有 `succeeded` 或 `unknown` run：不再生成。
- 同 key 已经有 `pending` 或 `running` run：不重复排队。
- 同 key 之前是 `failed`：允许按退避策略重试。
- prompt 或 model 版本变化时 key 变化，可以重新生成。

这避免 facts / evidence 更新、自动触发和内部 backfill 重复生成同一份输入，同时保留失败重试和模型升级能力。

### TD-24 复用现有 event engine worker / scheduler / backfill

第一版生成队列复用现有 event engine 的 worker / scheduler / backfill 体系。

原因假设是 canonical event engine 的第二层能力，不新增独立常驻服务。

实现边界：

- 新增原因假设生成模块和 run 表。
- 由现有 worker / scheduler 在合适时机触发。
- manual backfill / repair 走同一套模块。
- ops/status 后续扩展原因生成 eligible 覆盖率、失败率、队列状态、策略跳过数量和配置阻塞数量。
- 不新增独立 daemon 或独立服务生命周期命令。

### TD-25 第一版不自动全量 backfill 历史事件

backfill 指历史数据回填：对功能上线前已经存在的历史事件补跑原因假设生成。

第一版策略：

- 新事件自动生成。
- facts / evidence 更新时自动生成或重算。
- 提供手动 backfill / repair 入口。
- backfill 默认按投资优先级、小批量、低并发执行。
- 不在上线时自动扫描全部历史事件。

### TD-26 提供内部 backfill/repair 脚本

手动 backfill / repair 第一版作为内部 ops 能力，不新增公开 provider API。

必须提供内部脚本，例如：

- `scripts/backfill-causal-hypotheses.ts`

脚本必须支持：

- `--limit`
- 优先级过滤
- `--dry-run` 或 preview
- `--concurrency`
- `--execute`
- `--event-id`
- `--run-id`
- 第一版不提供独立 `--rate-limit-ms`、`--delay-ms` 或等价限速参数。

默认行为：

- 默认 dry-run / preview。
- 真实执行必须显式传 `--execute`。
- dry-run 输出将处理的 event 数量、排序前若干 eventId、预计模型调用数量。
- 必须要求 `--limit`，除非传了精确定位参数 `--event-id` 或 `--run-id`。
- 默认 limit 上限保守，例如最大 100。

边界：

- provider API 只读结果，不触发生成。
- frontend 详情页不提供“立即生成原因”按钮。
- 本地 MCP 不提供触发 backfill 的 public tool。
- ops/manual repair 可以触发小批量补跑。

### TD-27 ops/status 只暴露运行健康信息

原因假设生成运行状态接入现有 ops/status。

light 状态只给摘要：

- `eligibleCoverage`
- 失败率
- pending 数量
- `notGeneratedCount`
- `blockedByGeneratorConfigCount`
- `permanentProviderErrorCount`
- `latestPermanentProviderErrorAt`

diagnostics 模式展示：

- 最近 failed runs
- unknown 比例
- 平均耗时
- 重试次数
- 按 event family 的覆盖率
- 缺失配置项名称
- 被配置阻塞的少量 eventId 样例
- `permanentProviderErrorSamples`

ops/status 不返回每条原因假设内容，也不作为模型输出详情页。

统计口径：

- `eligibleCoverage` 只统计 backend `actionBucket = actionable | watch` 的事件。
- `notGeneratedCount` 单独统计 backend `actionBucket = noise` 且策略性跳过自动生成的事件。
- `not_generated` 不进入失败率。
- `not_generated` 不进入 pending 数量。
- 失败率只统计已经尝试生成的 eligible runs。
- pending 数量只统计已写入 `pending` / `running` run 的事件。
- `blockedByGeneratorConfigCount` 只统计因为原因生成器关闭或缺少配置而没有写入 run 的 eligible event。
- `blockedByGeneratorConfigCount` 不进入 pending 数量、失败率或 `notGeneratedCount`。
- `permanentProviderErrorCount` 只统计当前保留的 run 表全量可见历史中 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 failed run。
- `latestPermanentProviderErrorAt` 使用这类 failed run 的最新 `finishedAt`。
- 因缺少持久化 `runId`、`eventId` 或 `finishedAt` 而不能进入 `permanentProviderErrorSamples[]` 的 run，不进入 ops/status light；由本地数据一致性检查脚本报告。

### TD-28 新增结构型质量门禁

第一版新增 `causal-hypothesis` 质量门禁。

门禁只检查结构、状态和读取路径边界，不评判模型推理是否绝对正确。

门禁规则：

- active 原因必须至少有一个 `evidenceId`
- active 原因数量不能超过 3
- 同一 event + `causeType` 不能有多个 active
- `basis` 只能是 `stated` / `inferred`
- `causeType` 只能是已确认枚举
- `confidence` 必须在 `0..1`
- projection detail 中的 `causalStatus` 与 active/run 状态一致
- 读取路径不能触发模型调用

模型推理质量后续通过 replay、抽样 review 或回测评估，不放进第一版结构门禁。

### TD-29 技术方案曾保持 Draft

历史阶段结论：`technical-design.md` 当时不进入“审批通过”。

当时进入审批前需要完成实现级拷问：

- 具体模块放在哪些 `server/` 文件里
- migration 怎么写
- prompt/schema 怎么组织
- 生成任务如何与现有 scheduler 的实际代码连接
- 测试切片怎么排

当前这些问题已在技术方案和实施计划中收敛，本阶段状态以 TD-166 为准。

### TD-30 原因假设使用独立 event-engine 子模块

实现时原因假设拆成独立子模块：

- `server/services/event-engine/causal-hypothesis/types.ts`
- `server/services/event-engine/causal-hypothesis/input.ts`
- `server/services/event-engine/causal-hypothesis/generator.ts`
- `server/services/event-engine/causal-hypothesis/service.ts`
- `server/services/event-engine/causal-hypothesis/quality.ts`
- `server/services/event-engine/causal-hypothesis/index.ts`

不把原因推理塞进 `impact.ts`、`investment-view.ts` 或 `scheduler.ts`。

原因：

- `impact.ts` 负责影响层，不负责原因层。
- `investment-view.ts` 只消费结果生成 projection。
- `scheduler.ts` 只触发任务，不承载原因业务逻辑。

### TD-31 数据库读写使用独立模块

数据库读写拆成 `server/database/causal-hypotheses.ts`。

职责：

- 初始化新表。
- 写入 run。
- 写入/替换 active 原因集合。
- 派生 `causalStatus`。
- 提供 projection/detail 读取接口。
- 提供 ops/status 统计查询。

`server/database/events.ts` 不继续承载原因假设表读写，只通过小接口消费结果。

SQL ownership 单独声明，owner 仍为 `investment-event`。

### TD-32 区分 shared contract 类型和内部实现类型

provider-facing 类型放在 `shared/types.ts`：

- `InvestmentCausalStatus`
- `InvestmentCausalHypothesis`
- `InvestmentEvidenceSpan`

内部生成类型放在 `server/services/event-engine/causal-hypothesis/types.ts`：

- 模型输入
- 模型输出
- run input
- 内部候选
- 质量门禁结果

数据库 row/input 类型放在 `server/database/causal-hypotheses.ts`，或保持文件内私有。

`shared/` 只承载前端、provider API 和本地 MCP 需要共享的对外合同，不暴露内部生成和存储细节。

### TD-33 provider-facing 原因假设只暴露最小审计信息

`InvestmentCausalHypothesis` 对外字段为：

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

这些内部信息保留在 run 表、内部表或 diagnostics 中。

### TD-34 单条原因假设不对外暴露 status

provider/detail 默认只返回 active 原因假设。

单条 `InvestmentCausalHypothesis` 不暴露内部生命周期 `status`。

事件级状态由 `causalStatus` 表达；`superseded`、`retracted`、`failed` 等内部状态只用于存储、修复和 diagnostics。

### TD-35 diagnostics 可暴露 run 级定位信息

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

diagnostics 模式仍不得暴露：

- raw prompt
- full model input
- 原始 evidence payload 全文
- provider secrets 或完整请求参数

这样运维能定位失败和重试问题，但不会把模型输入和敏感信息塞进状态接口。

### TD-36 prompt/schema 独立注册并版本化

原因假设的 structured-output schema / prompt 沿用现有 `server/services/event-engine/prompt-registry.ts` 模式。

generator 不内联维护完整 prompt / schema。

边界：

- `server/services/event-engine/prompts/causal-hypothesis-generator.ts` 放 prompt definition，并注册到 `EVENT_ENGINE_PROMPTS`。
- `server/services/event-engine/causal-hypothesis/prompt.ts` 放 schema 常量、prompt id/version 导出和 bounded input builder。
- `server/services/event-engine/causal-hypothesis/generator.ts` 加载 `prompt.ts` 并调用 structured-output 模型。
- schema / prompt 作为版本化资源维护。
- `promptVersion` 和 `inputBuilderVersion` 明确进入 generation run 和 `input_checksum`。
- generator 只加载当前版本并调用模型。
- schema 变化必须触发新 key，可以重新生成。
- 测试覆盖 schema 校验和 invalid output 降级。

### TD-37 模型输出顶层区分 available 和 unknown

模型 structured-output 顶层直接区分 `available` 和 `unknown`。

字段：

- `status`: `available` / `unknown`
- `confidence`
- `hypotheses`
- `unknownReason`

规则：

- `status = "available"` 时，`hypotheses` 必须有 1-3 条。
- `status = "unknown"` 时，`hypotheses` 必须为空，`unknownReason` 必填。
- 技术失败不由模型输出表达，而由 generator / run 捕获为 `failed`。

### TD-38 模型单条 hypothesis 只输出可验证原因字段

模型每条 hypothesis 只输出：

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

模型不输出 id、label、status、generatedAt 这类系统字段。

### TD-39 模型只能引用输入中的 evidence/fact id

模型输出的 `evidenceIds` 和 `factIds` 只能引用输入里给过的 id，不能自由编造。

校验规则：

- `evidenceIds` 必须非空。
- 每个 `evidenceId` 必须存在于 selected evidence 输入集合。
- 每个 `factId` 必须存在于 selected facts 输入集合。
- `evidenceSpans[].evidenceId` 必须存在于 `evidenceIds`。
- 引用不存在 id 的 hypothesis 直接 invalid。
- 如果所有 hypotheses invalid，则 run 记为 `failed` 或 schema invalid，不保存原因。

### TD-40 部分无效 hypothesis 不导致整次 run 失败

逐条校验 hypothesis。

无效引用的单条 hypothesis 丢弃，并记录 `invalidHypothesisCount`。

只要剩余有效 hypotheses >= 1，run 仍为 `succeeded`。

如果全部无效，run 为 `failed`，`errorCode = "causal_hypothesis_invalid_references"`。

diagnostics 记录无效数量和原因，但不进入 provider detail。

### TD-41 不设置最低 confidence 硬阈值

第一版不因低置信而丢弃 hypothesis。

规则：

- `confidence` 必须在 `0..1`。
- 低置信可以进入 active，只要 evidence 引用有效。
- active 排序时使用 `confidence`。
- UI 明确显示置信度或高/中/低。
- diagnostics 可统计低置信占比。

只要不是无来源、无效引用或结构错误，低置信推断保留给投资者自己判断。

### TD-42 active 排序优先明示原因

active 排序不纯按 `confidence`。

排序规则：

1. `basis = stated` 优先于 `inferred`
2. `confidence` 高优先
3. evidence 权威性高优先
4. selected evidence 排序靠前优先
5. `causeType` 稳定顺序兜底，保证结果可重复

这样原文明示原因不会被一个高置信推断压下去。

### TD-43 同 causeType 只保留排序最高的一条 active

同一 `causeType` 多条有效结果时，只保留排序最高的一条 active。

规则：

- 同一 run 内同一 `causeType` 多条有效 hypothesis：排序最高的一条进入 active。
- 其他有效但未入选的同类型 hypothesis 写入为 `superseded`。
- 超过 3 条 active 容量的有效 hypothesis 也写入为 `superseded`。
- diagnostics 记录 `suppressedHypothesisCount`。

这样满足“同一 `causeType` 最多 1 条 active”，同时保留审计痕迹。

### TD-44 原因生成在 canonical 写入事务后异步触发

自动原因生成接在 `server/services/event-engine/scheduler.ts` 的 `persistResolvedEvent()` 事务提交之后。

规则：

- 不把 structured-output 模型调用放进 `eventTable.withTransaction()`。
- `scheduler.ts` 只调用 causal service 小接口，不承载原因业务逻辑。
- `causal-hypothesis/service.ts` 负责去重、run 状态、生成、active 替换和生成完成后的 projection refresh。
- projection repair / rebuild 只读取已有 active 原因和派生 `causalStatus`，不能触发模型生成。
- 内部 backfill 脚本复用同一个 service 入口，不能绕过去重、质量门禁和 run 记录。

这样可以保证 canonical event 入库不被 LLM 延迟、失败或重试阻塞，同时保持原因假设仍然是 backend truth。

### TD-45 generation run 表同时作为持久队列

第一版不新增独立原因生成队列表，也不把纯内存队列作为事实源。

`event_causal_hypothesis_runs` 同时承担：

- 生成请求队列
- worker claim 状态
- run 审计记录
- retry / backoff 状态

规则：

- 自动触发或手动 backfill 先写入 `pending` run。
- worker 通过 lease 将 `pending` run claim 为 `running`。
- run 表记录 `attempt_number`、`next_attempt_at`、`locked_at`、`lock_owner`、`lease_expires_at`。
- 进程重启后，`lease_expires_at` 已过期的 `running` run 可被标记为 timeout failed，并保存对应 `next_attempt_at`。
- retry run 只能由统一 retry 入队流程在 `next_attempt_at` 到期后创建。
- 同一 `event_id + input_checksum + prompt_version + model_name` 已存在 `pending` / `running` / `succeeded` / `unknown` 时，新请求跳过。
- 同 key 最近结果为 `failed` 时，到达退避时间后允许插入新的 `pending` retry run。

这样可以同时满足自动化、可恢复、可审计和不重复生成。

### TD-46 第一版原因生成默认单并发

第一版原因生成并发保持保守。

规则：

- 自动 worker 默认 `concurrency = 1`。
- `processPendingCausalHypothesisRuns()` 默认一次只 claim / 执行 1 个 pending run。
- 手动 backfill 脚本默认 `--concurrency 1`。
- 手动 backfill 第一版最多允许 `--concurrency 2`。
- 并发参数只影响同时执行的 run 数量，不改变去重 key、lease 语义或 active 替换规则。

理由是原因生成依赖大模型调用。第一版优先保证可审计、可恢复、成本可控和输出质量稳定；等 ops 指标稳定后再提升并发。

### TD-47 第一版原因生成使用保守 timeout / lease / retry 参数

第一版原因生成运行参数：

- 单次 structured-output 模型调用超时：45 秒。
- run lease：120 秒。
- 同一 key 最大尝试次数：4 次，即 1 次初始生成 + 3 次 retry。
- retry backoff：attempt 1 失败后 5 分钟，attempt 2 失败后 30 分钟，attempt 3 失败后 2 小时。

失败处理：

- attempt 4 失败后保持 `failed`，不再创建 retry run。
- `failed` 不阻塞事件入库。
- `failed` 不清除已有 active 原因假设。
- `failed` 默认不进入 provider detail，只在 diagnostics 暴露。

理由是第一版要先保证事件系统主路径稳定，不能让原因推理的模型超时、失败或重试影响 canonical event 的入库和已有可用解释。

### TD-48 第一版自动生成只覆盖 `actionable` / `watch` 事件

第一版不对所有 canonical event 自动生成原因假设。

规则：

- backend `InvestmentEventDetail.actionBucket = "actionable"` 的事件自动生成。
- backend `InvestmentEventDetail.actionBucket = "watch"` 的事件自动生成。
- backend `InvestmentEventDetail.actionBucket = "noise"` 的事件默认不自动生成。
- 内部脚本可以通过精确 `--event-id` 或显式 `--include-noise` 强制生成 `noise` 事件。
- 读取详情页不能因为 `noise` 或未生成状态而触发模型调用。

`actionBucket` 必须由 backend investment projection 从 canonical detail 计算，不能由 frontend、MCP formatter 或外部 prompt 重新判断。

理由是第一版要把模型预算集中在投资者真正可能打开详情并用于决策的事件上，同时保持手动补跑能力。

### TD-49 `not_generated` 表达策略性未自动生成

第一版 `InvestmentCausalStatus` 增加 `not_generated`。

规则：

- `not_generated` 是事件级 provider 状态。
- `not_generated` 不是 generation run 状态。
- `not_generated` 不是单条 hypothesis 状态。
- 当事件不符合自动生成 eligibility，且没有 active 原因或历史 run 覆盖时，返回 `not_generated`。
- `not_generated` 前端展示为“未自动生成”。
- 内部脚本仍可以用精确 `--event-id` 或显式 `--include-noise` 强制生成。

理由是 `pending` 表示已排队或应生成但尚未完成；`noise` 被策略性跳过时显示 `pending` 会误导用户和运维判断。

### TD-50 ops/status 区分 eligible 覆盖率和策略跳过数量

ops/status 不把 `not_generated` 混入覆盖率、失败率或 pending。

规则：

- `eligibleCoverage` 只统计 backend `actionBucket = actionable | watch` 的事件。
- `eligibleCoverage` 分母不包含 `not_generated`。
- `notGeneratedCount` 单独统计 backend `actionBucket = noise` 且策略性跳过自动生成的事件。
- `not_generated` 不进入 failure rate。
- `not_generated` 不进入 pending count。
- failure rate 只统计已经尝试生成的 eligible runs。
- pending count 只统计已写入 `pending` / `running` run 的事件。
- `blockedByGeneratorConfigCount` 单独统计符合自动生成 eligibility、没有 active/run 覆盖、但原因生成器关闭或缺少配置而没有写入 run 的事件。
- `blockedByGeneratorConfigCount` 不进入 pending count、failure rate 或 `notGeneratedCount`。

这样 ops/status 表达的是“该生成的生成了多少”，同时保留“策略跳过了多少”的可见性。

### TD-51 原因生成使用独立大模型配置档

原因假设生成使用独立 `defineLlmProfile` 配置档，不复用 subject-role 或 watch-target 的大模型配置。

规则：

- profile id 为 `event-engine-causal-hypothesis`。
- `envPrefix` 为 `EVENT_ENGINE_CAUSAL_HYPOTHESIS`。
- 默认模型可以沿用现有 event-engine 小模型默认值：`openai = gpt-5.4-mini`，`minimax = MiniMax-M2.7`。
- 独立环境变量包括 `EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_ENABLED`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_PROVIDER`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_BASE_URL`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_API_KEY`、`EVENT_ENGINE_CAUSAL_HYPOTHESIS_LLM_MODEL`。
- 调用超时使用独立 `EVENT_ENGINE_CAUSAL_HYPOTHESIS_TIMEOUT_MS`，默认 45 秒，最大 45 秒。
- 配置未启用或缺少必要配置时，自动触发不得写入新的 `pending` run，也不得把它伪装成模型失败。
- ops/status 必须暴露原因生成器是否启用、provider、model、缺失配置项和 prompt id/version。

这样可以独立调节原因生成的模型成本、速度、权限和回放行为，避免和 subject-role / watch-target 的线上参数互相影响。

### TD-52 缺少原因生成配置时 provider 状态仍为 pending

当事件符合自动生成 eligibility，但原因生成器关闭或缺少必要配置且还没有 run 时，provider-facing `causalStatus` 仍返回 `pending`。

规则：

- 不新增 provider-facing 状态。
- 不改用 `not_generated`，因为 `not_generated` 只表达后端策略性跳过。
- 不伪装成 `failed`，因为没有发生模型调用或结构校验失败。
- 自动触发不得写入新的 `pending` run。
- ops/status 必须展示原因生成器 disabled / missing config，并说明缺失配置项。

这样可以避免把内部运维配置泄漏成投资者默认合同，同时让运维界面准确解释“为什么还在等待生成”。

### TD-53 ops/status 单独统计配置阻塞数量

ops/status 增加 `blockedByGeneratorConfigCount`，统计符合自动生成 eligibility、没有 active/run 覆盖、但原因生成器关闭或缺少必要配置而没有写入 run 的事件数量。

规则：

- light 状态展示 `blockedByGeneratorConfigCount`。
- diagnostics 模式展示缺失配置项名称、prompt id/version、实际 provider/model，以及少量被配置阻塞的 eventId 样例。
- `blockedByGeneratorConfigCount` 不进入 pending count，因为没有真实队列任务。
- `blockedByGeneratorConfigCount` 不进入 failure rate，因为没有模型调用失败。
- `blockedByGeneratorConfigCount` 不进入 `notGeneratedCount`，因为它不是策略性跳过。

这样 ops/status 能解释 provider-facing `pending` 背后的配置阻塞原因，同时不污染队列、失败率或策略跳过统计。

### TD-54 run 记录保存受控输入快照

`event_causal_hypothesis_runs` 保存当次生成实际使用的规范化、限量后的模型输入快照，字段建议为 `input_snapshot_json`。

快照可以包含：

- canonical event title / summary
- selected evidence 的 id、title、summary、短 payload 摘要、source kind / authority
- selected facts 的 id、类型、方向、数值、实体和 evidence 绑定
- affected entities / markets / topics
- timeline state
- input builder version
- prompt id/version
- model provider / model name

快照不得包含：

- raw prompt
- 完整原文
- 完整 provider request / response payload
- provider secrets
- frontend 展示文案或无关 metadata

规则：

- `input_checksum` 继续由这份规范化输入、input builder version、prompt version 和 model name 派生。
- `input_builder_version` 写入 run 记录，并进入 `input_snapshot_json`。
- `input_snapshot_json` 用于审计、回放和问题定位。
- `input_snapshot_json` 不进入 provider-facing `InvestmentCausalHypothesis`。
- frontend 和 ops/status light 不暴露 `input_snapshot_json`。
- diagnostics 默认只暴露 checksum、prompt/model 信息和摘要级定位信息，不返回完整快照。

这样可以复原“当时模型看到了什么”，同时避免把提示词、完整原文或 provider 请求载荷泄漏到默认用户界面和状态接口。

### TD-55 输入构建器使用独立版本号

原因假设的输入构建器使用独立版本号，建议字段名为 `input_builder_version`，代码常量由 `server/services/event-engine/causal-hypothesis/input.ts` 导出。

规则：

- `input_builder_version` 写入 `event_causal_hypothesis_runs`。
- `inputBuilderVersion` 写入 `input_snapshot_json`。
- `input_builder_version` 参与 `input_checksum`。
- 输入选择、排序、截断、字段结构变化时必须提升 `input_builder_version`。
- `input_builder_version` 不等于 `promptVersion`；prompt 未变化但输入构建规则变化时，也必须能触发新 checksum 和重新生成。
- 生成去重 key 仍使用 `event_id + input_checksum + prompt_version + model_name`；输入构建器版本通过 `input_checksum` 影响 key。

这样可以区分“提示词变了”和“模型看到的材料构建方式变了”，保证回放、审计和重新生成判断不会混淆。

### TD-56 run 记录保存受控输出快照

`event_causal_hypothesis_runs` 保存模型输出经系统解析和校验后的结构化、脱敏快照，字段建议为 `output_snapshot_json`。

快照可以包含：

- 模型返回的顶层 `status`
- `unknownReason`
- 模型返回的 hypotheses 结构化字段
- 每条 hypothesis 引用的 evidence/fact id
- 每条 hypothesis 的 `confidence`
- 系统接收的 hypothesis 数量
- 被校验丢弃的 hypothesis 数量和原因
- validation error code / summary
- 最终 run status

快照不得包含：

- provider 原始 response payload
- raw prompt
- 完整模型输入
- 完整原文
- provider secrets 或完整请求参数

规则：

- `output_snapshot_json` 用于审计、回放和问题定位。
- `output_snapshot_json` 不进入 provider-facing `InvestmentCausalHypothesis`。
- frontend 和 ops/status light 不暴露 `output_snapshot_json`。
- diagnostics 默认只暴露 accepted / dropped / invalid 的计数和错误摘要，不返回完整输出快照。

这样可以复盘“模型到底输出了什么、为什么被系统接收或丢弃”，同时避免把 provider 原始响应或完整模型材料暴露到默认用户界面和状态接口。

### TD-57 schema invalid 时保存最小输出快照

当模型输出 schema 不合法，无法构造完整结构化 `output_snapshot_json` 时，run 仍保存最小输出快照。

最小快照只包含：

- `parseStatus = "schema_invalid"`
- `errorCode`
- `validationSummary`
- `outputSizeBytes`
- model provider / model name
- prompt id/version
- input builder version
- 最终 run status

最小快照不得包含：

- 原始输出文本
- provider 原始 response payload
- raw prompt
- 完整模型输入
- 完整原文
- provider secrets 或完整请求参数

这样可以统计和定位 schema 失败，同时避免把不可控原始模型输出落库。

### TD-58 输出快照不参与输入校验和生成去重

`output_snapshot_json` 不参与 `input_checksum`，也不参与生成去重 key。

规则：

- `output_snapshot_json` 是结果和审计材料，不是模型输入条件。
- `input_checksum` 只由规范化模型输入、input builder version、prompt version 和 model name 派生。
- 生成去重 key 仍使用 `event_id + input_checksum + prompt_version + model_name`。
- 同一输入条件下，即使模型输出不同，也必须能识别为同一生成条件的重试、失败或回放问题。

这样可以避免“结果反过来改变输入身份”，保证去重、重试和回放语义稳定。

### TD-59 输入/输出快照只保存在 run 表

成功生成后，不把 `input_snapshot_json` 或 `output_snapshot_json` 复制到 `event_causal_hypotheses`。

规则：

- `event_causal_hypothesis_runs` 是输入/输出快照的唯一存储位置。
- `event_causal_hypotheses` 只保存原因假设本体、状态、排序所需字段和 `generation_run_id`。
- 审计、回放或 diagnostics 需要快照时，通过 `generation_run_id` 关联 run 记录。
- provider-facing contract、frontend 和 ops/status light 仍不暴露完整快照。

这样可以避免重复存储、active 切换时审计材料散落，以及后续清理或脱敏困难。

### TD-60 第一版不自动清理输入/输出快照

第一版不自动清理 `input_snapshot_json` 或 `output_snapshot_json`，也不做压缩归档。

规则：

- 不按时间自动删除快照。
- 不在生成成功后压缩归档快照。
- 不在 active 切换或 run 完成后迁移快照。
- 后续可以增加按保留期清理、脱敏迁移、归档或压缩策略。

理由：

- 上线初期审计、调试和回放价值最高。
- 自动清理过早会破坏问题定位。
- 快照已经是规范化、限量、脱敏后的内部审计材料。

这样第一版优先保证可追溯性，把存储治理作为后续运维策略扩展。

### TD-61 输入/输出快照设置大小上限

输入/输出快照必须设置 JSON 序列化后的 UTF-8 字节上限：

- `input_snapshot_json` 最大 64KB。
- `output_snapshot_json` 最大 32KB。

超限规则：

- 不保存超大文本字段。
- 不把原始大字段截断后继续塞进快照。
- 保留审计骨架。
- 丢弃低优先级摘要字段。
- 记录 `truncated = true`、`originalSizeBytes`、`storedSizeBytes` 和 `truncatedFields`。

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

这样可以保留审计骨架，同时防止异常 evidence 摘要或模型输出拖垮 SQLite 行大小、备份和 ops 查询。

### TD-62 快照截断不改变 run 结果状态

快照截断是审计材料降级，不是原因生成失败。

规则：

- 模型输出合法、引用有效、active 替换成功时，即使输入/输出快照发生截断，run 仍为 `succeeded`。
- 模型明确返回材料不足时，即使输入/输出快照发生截断，run 仍为 `unknown`。
- 截断信息写入 run `metadata_json` 和 diagnostics，字段建议为 `snapshotTruncated = true`。
- 截断信息也保留在对应快照的 `truncated` / `originalSizeBytes` / `storedSizeBytes` / `truncatedFields` 中。
- 只有连最小审计骨架都无法保存时，run 才标记为 `failed`。
- 最小审计骨架无法保存时，`errorCode = "causal_hypothesis_snapshot_too_large"`。

这样可以避免因为审计材料降级而误伤成功生成结果，同时保留真正存储异常的失败信号。

### TD-63 快照截断不影响 projection checksum

快照截断不影响 projection checksum，也不触发 projection stale。

规则：

- projection checksum 只反映 provider 会消费的当前 active 原因集合和事件级 `causalStatus`。
- `snapshotTruncated` 不进入 projection checksum。
- `truncatedFields`、`originalSizeBytes`、`storedSizeBytes` 不进入 projection checksum。
- `input_snapshot_json` 和 `output_snapshot_json` 不进入 projection checksum。
- 仅快照截断状态变化时，不触发 projection repair。

这样可以避免内部审计质量变化导致无意义 projection refresh。

### TD-64 完整快照只能通过本地脚本显式读取

HTTP `ops/status` 只承担运行健康和定位摘要职责，不承担完整快照查看职责。

规则：

- `ops/status` light 永不返回完整 `input_snapshot_json` 或 `output_snapshot_json`。
- `ops/status?diagnostics=1` 也不返回完整 `input_snapshot_json` 或 `output_snapshot_json`。
- diagnostics 模式可以返回 `generationRunId` / `runId`、`eventId`、`inputChecksum`、provider/model/prompt/input builder 版本、`snapshotTruncated`、`truncatedFields`、accepted/dropped/invalid 计数、`errorCode`、`validationSummary` 和少量 `eventId` 样例。
- 完整输入/输出快照只能通过本地内部脚本按 run id 读取，例如 `scripts/inspect-causal-hypothesis-run.ts --run-id <runId>`。
- 本地查看脚本默认只输出摘要。
- 本地查看脚本必须显式传 `--include-snapshots` 才能打印完整 `input_snapshot_json` / `output_snapshot_json`。
- 即使传 `--include-snapshots`，脚本也不得输出 provider secrets、raw prompt、provider 原始 request/response payload。

这样可以让 HTTP 运维接口保持安全、可扫读，同时保留本地审计和问题定位能力。

### TD-65 `--include-snapshots` 输出已存储的快照内容

本地运行记录查看脚本在传入 `--include-snapshots` 时，输出数据库中已经保存的 `input_snapshot_json` / `output_snapshot_json` 内容，不再对其中的普通文本字段额外隐藏。

规则：

- `--include-snapshots` 输出的是已存储的受控快照，不是 raw prompt、完整模型输入或 provider 原始载荷。
- 已存储快照已经由输入/输出快照构建逻辑完成限量、脱敏和字段边界控制。
- 查看脚本不再对快照内普通文本字段做第二层隐藏，否则本地审计、回放和问题定位看到的内容会偏离真实存储事实。
- provider secrets、raw prompt、provider 原始 request/response payload 始终不可输出，即使传 `--include-snapshots` 也不例外。

这样可以保证本地诊断看到的就是真实审计材料，同时不扩大敏感原始材料的暴露面。

### TD-66 完整快照打印必须精确到 run id

完整快照查看必须以 `runId` 精确定位，不允许用 `eventId` 隐式选择某一次生成记录来打印快照。

规则：

- `scripts/inspect-causal-hypothesis-run.ts --include-snapshots` 必须同时要求 `--run-id`。
- `--event-id --include-snapshots` 不得直接打印完整快照。
- `--event-id` 可以用于列出该事件下的 run 摘要和对应 `runId`。
- 通过 `--event-id` 列出的摘要可以包含 run status、时间、attempt、checksum、prompt/model/input builder 版本、`snapshotTruncated`、计数和错误摘要。
- 要打印完整 `input_snapshot_json` / `output_snapshot_json`，操作者必须从摘要中显式选择一个 `runId` 再执行查看。
- 当缺少 `--run-id` 且传入 `--include-snapshots` 时，脚本必须返回用法错误，不做任何快照输出。

这样可以避免同一事件多次生成、失败、unknown、重试或历史 active 混在一起时，脚本自动选错排查对象。

### TD-67 `--event-id` 默认列最近 20 条运行摘要

本地运行记录查看脚本使用 `--event-id` 时，只列出运行摘要，帮助操作者选择具体 `runId`。

规则：

- `--event-id` 默认按创建时间或开始时间倒序列最近 20 条 run。
- `--event-id` 支持 `--limit`，但最大不得超过 100。
- `--event-id` 支持 `--status pending|running|succeeded|unknown|failed` 过滤。
- 摘要字段固定为 `runId`、status、`triggerSource`、`triggerReason`、`retryOfRunId`、attempt、created/started/finished time、checksum、prompt/model/input builder 版本、`snapshotTruncated`、accepted/dropped/invalid 计数和错误摘要。
- `--event-id` 摘要列表不输出完整 `input_snapshot_json` / `output_snapshot_json`。
- `--event-id` 摘要列表不替代 diagnostics 或完整快照查看。

这样可以让操作者足够快地定位目标 run，同时避免把列表命令扩展成另一个完整诊断接口。

### TD-68 run 必须记录触发来源

每条 `event_causal_hypothesis_runs` 记录必须保存触发来源和触发原因。

规则：

- run 表增加 `trigger_source` 和 `trigger_reason`。
- `trigger_source` 是结构化来源，候选值包括 `auto_event_ingest`、`facts_updated`、`manual_backfill`、`manual_repair`、`retry`。
- `trigger_reason` 是内部可读原因摘要，用于说明为什么这次生成被创建。
- 新事件、facts/evidence 更新、手动补跑、手动修复和失败重试都必须写入明确触发来源。
- `trigger_source` / `trigger_reason` 只用于内部审计、diagnostics 和本地运行记录查看脚本摘要。
- `trigger_source` / `trigger_reason` 不进入 provider-facing contract、frontend 默认展示或 MCP public contract。

这样后续看到 failed、unknown 或 succeeded run 时，可以区分自动链路问题、手动任务问题和重试行为。

### TD-69 触发来源不参与输入校验和或生成去重

`trigger_source` / `trigger_reason` 是审计元数据，不是模型输入身份的一部分。

规则：

- `trigger_source` 不参与 `input_checksum`。
- `trigger_reason` 不参与 `input_checksum`。
- `trigger_source` / `trigger_reason` 不参与生成去重 key。
- 生成去重 key 仍为 `event_id + input_checksum + prompt_version + model_name`。
- 同一事件、同一规范化输入、同一 prompt、同一模型，不应因为自动触发、手动补跑或重试来源不同而产生重复 run。
- 未来如果需要对同 key 显式重跑，必须单独设计 `--force` 语义，不能通过改变触发来源绕过去重。

这样可以保持模型输入身份稳定，同时把审计来源和生成去重职责分开。

### TD-70 retry run 指向上一条失败 run

重试创建的新 run 必须表达“这是一次重试”，并能追溯它从哪条失败 run 延续而来。

规则：

- 重试创建的新 run 使用 `trigger_source = "retry"`。
- run 表增加 `retry_of_run_id`，指向触发这次重试的上一条失败 run。
- `retry_of_run_id` 只在 retry run 上有值，非 retry run 默认为空。
- `trigger_reason` 必须记录可读重试原因，例如 timeout、schema invalid、invalid references 或 provider error。
- 原始触发来源保留在被重试的历史 run 上；需要追溯时通过 `retry_of_run_id` 链接查看。
- `retry_of_run_id` 只用于内部审计、diagnostics 和本地运行记录查看脚本摘要。
- `retry_of_run_id` 不进入 provider-facing contract、frontend 默认展示或 MCP public contract。
- `retry_of_run_id` 不参与 `input_checksum` 或生成去重 key。

这样可以区分“第一次为什么生成”和“这一次为什么又生成”，避免把自动触发、手动补跑和失败重试混成同一个含义。

### TD-71 第一版手动 backfill / repair 不允许绕过去重

第一版手动 backfill / repair 必须尊重生成去重规则，不能强制对同 key 再生成一次。

规则：

- `scripts/backfill-causal-hypotheses.ts` 第一版不提供 `--force`。
- manual backfill / repair 仍通过同一个 causal service 入口排队，必须执行 `event_id + input_checksum + prompt_version + model_name` 去重。
- 同 key 已有 `pending` / `running` / `succeeded` / `unknown` run 时，manual backfill / repair 必须跳过。
- manual backfill / repair 不能通过改变 `trigger_source` / `trigger_reason` 绕过去重。
- manual backfill / repair 不能通过改变 `retry_of_run_id` 绕过去重。
- 未来如果确实需要同 key 强制重跑，必须单独设计 `--force`。
- 未来 `--force` 必须记录 `force_reason` 和操作者来源，并单独说明它与 active 替换、projection refresh、审计和风险控制的关系。

这样第一版先保持生成身份稳定，避免手动任务制造多条同输入 run 后无法解释。

### TD-72 去重跳过不写 skipped run

manual backfill / repair 因生成去重被跳过时，不向 `event_causal_hypothesis_runs` 写入 `skipped` run。

规则：

- `event_causal_hypothesis_runs` 只记录真实生成任务或真实生成尝试。
- 去重跳过不是生成任务，不新增 run 记录。
- 不新增 `skipped` run status。
- manual backfill / repair 脚本执行结果必须返回 skipped count。
- 每条 skipped 结果必须包含 skip reason 和 existing runId。
- skip reason 至少区分同 key 已有 `pending`、`running`、`succeeded` 或 `unknown` run。
- 如果未来需要审计“谁发起过一次手动命令”，必须单独设计 operation log，不把命令请求日志混进 generation run 表。

这样可以保持 run 表语义干净：它记录生成生命周期，不记录所有人为命令请求。

### TD-73 全部去重跳过时脚本退出码为 0

manual backfill / repair 全部因为去重被跳过时，脚本退出码仍为 0。

规则：

- 全部 skipped 是正常业务结果，不是脚本失败。
- 脚本退出码为 0。
- 脚本必须在 stdout 或 `--json` 输出 queued / skipped / failed counts。
- skipped 明细必须包含 skip reason 和 existing runId。
- 在 `failedCount = 0` 时，参数错误、数据库错误、配置错误或运行时异常使用非 0 退出码。
- “没有新任务需要做”不得被自动化调度误报成失败。

这样可以让 cron、launchd 或其他自动化调用稳定区分“无新任务”和“脚本真的失败”。

### TD-74 手动脚本必须提供稳定 --json 输出契约

manual backfill / repair 脚本必须提供稳定的 `--json` 输出结构，不能只依赖给人阅读的文本摘要。

规则：

- 默认输出可以是人读摘要。
- `--json` 输出是内部自动化契约，必须稳定且有测试覆盖。
- JSON 顶层字段至少包含 `schemaVersion`、`mode`、`exitCode`、`durationMs`、`dryRun`、`execute`、`requested`。
- `schemaVersion` 第一版固定为整数 `1`。
- `scripts/backfill-causal-hypotheses.ts --json` 的 `mode` 固定为 `causal_hypothesis_backfill`。
- `exitCode` 必须是整数，并与进程实际退出码一致。
- `durationMs` 必须是非负整数毫秒。
- `requested` 只保存规范化后的安全请求字段。
- 真实执行结果字段至少包含 `queuedCount`、`skippedCount`、`failedCount`、`queuedRunIds`、`skipped`、`errors`。
- `skipped[]` 每项至少包含 `eventId`、`inputChecksum`、`existingRunId`、`skipReason`、`status`。
- `errors[]` 每项至少包含固定 `target` 对象、固定 `errorCode`、固定 `phase`、`retryable` 和 `message`。
- `--json` 不输出完整输入/输出快照、raw prompt、provider 原始 payload 或 secrets。

这样自动化调用可以稳定判断是否有新任务、哪些事件被去重跳过、哪些事件失败，同时不把 operation log 或敏感审计材料混进 stdout。

### TD-75 dry-run JSON 必须区分预估结果和真实执行结果

`scripts/backfill-causal-hypotheses.ts --json` 在 dry-run 模式下，不能用 `queuedCount`、`skippedCount`、`failedCount`、`queuedRunIds` 或 `skipped[]` 表示“如果执行将会发生什么”。

规则：

- dry-run JSON 必须设置 `dryRun = true` 和 `execute = false`。
- dry-run JSON 使用预估字段：`candidateCount`、`wouldQueueCount`、`wouldSkipCount`、`wouldFailCount`、`wouldQueueEventIds`、`wouldSkip`、`wouldErrors`、`executionBlocked`。
- `wouldSkip[]` 每项至少包含 `eventId`、`inputChecksum`、`existingRunId`、`skipReason`、`status`。
- 真实 `--execute` JSON 才使用 `queuedCount`、`skippedCount`、`failedCount`、`queuedRunIds`、`skipped`、`errors`。
- dry-run 不创建 run，不写入数据库，不刷新 projection。
- 参数错误、数据库错误、配置错误或运行时异常仍按错误处理，不伪装成 `wouldFailCount`。

这样自动化可以稳定区分“预览会发生什么”和“已经实际排队/跳过/失败了什么”。

### TD-76 批量 backfill 默认不包含 noise

批量 backfill 默认候选范围只包含后端 `actionBucket = "actionable"` 或 `actionBucket = "watch"` 的事件，不把 `noise` 扫进去。

规则：

- 批量 backfill 默认只选 `actionable` / `watch`。
- `noise` 事件只能通过精确 `--event-id` 或显式 `--include-noise` 进入。
- `--include-noise` 只影响候选范围，不绕过去重、质量门禁、`--limit`、`--concurrency` 和 run 记录。
- dry-run JSON 必须能反映 `noise` 事件是被策略跳过，还是因为 `--event-id` / `--include-noise` 被纳入候选。
- frontend 打开详情页仍不能触发 `noise` 原因生成。

这样批量任务默认服务投资优先级和模型预算，但保留精确排查低优先级事件的能力。

### TD-77 批量 backfill 默认复用后端投资排序

批量 backfill 默认排序复用现有后端投资排序信号，不新增一套“原因生成优先级”。

规则：

- 默认 bucket 顺序为 `actionable`、`watch`、`noise`。
- `noise` 只有在 `--include-noise` 时才进入批量候选，并且排在最后。
- 同一 bucket 内按投资分数降序排序：`materialityScore * 0.4 + tradabilityScore * 0.35 + authorityScore * 0.25`。
- 投资分数相同时，按 `latestLifecycleAt` / `publishedAt` / `ingestedAt` 的可用时间倒序。
- 时间仍相同时，按 `eventId` 升序稳定排序。
- 精确 `--event-id` 不走批量候选排序；如果支持多个 `--event-id`，按用户请求顺序或脚本定义的稳定顺序处理。

这样原因生成补跑和投资者视图使用同一套后端优先级，避免出现“列表认为高优先级，但补跑脚本先处理另一批事件”的分裂。

### TD-78 --limit 在候选过滤和完整排序之后截断

批量 backfill 的 `--limit` 必须在候选过滤和完整排序之后再应用。

规则：

- 先应用候选过滤，包括 `actionable` / `watch` 默认范围、`--include-noise`、优先级过滤和其他筛选条件。
- 再应用 TD-77 定义的完整排序。
- 最后应用 `--limit` 截断候选列表。
- `--limit 100` 表示“排序后投资优先级最高的 100 条候选”，不是“先按时间取最近 100 条再排序”。
- dry-run JSON 的 `wouldQueueEventIds` / `wouldSkip` 必须反映排序后截断的最终候选顺序。
- 实现可以用索引和分页优化，但不能改变对外语义。

这样脚本的批量补跑行为与投资优先级一致，避免高价值旧事件被“最近事件先截断”挤出。

### TD-79 --limit 限制候选数量而不是新排队数量

批量 backfill 的 `--limit` 限制排序后要检查的候选数量，不限制最终成功新排队的 run 数量。

规则：

- 先按 TD-78 得到排序后截断的候选列表。
- 然后对这批候选逐条执行去重、配置检查、质量门禁和排队。
- 如果候选中很多因为已有 `pending` / `running` / `succeeded` / `unknown` run 被跳过，`queuedCount` 可以小于 `--limit`。
- 脚本不得为了凑满 `--limit` 个新 run 继续向后扫描更多候选。
- dry-run JSON 的 `requested.limit`、`wouldQueueCount`、`wouldSkipCount` 和 `wouldQueueEventIds` 必须体现这个候选边界。
- 未来如果需要“尽量排满 N 个新 run”，必须单独设计 `--target-queued`，不能改变 `--limit` 语义。

这样 `--limit` 是运维安全边界，而不是排队目标，dry-run 和 execute 的行为也更容易预测。

### TD-80 手动 execute 缺配置时预检失败且不写 run

manual backfill / repair 遇到原因生成器未启用或缺少必要配置时，dry-run 可以成功返回候选和配置阻塞信息，但真实 `--execute` 必须在写入任何 run 前失败。

规则：

- dry-run 可以成功退出，输出候选范围、排序、去重预估和配置阻塞提示。
- dry-run JSON 必须在 `wouldErrors` 或等价结构化字段中表达执行会因配置错误失败。
- 真实 `--execute` 必须先做原因生成器配置预检。
- 配置未启用或缺少必要配置时，`--execute` 退出码非 0，错误类型为配置错误。
- 这种失败不创建 `pending` run。
- 这种失败不写 `failed` run。
- 这种失败不刷新 projection。
- 错误输出可以包含缺失配置项名称、profile id、prompt id/version，但不得包含 secrets。

这样 dry-run 仍可用于排查候选范围，而 execute 不会制造一批明知无法执行的队列任务或失败 run。

### TD-81 execute 有候选失败时退出码非 0 但不回滚已排队 run

manual backfill / repair 的 `--execute` 如果部分候选失败，脚本整体退出码为非 0，但已经成功排队的 run 不回滚。

规则：

- `failedCount > 0` 时，脚本退出码非 0。
- 已成功写入的 `pending` run 保持有效，不因为同批其他候选失败而回滚。
- `skipped` 不是失败，不计入 `failedCount`。
- `queuedRunIds` 必须列出已成功排队的 run。
- `skipped[]` 必须列出去重跳过或策略跳过的候选。
- `errors[]` 必须列出失败候选的固定 `target` 对象、固定 `errorCode`、固定 `phase`、`retryable` 和 `message`。
- 批量执行不是全有或全无事务；每个候选的排队结果独立记录。

这样运维自动化能通过非 0 退出码知道这次执行不完全成功，同时不会撤销已经合法排队的任务。

### TD-82 execute 单候选失败后继续处理后续候选

manual backfill / repair 的 `--execute` 遇到单个候选失败时，默认继续处理后续候选。

规则：

- 全局预检错误必须立即停止，包括参数错误、原因生成器配置错误、数据库不可用或基础运行环境不可用。
- 全局预检失败时，不写入任何 run。
- 单个候选处理失败时，记录到 `errors[]`，然后继续处理后续候选。
- 单个候选失败包括输入构建失败、去重检查失败、候选级排队写入失败或候选级数据不完整。
- 如果数据库进入无法可靠继续写入的全局错误状态，脚本应停止后续处理，而不是继续制造不可信结果。
- 执行结束后只要 `failedCount > 0`，退出码仍为非 0。
- 已成功排队的 run 不回滚，后续成功候选仍可继续排队。

这样一次批量任务能尽量推进可处理事件，同时通过非 0 退出码和 `errors[]` 明确暴露不完全成功。

### TD-83 errors[] 和 wouldErrors[] 使用固定 errorCode 和 phase 枚举

manual backfill / repair JSON 中的 `errors[]` 和 dry-run `wouldErrors[]` 必须使用同一套固定 `errorCode` 和固定 `phase`，不能把机器判断建立在自由文本上。

规则：

- `errorCode` 是固定枚举。
- `phase` 是固定枚举。
- 机器判断只能依赖 `errorCode`、`phase`、`target` 和 `retryable`。
- 自由文本只能放在 `message`，只供人读。
- `skipped` 和 `wouldSkip` 不是 error，不进入 `errors[]` 或 `wouldErrors[]`。
- 第一版 `errorCode` 枚举包括：
  - `invalid_arguments`
  - `generator_config_missing`
  - `database_unavailable`
  - `event_not_found`
  - `candidate_ineligible`
  - `input_build_failed`
  - `dedupe_check_failed`
  - `enqueue_failed`
  - `unexpected_candidate_error`
  - `unexpected_runtime_error`
- 第一版 `phase` 枚举包括：
  - `argument_parse`
  - `config_preflight`
  - `database_preflight`
  - `candidate_selection`
  - `input_build`
  - `dedupe_check`
  - `enqueue`
  - `candidate_processing`
  - `runtime`

这样内部自动化可以稳定判断错误类型、是否需要报警、是否可以重试，而不依赖中文或英文错误文案。

### TD-105 错误对象第一版只使用 message 作为人读文本字段

manual backfill / repair JSON 的错误对象第一版只使用 `message` 作为给人读的错误文本字段，不同时保留 `summary`。

规则：

- `errors[]` 和 `wouldErrors[]` 每项都必须包含 `message`。
- `message` 必须是简短、无敏感信息的人读说明。
- 自动化不得解析或依赖 `message`。
- 第一版错误对象不输出 `summary` 字段。
- 未来如果确实需要更详细的人读内容，必须作为兼容新增字段单独设计，不能改变 `message` 的机器边界。

这样错误对象沿用仓库现有 API 常见的 `message` 命名，同时避免和事件、事实、证据里的领域 `summary` 混淆。

### TD-106 错误对象 message 必须脱敏且不可承载原始异常

manual backfill / repair JSON 错误对象里的 `message` 必须是脚本生成的简短脱敏说明，不得直接放入原始异常文本或内部载荷。

规则：

- `message` 只用于人读说明，不用于机器判断。
- `message` 必须简短、无敏感信息。
- `message` 不得包含 raw exception。
- `message` 不得包含 SQL 语句、数据库驱动原始错误或堆栈信息。
- `message` 不得包含 provider 原始报错、provider 原始 request / response payload。
- `message` 不得包含 raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential 或完整配置。
- 机器判断仍只能依赖 `errorCode`、`phase`、`target` 和 `retryable`。
- 详细内部错误可以通过 stderr 或本地日志承载，但不得进入 JSON 机器契约。

这样 JSON 输出既能给操作者足够上下文，又不会把内部实现细节、供应商载荷或敏感材料固化成自动化协议。

### TD-107 stderr 和本地日志默认脱敏，debug 模式才允许更详细诊断

manual backfill / repair 的 stderr 和本地日志不是 JSON 机器契约，但也不能变成敏感材料泄露面。

规则：

- 默认 cron / launchd / 自动化日志必须输出脱敏错误。
- 默认日志应优先包含 `errorCode`、`phase`、`target`、`runId`、`eventId`、`candidateIndex` 或 correlation id 等定位信息。
- 默认日志不得输出 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload、secret、token、credential 或完整配置。
- 默认日志不得输出带参数值的完整 SQL。
- 默认日志不得输出完整堆栈。
- 显式本地 debug 模式可以输出更详细的 raw exception 和堆栈，用于开发定位。
- 显式本地 debug 模式仍不得输出 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload、secret、token、credential 或完整配置。
- provider 诊断默认只输出 provider 名称、model 名称、HTTP status、错误类型、request id 或脱敏后的错误摘要；不得输出原始 request / response payload。
- SQL 诊断默认只输出 query name、表名、错误类型或脱敏 SQL 摘要；不得输出完整参数值。

这样自动化日志能帮助定位问题，但长期保存的 cron / launchd 日志不会沉淀敏感输入、供应商载荷或完整内部配置。

### TD-108 debug 模式只能通过显式 --debug 开启

manual backfill / repair 第一版的 debug 模式只能通过命令行 `--debug` 显式开启，不支持通过环境变量开启。

规则：

- `--debug` 只影响 stderr 和本地日志的诊断详细程度。
- `--debug` 不影响 stdout JSON。
- `--debug` 不进入 `requested`。
- `--debug` 不改变候选选择、dry-run 预览、真实 execute 行为、去重行为、退出码或数据库写入。
- 不支持通过环境变量开启 debug 模式。
- 不得让 shell、cron、launchd 或长期进程环境变量隐式开启 debug 模式。
- 即使显式传 `--debug`，仍必须遵守 TD-107 的敏感信息边界。

这样本地开发者可以明确要求更详细诊断，同时避免环境变量被长期继承后让自动化日志意外变详细。

### TD-109 未知命令行参数必须严格失败

manual backfill / repair 第一版遇到未知命令行参数时必须严格失败，不得忽略未知参数，也不得继续执行半解析请求。

规则：

- 未知参数包括未定义参数、拼写错误参数和当前版本不支持的未来参数。
- 未知参数固定视为参数解析失败。
- 未知参数使用 `errorCode = "invalid_arguments"`。
- 未知参数使用 `phase = "argument_parse"`。
- 未知参数使用 `target.scope = "global"`。
- 未知参数错误 `retryable = false`。
- 参数解析失败时 `requested = null`。
- 参数解析失败时 `dryRun = false`、`execute = false`。
- 参数解析失败时退出码非 0。
- 如果脚本已经进入 `--json` 错误处理流程，stdout 仍必须输出唯一、完整、可解析 JSON。
- 未知参数错误固定进入 `errors[]`，不得进入 `wouldErrors[]`。
- 参数解析失败时不得输出 dry-run 预览字段。
- `message` 可以提示未知参数名称，但必须脱敏，并且不得回显完整原始命令行。

这样用户不会误以为拼错或尚未实现的参数已经生效，自动化也能稳定把这类问题识别为请求未成立。

### TD-110 `--event-id` 和 `--run-id` 是互斥定位模式

manual backfill / repair 第一版中，`--event-id` 和 `--run-id` 表示不同定位模式，不能在同一个请求里同时出现。

规则：

- `--event-id` 表示按 canonical event 精确定位。
- `--run-id` 表示按已有 generation run 精确定位。
- 二者同时出现时，不选择优先级，不做隐式覆盖。
- 二者同时出现固定视为参数解析失败。
- 参数解析失败发生在候选选择、input build、去重检查、配置预检和数据库写入之前。
- 参数解析失败使用 `errorCode = "invalid_arguments"`。
- 参数解析失败使用 `phase = "argument_parse"`。
- 参数解析失败使用 `target.scope = "global"`。
- 参数解析失败的 `retryable = false`。
- 参数解析失败时 `requested = null`。
- 参数解析失败时 `dryRun = false`、`execute = false`。
- 参数解析失败时退出码非 0。
- 如果脚本已经进入 `--json` 错误处理流程，stdout 仍必须输出唯一、完整、可解析 JSON。
- 互斥参数错误固定进入 `errors[]`，不得进入 `wouldErrors[]`。
- 参数解析失败时不得输出 dry-run 预览字段。
- `message` 可以说明 `eventId` 与 `runId` 互斥，但不得回显完整原始命令行。

这条决策只约束 `scripts/backfill-causal-hypotheses.ts` 的 backfill / repair 第一版。其他 inspect 类脚本如果未来允许组合定位，必须单独定义自己的参数契约。

### TD-111 `--include-noise` 不能替代批量 `--limit`

manual backfill / repair 第一版中，`--include-noise` 只扩大批量候选范围，不能替代批量安全边界。

规则：

- 没有精确定位参数时，请求属于批量模式。
- 精确定位参数包括 `--event-id` 和 `--run-id`。
- 批量模式必须显式提供 `--limit`。
- `--include-noise` 只表示把 `actionBucket = noise` 纳入候选范围。
- `--include-noise` 不提供候选数量上限。
- `--include-noise` 不得让脚本在缺少 `--limit` 时继续执行。
- `--include-noise` 不改变候选排序、去重、质量门禁、`--limit`、`--concurrency`、退出码或 run 记录规则。
- 缺少精确定位参数且缺少 `--limit` 时，固定视为参数解析失败。
- 参数解析失败使用 `errorCode = "invalid_arguments"`。
- 参数解析失败使用 `phase = "argument_parse"`。
- 参数解析失败使用 `target.scope = "global"`。
- 参数解析失败的 `retryable = false`。
- 参数解析失败时 `requested = null`。
- 参数解析失败时 `dryRun = false`、`execute = false`。
- 参数解析失败时退出码非 0。
- 如果脚本已经进入 `--json` 错误处理流程，stdout 仍必须输出唯一、完整、可解析 JSON。
- 该错误固定进入 `errors[]`，不得进入 `wouldErrors[]`。
- 参数解析失败时不得输出 dry-run 预览字段。

这样 `--limit` 保持运维安全边界语义，`--include-noise` 只表达候选范围变化，不会意外触发无限或过大的批量扫描。

### TD-112 `--limit` 必须是 1..100 的整数

manual backfill / repair 第一版中，只要请求传入 `--limit`，该值就必须是 `1..100` 的整数。

规则：

- `--limit` 的最小合法值为 `1`。
- `--limit` 的最大合法值为 `100`。
- `--limit` 必须是十进制整数。
- `--limit 0` 非法。
- 负数非法。
- 小数非法。
- 非数字非法。
- 超过 `100` 非法。
- 脚本不得把非法值自动修正为合法值。
- 脚本不得把超过 `100` 的值静默截断为 `100`。
- 脚本不得把小数取整、向上取整或向下取整。
- 非法 `--limit` 固定视为参数解析失败。
- 参数解析失败使用 `errorCode = "invalid_arguments"`。
- 参数解析失败使用 `phase = "argument_parse"`。
- 参数解析失败使用 `target.scope = "global"`。
- 参数解析失败的 `retryable = false`。
- 参数解析失败时 `requested = null`。
- 参数解析失败时 `dryRun = false`、`execute = false`。
- 参数解析失败时退出码非 0。
- 如果脚本已经进入 `--json` 错误处理流程，stdout 仍必须输出唯一、完整、可解析 JSON。
- 非法 `--limit` 错误固定进入 `errors[]`，不得进入 `wouldErrors[]`。
- 参数解析失败时不得输出 dry-run 预览字段。

这样操作者和自动化能准确知道请求没有成立，而不是误以为脚本处理了一个被静默修改过的候选范围。

### TD-113 重复命令行参数必须严格失败

manual backfill / repair 第一版中，当前版本已定义的每个命令行参数最多只能出现一次。重复传同一个参数必须严格失败，不能采用“最后一个生效”或“第一个生效”的隐式规则。

规则：

- 第一版不定义任何可重复参数。
- 带值参数重复出现时非法，例如 `--limit 10 --limit 20`。
- 带值参数即使重复同一个值也非法，例如 `--limit 10 --limit 10`。
- 定位参数重复出现时非法，例如 `--event-id A --event-id B`。
- 布尔开关重复出现时也非法，例如 `--include-noise --include-noise`。
- 重复参数时不得选择第一个值。
- 重复参数时不得选择最后一个值。
- 重复参数时不得合并多个值。
- 重复参数固定视为参数解析失败。
- 参数解析失败发生在候选选择、input build、去重检查、配置预检和数据库写入之前。
- 参数解析失败使用 `errorCode = "invalid_arguments"`。
- 参数解析失败使用 `phase = "argument_parse"`。
- 参数解析失败使用 `target.scope = "global"`。
- 参数解析失败的 `retryable = false`。
- 参数解析失败时 `requested = null`。
- 参数解析失败时 `dryRun = false`、`execute = false`。
- 参数解析失败时退出码非 0。
- 如果脚本已经进入 `--json` 错误处理流程，stdout 仍必须输出唯一、完整、可解析 JSON。
- 重复参数错误固定进入 `errors[]`，不得进入 `wouldErrors[]`。
- 参数解析失败时不得输出 dry-run 预览字段。
- `message` 可以提示重复的参数名称，但不得回显完整原始命令行。

这样自动化和审计不会被隐式覆盖规则误导，也避免同一个请求在不同参数解析库下出现不同行为。

### TD-114 `--execute` 和显式 `--dry-run` 互斥

manual backfill / repair 第一版默认是 dry-run / preview。默认 dry-run 不需要显式传 `--dry-run`；如果当前或未来版本提供显式 `--dry-run` 参数，它必须和 `--execute` 互斥。

规则：

- 不传 `--execute` 时，默认进入 dry-run / preview。
- 单独传显式 `--dry-run` 时，如脚本支持该参数，可表达显式预览意图。
- `--execute` 表示真实执行。
- `--execute` 和显式 `--dry-run` 同时出现时，不能选择优先级。
- `--execute` 和显式 `--dry-run` 同时出现时，不能让一个覆盖另一个。
- `--execute` 和显式 `--dry-run` 同时出现固定视为参数解析失败。
- 参数解析失败发生在候选选择、input build、去重检查、配置预检和数据库写入之前。
- 参数解析失败使用 `errorCode = "invalid_arguments"`。
- 参数解析失败使用 `phase = "argument_parse"`。
- 参数解析失败使用 `target.scope = "global"`。
- 参数解析失败的 `retryable = false`。
- 参数解析失败时 `requested = null`。
- 参数解析失败时 `dryRun = false`、`execute = false`。
- 参数解析失败时退出码非 0。
- 如果脚本已经进入 `--json` 错误处理流程，stdout 仍必须输出唯一、完整、可解析 JSON。
- 执行模式互斥错误固定进入 `errors[]`，不得进入 `wouldErrors[]`。
- 参数解析失败时不得输出 dry-run 预览字段。

这样真实执行和预览不会因为参数顺序或解析库规则产生歧义。

### TD-115 `--run-id` 指向 pending / running 时跳过而不是失败

manual backfill / repair 第一版中，`--run-id` 精确定位到已经处于 `pending` 或 `running` 的 generation run 时，不重复排队，也不把它当成错误。

规则：

- `--run-id` 指向 `pending` run 时，不创建新 run。
- `--run-id` 指向 `running` run 时，不创建新 run。
- 不重置已有 run 的 lease。
- 不重置已有 run 的 attempt。
- 不刷新 projection。
- 不调用模型生成器。
- 这不是参数错误。
- 这不是 `event_not_found`。
- 这不是 `candidate_ineligible`。
- 这不进入 `errors[]`。
- 这不进入 `wouldErrors[]`。
- 真实 `--execute` 时，输出 `queuedCount = 0`、`skippedCount = 1`、`failedCount = 0`。
- 真实 `--execute` 时，`queuedRunIds = []`。
- 真实 `--execute` 时，`skipped[]` 记录这次跳过。
- dry-run 时，输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 1`、`wouldFailCount = 0`。
- dry-run 时，`wouldQueueEventIds = []`。
- dry-run 时，`wouldSkip[]` 记录这次预计跳过。
- skipped / wouldSkip 明细必须包含 requested `runId`、可获得的 `eventId`、`inputChecksum`、`existingRunId`、`skipReason` 和 `status`。
- `existingRunId` 等于 requested `runId`。
- `status` 为 `pending` 或 `running`。
- `skipReason` 必须区分 `run_already_pending` 和 `run_already_running`。
- 没有其他错误时，退出码为 0。

这样 `pending` / `running` run 仍由已有队列与 lease 机制推进，manual repair/backfill 不会制造重复任务，也不会把正常的“已经在队列中”误报为失败。

### TD-116 `--run-id` 指向 succeeded / unknown 时跳过而不是失败

manual backfill / repair 第一版中，`--run-id` 精确定位到已经处于 `succeeded` 或 `unknown` 的 generation run 时，不重复排队，也不把它当成错误。

规则：

- `--run-id` 指向 `succeeded` run 时，不创建新 run。
- `--run-id` 指向 `unknown` run 时，不创建新 run。
- 不重算或替换 active 原因集合。
- 不刷新 projection。
- 不调用模型生成器。
- 这不是参数错误。
- 这不是 `event_not_found`。
- 这不是 `candidate_ineligible`。
- 这不进入 `errors[]`。
- 这不进入 `wouldErrors[]`。
- 真实 `--execute` 时，输出 `queuedCount = 0`、`skippedCount = 1`、`failedCount = 0`。
- 真实 `--execute` 时，`queuedRunIds = []`。
- 真实 `--execute` 时，`skipped[]` 记录这次跳过。
- dry-run 时，输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 1`、`wouldFailCount = 0`。
- dry-run 时，`wouldQueueEventIds = []`。
- dry-run 时，`wouldSkip[]` 记录这次预计跳过。
- skipped / wouldSkip 明细必须包含 requested `runId`、可获得的 `eventId`、`inputChecksum`、`existingRunId`、`skipReason` 和 `status`。
- `existingRunId` 等于 requested `runId`。
- `status` 为 `succeeded` 或 `unknown`。
- `skipReason` 必须区分 `run_already_succeeded` 和 `run_already_unknown`。
- 没有其他错误时，退出码为 0。

这样终态 run 的语义保持稳定：`succeeded` 代表已经生成并应用，`unknown` 代表已经分析但材料不足。第一版如需同 key 重跑，必须以后单独设计 `--force`，不能让普通 repair/backfill 隐式重跑。

### TD-117 `--run-id` 指向 failed 时创建 retry run

manual backfill / repair 第一版中，`--run-id` 精确定位到已经处于 `failed` 的 generation run 时，允许创建新的 retry run，但不得复活或修改原 failed run。

规则：

- `--run-id` 指向 `failed` run 时，原 run 保持 `failed`。
- 脚本不得把原 failed run 改回 `pending`。
- 脚本不得重置原 failed run 的 lease。
- 脚本不得重置原 failed run 的 attempt。
- 满足 retry 条件时，脚本创建新的 `pending` retry run。
- 新 retry run 必须写入 `retry_of_run_id = requested runId`。
- 新 retry run 必须写入 `trigger_source = "retry"`。
- 新 retry run 必须写入可读 `trigger_reason`。
- 新 retry run 使用同一生成去重 key：`eventId + inputChecksum + promptVersion + modelName`。
- 如果同 key 已有新的 `pending` / `running` / `succeeded` / `unknown` run，脚本跳过，不创建 retry run。
- 如果同 key retry backoff 尚未到期，脚本跳过，不创建 retry run。
- 如果同 key 已达到最大尝试次数，脚本跳过，不创建 retry run。
- 上述跳过不是参数错误。
- 上述跳过不进入 `errors[]`。
- 上述跳过不进入 `wouldErrors[]`。
- 真实 `--execute` 成功创建 retry run 时，输出 `queuedCount = 1`、`skippedCount = 0`、`failedCount = 0`。
- 真实 `--execute` 成功创建 retry run 时，`queuedRunIds = [newRunId]`。
- dry-run 预计会创建 retry run 时，输出 `candidateCount = 1`、`wouldQueueCount = 1`、`wouldSkipCount = 0`、`wouldFailCount = 0`。
- dry-run 预计会创建 retry run 时，`wouldQueueEventIds = [eventId]`。
- 因同 key 已有 `pending` / `running` / `succeeded` / `unknown` run 跳过时，`skipped[]` / `wouldSkip[]` 使用对应 `run_already_pending`、`run_already_running`、`run_already_succeeded` 或 `run_already_unknown`。
- 因 retry backoff 尚未到期跳过时，`skipReason = "retry_backoff_not_due"`。
- 因达到最大尝试次数跳过时，`skipReason = "retry_attempts_exhausted"`。
- skipped / wouldSkip 明细必须包含 requested `runId`、可获得的 `eventId`、`inputChecksum`、`existingRunId`、`skipReason` 和 `status`。
- 因同 key 已有其他 run 跳过时，`existingRunId` 指向阻止 retry 的那条 run。
- 因 retry backoff 尚未到期或达到最大尝试次数跳过时，`existingRunId` 等于 requested `runId`，`status = "failed"`。
- 成功创建 retry run 或按上述规则跳过时，没有其他错误则退出码为 0。

这样 `failed` 是唯一可由 `--run-id` 精确触发新排队的已存在 run 状态；但 retry 仍受队列幂等、退避和最大尝试次数保护，不会变成隐式 `--force`。

### TD-118 `--run-id` retry 复用原 failed run 输入

`--run-id <failedRunId>` 创建 retry run 时，模型输入必须复用原 failed run 的输入身份和已保存输入材料，不重新读取当前 canonical event 生成新输入。

规则：

- `--run-id <failedRunId>` 表示重试这一条失败 run。
- `--run-id <failedRunId>` 不表示按当前事件状态重新生成。
- retry run 必须复用原 failed run 的 `eventId`。
- retry run 必须复用原 failed run 的 `inputChecksum`。
- retry run 必须复用原 failed run 的 `inputBuilderVersion`。
- retry run 必须复用原 failed run 的 `promptVersion`。
- retry run 必须复用原 failed run 的 `modelProvider`。
- retry run 必须复用原 failed run 的 `modelName`。
- retry run 必须复用原 failed run 的可回放 `inputSnapshot`。
- retry run 可以有新的 `runId`、`createdAt`、`attemptNumber`、`trigger_source`、`trigger_reason` 和 `retry_of_run_id`。
- 脚本不得为了 retry 重新加载当前 canonical event detail 构造模型输入。
- 脚本不得因为当前 event facts / evidence 已变化而改变 retry run 的 `inputChecksum`。
- 如果操作者想基于当前 canonical event 重新生成，应使用 `--event-id`，不是 `--run-id`。
- 如果原 failed run 缺少可回放 `inputSnapshot`，或其输入材料不足以构造模型请求，则本候选失败。
- 缺少可回放输入时，不创建 retry run。
- 缺少可回放输入时，真实 `--execute` 写入 `errors[]`，`failedCount = 1`，退出码非 0。
- 缺少可回放输入时，真实 `--execute` 输出 `queuedCount = 0`、`skippedCount = 0`、`queuedRunIds = []`。
- 缺少可回放输入时，dry-run 写入 `wouldErrors[]`，`wouldFailCount = 1`。
- 缺少可回放输入时，dry-run 输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 0`、`wouldQueueEventIds = []`。
- 缺少可回放输入使用 `errorCode = "input_build_failed"`。
- 缺少可回放输入使用 `phase = "input_build"`。
- 缺少可回放输入使用 `target.scope = "run"`，并在可获得时带 `runId`、`eventId` 和 `inputChecksum`。
- 缺少可回放输入的 `retryable = false`。

这样 `--run-id` retry 是可审计的同输入重试；`--event-id` 才是“按当前事件状态重新构造输入”的修复入口。

### TD-119 `--event-id` 先构造当前输入，再决定是否进入 retry 链

`--event-id <eventId>` 表示基于当前 canonical event 状态重新构造模型输入。它不能因为历史上存在 failed run 就直接复用 failed run 的输入。

规则：

- `--event-id <eventId>` 必须先加载当前 canonical event detail。
- `--event-id <eventId>` 必须用当前 canonical event detail 构造当前模型输入。
- `--event-id <eventId>` 必须计算当前 `inputChecksum`。
- `--event-id <eventId>` 必须用当前 `eventId + inputChecksum + promptVersion + modelName` 计算去重 key。
- `--event-id <eventId>` 不复用历史 failed run 的 `inputSnapshot` 来构造当前输入。
- 如果当前 key 与某条 failed run 的 key 相同，且同 key 没有 `pending` / `running` / `succeeded` / `unknown` run，并且 retry backoff 和最大尝试次数允许，则创建 retry run。
- 该 retry run 必须写入 `retry_of_run_id`，指向被重试的 failed run。
- 该 retry run 必须写入 `trigger_source = "retry"`。
- 该 retry run 必须写入可读 `trigger_reason`。
- 该 retry run 的输入使用刚刚按当前 canonical event 构造出的输入；由于 key 相同，它应与被重试 failed run 的输入身份一致。
- 如果当前 key 与历史 failed run 的 key 不同，则创建普通 manual run。
- 普通 manual run 不写 `retry_of_run_id`。
- 普通 manual run 的 `trigger_source` 使用当前手动任务来源，例如 `manual_backfill` 或 `manual_repair`。
- 普通 manual run 使用当前输入的 `inputChecksum`、`inputBuilderVersion`、`promptVersion`、`modelProvider`、`modelName` 和 `inputSnapshot`。
- 如果当前 key 已有 `pending` / `running` / `succeeded` / `unknown` run，则按既有去重规则跳过，不创建 retry run 或普通 manual run。

这样 `--event-id` 保持“按当前事件状态修复”的含义；只有当前输入身份与 failed 历史一致时，才把新 run 接入 retry 链。

### TD-120 `--event-id` 命中多条 failed run 时选择最新失败

`--event-id <eventId>` 当前 key 命中多条 failed run 时，`retry_of_run_id` 必须指向同 key 最新一条 failed run。

规则：

- 只在当前 key 与 failed run key 相同的 failed run 中选择。
- 不跨 key 选择 failed run。
- 选择顺序第一优先级为 `attemptNumber` 降序。
- `attemptNumber` 相同时，按 `finishedAt` 降序。
- `finishedAt` 不存在或相同时，按 `createdAt` 降序。
- 仍然相同时，按 `runId` 降序稳定兜底。
- 新 retry run 的 `retry_of_run_id` 指向选中的 latest failed run。
- retry backoff 是否到期基于选中的 latest failed run 判断。
- 最大尝试次数是否耗尽基于选中的 latest failed run 判断。
- 如果 latest failed run 的 retry backoff 尚未到期，则跳过，不创建 retry run。
- 如果 latest failed run 已达到最大尝试次数，则跳过，不创建 retry run。
- 脚本不得选择更早的 failed run 来绕过 latest failed run 的 retry backoff。
- 脚本不得选择更早的 failed run 来绕过最大尝试次数。
- 因 retry backoff 尚未到期跳过时，`existingRunId` 指向选中的 latest failed run。
- 因达到最大尝试次数跳过时，`existingRunId` 指向选中的 latest failed run。

这样 retry 链始终沿着同 key 最新失败推进，避免同一个输入身份下出现多条并行、互相绕开的重试历史。

### TD-121 retry run 的 attemptNumber 从被重试 run 递增

新建 retry run 的 `attemptNumber` 必须基于被重试的 failed run 递增。

规则：

- 对 `--run-id <failedRunId>`，被重试的 failed run 就是 requested run。
- 对 `--event-id <eventId>`，被重试的 failed run 是 TD-120 选中的 latest failed run。
- 新 retry run 的 `attemptNumber = selectedFailedRun.attemptNumber + 1`。
- 脚本不得把 retry run 的 `attemptNumber` 重置为 1。
- 脚本不得让 retry run 沿用 selected failed run 的 `attemptNumber`。
- 脚本不得通过重新统计同 key 历史 run 数量来计算 `attemptNumber`。
- 脚本不得通过扫描同 key 最大历史 attempt 来覆盖 selected failed run 的递增规则。
- 最大尝试次数判断必须先基于 selected failed run 完成；如果 selected failed run 已达到最大尝试次数，则不创建 retry run。

这样 retry 链的 attempt 语义由明确的上一条 failed run 决定，避免历史数据修正、重复导入或并发失败记录改变重试次数口径。

### TD-122 retry backoff 只使用 selected failed run 的 nextAttemptAt

retry backoff 是否到期，必须只使用 selected failed run 上已经保存的 `nextAttemptAt`。

规则：

- 对 `--run-id <failedRunId>`，selected failed run 就是 requested failed run。
- 对 `--event-id <eventId>`，selected failed run 是 TD-120 选中的 latest failed run。
- 脚本不得用 `finishedAt + backoff` 重新计算到期时间。
- 脚本不得因为 retry 策略常量变化而重新解释历史 failed run 的到期时间。
- 最大尝试次数判断必须先执行；如果 selected failed run 已达到最大尝试次数，则按 `retry_attempts_exhausted` 跳过，不要求存在 `nextAttemptAt`。
- 终止性 provider 失败判断必须在 `nextAttemptAt` 必填判断前执行；如果 selected failed run 是明确终止失败，则按 `retry_terminal_failure` 跳过，不要求存在 `nextAttemptAt`。
- 如果 selected failed run 未达到最大尝试次数，且不是明确终止失败，则必须存在 `nextAttemptAt`。
- 如果 `nextAttemptAt > now`，脚本按 `retry_backoff_not_due` 跳过，不创建 retry run。
- 如果 `nextAttemptAt <= now`，retry backoff 允许继续，后续仍受同 key 去重、输入可回放、配置、数据库和排队规则约束。
- 因 backoff 未到期跳过时，`existingRunId = selectedFailedRun.runId`，`status = "failed"`，不写入 `errors[]` 或 `wouldErrors[]`，没有其他错误时退出码为 0。
- 因明确终止失败跳过时，`existingRunId = selectedFailedRun.runId`，`status = "failed"`，不写入 `errors[]` 或 `wouldErrors[]`，没有其他错误时退出码为 0。
- 如果未耗尽尝试次数、不是明确终止失败的 selected failed run 缺少 `nextAttemptAt`，这是候选级数据不完整失败，不是 skip。
- 缺少 `nextAttemptAt` 时不创建 retry run；真实 `--execute` 输出 `failedCount = 1`、`queuedCount = 0`、`skippedCount = 0`、`queuedRunIds = []`，写入 `errors[]` 并以非 0 退出。
- 缺少 `nextAttemptAt` 时 dry-run 输出 `candidateCount = 1`、`wouldQueueCount = 0`、`wouldSkipCount = 0`、`wouldFailCount = 1`、`wouldQueueEventIds = []`，写入 `wouldErrors[]`。
- 缺少 `nextAttemptAt` 的错误使用 `errorCode = "unexpected_candidate_error"`、`phase = "candidate_processing"`、`target.scope = "run"`，并在可获得时带 `runId`、`eventId` 和 `inputChecksum`；`retryable = false`。

这样 retry backoff 的时间语义由失败发生时保存的事实决定，避免未来修改退避策略后改变旧失败记录的重试资格。

### TD-123 新建 retry run 的 nextAttemptAt 写入创建时间

当 selected failed run 的 `nextAttemptAt <= now` 且其他 retry 条件都允许时，新建 `pending` retry run 的 `nextAttemptAt` 必须写入本次 run 的创建时间。

规则：

- 新 retry run 的 `nextAttemptAt` 使用插入该 run 时取得的 `now`。
- 新 retry run 的创建时间和 `nextAttemptAt` 必须使用同一个时钟源。
- 如果实现使用数据库时间写 run 创建时间，则 `nextAttemptAt` 也必须使用同一次数据库时间。
- 如果实现使用应用进程时间写 run 创建时间，则 `nextAttemptAt` 也必须使用同一个应用进程时间值。
- 新 retry run 的 `nextAttemptAt` 不继承 selected failed run 的旧 `nextAttemptAt`。
- 新 retry run 的 `nextAttemptAt` 不写未来退避时间。
- 新 retry run 的 `nextAttemptAt` 不预先计算“如果本次 retry 失败后的下一次退避时间”。
- 新 retry run 插入后必须立即满足 `pending` claim 条件中的 `nextAttemptAt <= now`。
- 如果新 retry run 后续失败，失败处理流程再基于这条 retry run 的失败时间和 attempt 计算并保存下一次 `nextAttemptAt`。

这样 retry backoff 只阻挡创建 retry run 之前的资格检查；一旦 retry run 被创建，它就是一个可立即领取的真实 pending 任务。

### TD-124 最大尝试次数为 4，三档退避分别对应三次 retry

第一版同一生成 key 的最大尝试次数为 4 次，语义是 1 次初始生成加 3 次 retry。

规则：

- 初始生成 run 的 `attemptNumber = 1`。
- 第一次 retry run 的 `attemptNumber = 2`。
- 第二次 retry run 的 `attemptNumber = 3`。
- 第三次 retry run 的 `attemptNumber = 4`。
- attempt 1 失败后，失败处理保存的 `nextAttemptAt = failedAt + 5 分钟`。
- attempt 2 失败后，失败处理保存的 `nextAttemptAt = failedAt + 30 分钟`。
- attempt 3 失败后，失败处理保存的 `nextAttemptAt = failedAt + 2 小时`。
- attempt 4 失败后，同 key 达到最大尝试次数，保持 `failed`，不再创建 retry run。
- 最大尝试次数判断使用 `selectedFailedRun.attemptNumber >= 4`。
- 当 `selectedFailedRun.attemptNumber >= 4` 时，`--run-id` 或 `--event-id` retry 都按 `retry_attempts_exhausted` 跳过。
- 达到最大尝试次数后的 `failed` 不阻塞事件入库，不清除已有 active 原因假设，默认只在 diagnostics 暴露。

这样三档 retry backoff 都有实际用途，也避免“最大 3 次”让 2 小时退避永远不可达。

### TD-125 达到最大尝试次数后的终止失败 run 写 nextAttemptAt = null

当 attempt 4 失败后，这条终止失败 run 的 `nextAttemptAt` 必须写为 `null`。

规则：

- 终止失败 run 指 `status = "failed"` 且 `attemptNumber >= 4` 的 run。
- 终止失败 run 没有下一次自动 retry 窗口。
- 终止失败 run 的 `nextAttemptAt = null`。
- failure handler 不得为 attempt 4 失败写未来退避时间。
- failure handler 不得保留这条 run 进入执行前的旧 `nextAttemptAt`。
- failure handler 不得把 `nextAttemptAt` 写成 `failedAt` 或当前时间。
- 是否 retry exhausted 由 `status = "failed"` 和 `attemptNumber >= 4` 判断，不依赖 `nextAttemptAt`。
- `--run-id` 或 `--event-id` 选中终止失败 run 时，按 `retry_attempts_exhausted` 跳过，不要求 `nextAttemptAt` 存在。
- 终止失败 run 的 `nextAttemptAt = null` 是正常终态，不进入 `errors[]` 或 `wouldErrors[]`。
- `attemptNumber < 4` 且不是明确终止失败的 failed run 缺少 `nextAttemptAt` 仍按 TD-122 的候选级数据不完整失败处理。

这样终止失败不会暴露一个虚假的“下一次可重试时间”，自动化也不会把 exhausted 状态误判成仍在等待 retry backoff。

### TD-126 retry backoff 的 failedAt 使用失败实际生效时间

计算 retry backoff 时，`failedAt` 表示失败实际生效时间，不表示后台任务发现失败的时间。

规则：

- `failedAt` 是失败处理中的计算值，不要求新增持久字段。
- failed run 的 `finishedAt` 必须写入本次 `failedAt`。
- 可重试的 `attemptNumber < 4` 失败时，`nextAttemptAt` 必须按 `failedAt + backoff` 计算。
- 明确终止失败例外：它写 `finishedAt = failedAt`，但 `nextAttemptAt = null`，即使 `attemptNumber < 4`。
- 普通模型失败、provider 错误、模型调用超时、schema invalid、引用全 invalid 或快照过大等在 worker 正常处理路径中当场判定的失败，`failedAt = finishedAt = 失败落库时间`。
- worker lease 超时恢复时，`failedAt = finishedAt = leaseExpiresAt`。
- worker lease 超时恢复时，不得用扫描发现超时的时间、修复脚本运行时间或当前时间作为 `failedAt`。
- worker lease 超时被晚发现时，retry backoff 从 `leaseExpiresAt` 开始计算。
- 如果 `leaseExpiresAt + backoff <= now`，后续统一 retry 入队流程创建出的 retry run 可以立即进入可 claim 状态。
- attempt 4 失败时仍按同样规则写 `finishedAt = failedAt`，但 `nextAttemptAt = null`。
- 发现超时的时间可以进入 diagnostics 或 metadata，但不得参与 retry backoff 计算。

这样延迟扫描不会额外惩罚已经超时的 run，retry 时间线只由失败实际生效时间和已确认的 backoff 策略决定。

### TD-127 失败处理不立即创建 retry run

失败处理和 retry 入队是两个逻辑步骤。可重试的 `attemptNumber < 4` run 失败时，failure handler 只关闭当前 run，不立即创建下一条 `pending` retry run。

规则：

- 适用于普通 worker 失败、模型调用超时、schema invalid、引用全 invalid、快照过大和 worker lease 超时恢复。
- failure handler 只更新当前 run 为 `status = "failed"`。
- failure handler 必须写入 `finishedAt = failedAt`。
- 可重试失败时，failure handler 必须写入 `nextAttemptAt = failedAt + backoff`。
- 明确终止失败时，failure handler 必须写入 `nextAttemptAt = null`。
- failure handler 必须按既有 lease 设计释放或清理该 run 的执行锁字段。
- failure handler 可以写入错误码、诊断信息和最小输出快照。
- failure handler 不得插入新的 retry run。
- failure handler 不得创建带未来 `nextAttemptAt` 的 `pending` run。
- retry run 只能由统一 retry 入队流程创建。
- 统一 retry 入队流程只处理 `attemptNumber < 4`、`nextAttemptAt <= now`、不是明确终止失败、同 key 没有 `pending` / `running` / `succeeded` / `unknown` 且通过输入材料和配置 gate 的 failed run。
- 统一 retry 入队流程创建的新 run 必须继续遵守 TD-121 的 attempt 递增和 TD-123 的 `nextAttemptAt` 创建时间规则。
- 统一 retry 入队流程创建的新 run 必须写入 `trigger_source = "retry"`、`retry_of_run_id` 和可读 `trigger_reason`。
- worker lease 超时被晚发现且 `nextAttemptAt <= now` 时，可以在同一次 scheduler tick 或安全事务中继续调用统一 retry 入队流程。
- 即使在同一次 scheduler tick 中完成，也必须先持久化旧 run 的失败事实，再执行 due retry 入队检查。

这样失败处理只记录已经发生的事实，retry 入队只在 run 真正可立即 claim 时发生，避免系统里出现未来才可领取的 `pending` retry run。

### TD-128 统一 retry 入队由现有调度轮次触发

统一 retry 入队流程由现有原因生成 worker / scheduler 调度轮次触发，不新增独立 daemon、独立 queue table 或第二套状态机。

规则：

- 自动原因生成调度轮次负责触发统一 retry 入队流程。
- 每个自动调度轮次必须先恢复过期 `running` run。
- 过期 `running` run 恢复时按 TD-126 / TD-127 标记为 `failed` 并保存 `nextAttemptAt`。
- 恢复过期 `running` run 后，调度轮次再扫描 due failed runs。
- due failed run 指 `attemptNumber < 4` 且 `nextAttemptAt <= now` 的 failed run。
- due failed run 仍必须通过同 key 去重、输入材料、配置和数据库写入 gate。
- 通过 gate 后，统一 retry 入队流程创建新的 `pending` retry run。
- 创建 due retry run 后，调度轮次再 claim 可执行的 `pending` run。
- 因此自动调度轮次顺序固定为：恢复超时 `running` -> 入队 due retry -> claim pending。
- 手动 backfill / repair 不实现另一套 retry 规则。
- `--run-id` 或 `--event-id` 命中 due failed run 时，手动 backfill / repair 调用同一套 retry 入队服务路径。
- 自动重试、手动修复和超时恢复共享同一组 retry gate、attempt 递增、去重和 `nextAttemptAt` 规则。

这样 retry 仍属于 run 表持久队列的一部分，不会出现一个后台调度器和一套手动脚本各自解释 retry 条件的分叉。

### TD-129 自动 due retry 每轮最多创建 1 条

第一版自动调度轮次中，如果有多条 due failed run，每轮最多成功创建 1 条 due retry run。

规则：

- 自动调度轮次每轮最多成功创建 1 条 due retry run。
- 这个上限只约束自动调度轮次。
- 手动 backfill / repair 不继承自动调度每轮 1 条的上限。
- 自动 due retry 候选排序复用后端投资优先级。
- 同一投资优先级下，按 `nextAttemptAt` 最早优先。
- `nextAttemptAt` 相同时，按 `createdAt` 最早优先。
- `createdAt` 仍相同时，用 `runId` 做稳定兜底。
- 手动 `--run-id` 继续按指定 run 精确处理。
- 手动 `--event-id` 继续按指定 event 精确处理。
- 手动批量模式继续按 `--limit`、候选排序、去重、backoff、最大尝试次数、配置和输入材料 gate 处理。
- 手动 backfill / repair 仍受自己的并发规则约束。

这样自动 retry 入队和第一版单并发 worker 保持一致，不会在一次调度轮次里批量制造 retry 队列；手动修复仍保留面向运维的精确控制能力。

### TD-130 本轮创建的 due retry 可以本轮 claim

自动调度轮次创建出的 due retry run，允许在同一个调度轮次的 pending claim 阶段被领取执行。

规则：

- 自动调度轮次先入队 due retry，再 claim pending。
- 新建 due retry run 的 `nextAttemptAt` 等于创建时间。
- 新建 due retry run 插入后立即满足 `nextAttemptAt <= now` 的 claim 条件。
- 自动调度不得强制新建 due retry run 等到下一轮才可 claim。
- 新建 due retry run 不获得特殊优先级。
- 新建 due retry run 进入普通 pending claim 查询。
- 是否在本轮被 claim，取决于本轮剩余 claim 容量和既有 pending claim 排序。
- 本轮没有 claim 容量时，新建 due retry run 保留为 `pending`。
- 本轮有 claim 容量但未被排序选中时，新建 due retry run 也保留为 `pending`。

这样 TD-128 的调度顺序和 TD-123 的立即可 claim 语义保持一致，同时不会让 retry run 绕过普通 pending 队列规则。

### TD-131 pending claim 使用统一稳定排序

普通 pending claim 的排序必须固定为完整稳定规则，并适用于初始自动 run、manual run 和 retry run。

规则：

- eligible pending run 指 `status = "pending"` 且 `nextAttemptAt <= now` 的 run。
- pending claim 查询先按后端投资优先级排序。
- 同一投资优先级下，按 `nextAttemptAt` 最早优先。
- `nextAttemptAt` 相同时，按 `createdAt` 最早优先。
- `createdAt` 仍相同时，用 `runId` 做稳定兜底。
- 该排序适用于初始自动 run。
- 该排序适用于 manual run。
- 该排序适用于 retry run。
- `trigger_source` 不改变 claim 排序。
- `trigger_reason` 不改变 claim 排序。
- `retry_of_run_id` 不改变 claim 排序。
- manual run 不因为手动来源获得插队权。
- retry run 不因为 retry 来源获得插队权。

这样本轮新创建的 retry run 可以立即参与 claim，但不能绕过已有 pending run；普通队列语义只由投资优先级、可领取时间和稳定兜底决定。

### TD-132 pending claim 必须数据库原子领取

pending claim 必须是数据库原子领取，不能依赖默认单并发、进程内锁或“理论上只有一个 worker”保证正确性。

规则：

- worker 先按 TD-131 的稳定排序选择 eligible pending run。
- claim 必须通过数据库条件更新完成。
- 条件更新必须限定目标 `runId`。
- 条件更新必须限定 `status = "pending"`。
- 条件更新必须限定 `nextAttemptAt <= now`。
- claim 成功时，更新 `status = "running"`。
- claim 成功时，写入 `lockedAt`。
- claim 成功时，写入 `lockOwner`。
- claim 成功时，写入 `leaseExpiresAt`。
- `lockedAt` 和 `leaseExpiresAt` 必须基于同一次 claim 时间计算。
- 只有数据库更新影响行数为 1，才算 claim 成功。
- 更新影响行数为 0 时，表示该 run 已被其他 worker 抢先领取、状态变化或不再到期。
- 更新影响行数为 0 不是技术失败，不写 run 错误。
- 更新影响行数为 0 时，当前 worker 可以重新查询下一条候选，或结束本轮 claim。
- 数据库异常才按运行时错误处理。

这样第一版即使默认单并发，也不会把正确性建立在内存状态上；未来多个 worker、重复调度或手动脚本与自动 worker 同时运行时，同一个 run 也不会被两个执行者领取。

### TD-133 模型调用不放在 claim 数据库事务里

claim 成功后，模型调用不得放在同一个数据库事务里。

规则：

- 数据库事务只覆盖 TD-132 的 claim 状态切换。
- claim 成功并提交后，worker 才在事务外构造模型请求。
- 模型调用在数据库事务外执行。
- 模型输出校验在数据库事务外执行。
- 最终写入 `succeeded`、`unknown` 或 `failed` 结果时，再执行数据库条件更新。
- 结果写回条件必须限定 `runId`。
- 结果写回条件必须限定 `status = "running"`。
- 结果写回条件必须限定 `lockOwner`。
- 结果写回条件必须限定 `leaseExpiresAt > now`。
- 只有结果写回影响行数为 1，才算结果落库成功。
- 结果写回影响行数为 0 时，表示 worker 已失去 run 所有权、run 已被恢复流程改写或 lease 已过期。
- 结果写回影响行数为 0 时，不得覆盖后续状态。
- 结果写回影响行数为 0 时，不得替换 active 原因假设。
- 数据库异常才按写回失败处理。

这样长模型调用不会占住数据库事务，也不会让过期 worker 或失去 lease 的 worker 覆盖后续有效结果。

### TD-134 失去所有权的 worker 不再改写 run

当最终结果写回影响行数为 0 且原因为 `status`、`lockOwner` 或 `leaseExpiresAt` 条件不再成立时，当前 worker 已经失去该 run 的所有权，不得再改写该 run。

规则：

- 当前 worker 不得把该 run 标记为 `failed`。
- 当前 worker 不得写入 `finishedAt`、`nextAttemptAt`、错误码、输出快照或 active 原因假设替换。
- 当前 worker 不得在过期写回路径创建 retry run 或触发 retry 入队。
- 当前 worker 可以写本地诊断日志，记录 `runId`、`lockOwner` 和写回冲突类型。
- 本地诊断日志不得包含 raw prompt、完整模型材料、provider 原始 payload 或 secrets。
- 如果 lease 已过期，后续由 scheduler 超时恢复流程按 TD-126 / TD-127 处理。
- 超时恢复使用 `leaseExpiresAt` 作为 `failedAt`，写入 `finishedAt = leaseExpiresAt`，再按已确认 backoff 保存 `nextAttemptAt`。
- 如果该 run 已被其他所有者推进，当前失效 worker 不做任何状态覆盖。
- 数据库异常不同于影响行数为 0；数据库异常仍按写回失败处理。

这样结果写回的所有权冲突不会变成第二个失败处理入口，也不会让失效 worker 重新打开或污染已经被恢复、重试或成功处理的 run。

### TD-135 第一版不支持 lease 续租

第一版原因生成不支持 lease 续租。

规则：

- claim 成功时一次性写入 `leaseExpiresAt = claimedAt + 120 秒`。
- worker 在模型调用、输出校验或结果写回前，不得延长 `leaseExpiresAt`。
- 第一版不实现心跳续租。
- 第一版不实现保活字段。
- 第一版不实现续租循环。
- 第一版不实现独立续租 API。
- 单次模型调用超时保持 45 秒，run lease 保持 120 秒。
- 45 秒调用超时和 120 秒 lease 之间的时间差是第一版的安全余量。
- 如果模型调用、输出校验或结果写回已经超过 lease，结果写回必须按 TD-133 / TD-134 处理为过期写回。
- 过期写回不得通过续租重新获得所有权。
- 后续失败事实、`nextAttemptAt` 和 retry 入队仍由 scheduler 超时恢复与统一 retry 入队流程处理。

这样第一版不会出现长时间 worker 通过续租无限占有 run 的情况；慢调用或异常卡住的 worker 最终只能失去所有权，再由既有超时恢复和 retry 机制接管。

### TD-136 模型调用超时必须主动取消 provider 请求

单次模型调用达到 45 秒超时时，worker 必须停止等待 provider 请求。

规则：

- worker 发起模型调用时必须使用本地 45 秒超时控制。
- provider SDK 支持 `AbortSignal` 或等价取消能力时，worker 必须在 45 秒超时时主动取消 provider 请求。
- provider SDK 不支持取消时，worker 仍必须在 45 秒超时时停止等待，并把当前 run 按本地模型调用超时处理。
- 模型调用超时的 run 内部错误码使用 `causal_hypothesis_model_timeout`。
- 模型调用超时只有在当前 worker 仍拥有 run 且 lease 未过期时，才能写入 `status = "failed"`、`finishedAt = failedAt = 失败落库时间`、timeout 错误和 `nextAttemptAt`。
- 模型调用超时写回仍必须使用 TD-133 的 `runId`、`status = "running"`、`lockOwner` 和 `leaseExpiresAt > now` 条件更新。
- 如果超时写回影响行数为 0，按 TD-134 处理；当前 worker 不得再写失败字段，也不得创建 retry。
- provider 在本地超时后才返回成功、unknown 或错误时，返回结果必须丢弃。
- 迟到 provider 结果不得写入 run，不得替换 active 原因假设，不得刷新 projection。
- 迟到 provider 结果只允许写脱敏本地诊断日志。
- 本地诊断日志不得包含 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload 或 secrets。
- provider promise 后续 resolve / reject 时必须被消费，不能形成未处理异常。

这样 45 秒超时成为本地确定边界，慢 provider 不会拖住 worker；同时所有数据库写回仍受 run 所有权和 lease 保护。

### TD-137 临时 provider 错误进入自动 retry

第一版把非本地 45 秒超时的临时 provider 错误作为可自动重试的技术失败处理。

临时 provider 错误包括：

- 网络连接失败。
- DNS / TLS / socket 等传输层失败。
- HTTP 429。
- HTTP 500-599。
- provider 明确返回的临时不可用。
- provider 明确返回的过载。
- provider 明确返回的限流。

规则：

- 临时 provider 错误的 run 内部错误码使用 `causal_hypothesis_provider_transient_error`。
- 临时 provider 错误只有在当前 worker 仍拥有 run 且 lease 未过期时，才能写入 `failed`。
- 临时 provider 错误写回必须使用 TD-133 的 `runId`、`status = "running"`、`lockOwner` 和 `leaseExpiresAt > now` 条件更新。
- 写回成功时，写入 `status = "failed"`。
- 写回成功时，写入 `finishedAt = failedAt = 失败落库时间`。
- 写回成功时，写入 `nextAttemptAt = failedAt + backoff`，attempt 4 仍按既有规则写 `nextAttemptAt = null`。
- 写回成功时，写入脱敏 provider 诊断信息。
- provider 诊断信息可以包含 provider 名称、model 名称、HTTP status、错误类型、request id 或脱敏错误摘要。
- provider 诊断信息不得包含 raw prompt、完整模型输入、完整模型输出、完整原文、provider 原始 request / response payload、secret、token、credential 或完整配置。
- 临时 provider 错误不替换 active 原因假设。
- 临时 provider 错误不刷新 projection。
- 临时 provider 错误不阻塞 canonical event 入库。
- 临时 provider 错误不立即创建 retry run；后续仍由统一 retry 入队流程在 `nextAttemptAt <= now` 后创建 retry run。
- 如果写回影响行数为 0，按 TD-134 处理；当前 worker 不得再写失败字段，也不得创建 retry。

配置错误、鉴权错误、模型不存在和请求非法不属于本决策；永久 provider 错误由 TD-138 定义，缺少本地配置仍按配置预检处理。

这样临时 provider 抖动会进入同一套 backoff / retry，不会污染投资者当前看到的 active 原因假设，也不会让失败重试绕过已确认的 run 所有权规则。

### TD-138 永久 provider 错误不进入自动 retry

第一版把永久 provider 错误作为终止性技术失败处理，不进入自动 retry。

永久 provider 错误包括：

- 鉴权失败。
- 权限不足。
- 模型不存在。
- 模型 id 或 provider 配置指向无效模型。
- provider 明确返回请求非法。
- provider 明确返回不支持的参数、格式或模型能力。
- provider 明确返回必须修改凭证、配置或请求后才可能成功。

规则：

- 永久 provider 错误的 run 内部错误码使用 `causal_hypothesis_provider_permanent_error`。
- 永久 provider 错误只有在当前 worker 仍拥有 run 且 lease 未过期时，才能写入 `failed`。
- 永久 provider 错误写回必须使用 TD-133 的 `runId`、`status = "running"`、`lockOwner` 和 `leaseExpiresAt > now` 条件更新。
- 写回成功时，写入 `status = "failed"`。
- 写回成功时，写入 `finishedAt = failedAt = 失败落库时间`。
- 写回成功时，写入 `nextAttemptAt = null`，即使 `attemptNumber < 4`。
- 写回成功时，写入脱敏 provider 诊断信息。
- 永久 provider 错误不替换 active 原因假设。
- 永久 provider 错误不刷新 projection。
- 永久 provider 错误不阻塞 canonical event 入库。
- 永久 provider 错误不立即创建 retry run。
- 永久 provider 错误不由统一 retry 入队流程自动创建 retry run。
- 如果写回影响行数为 0，按 TD-134 处理；当前 worker 不得再写失败字段，也不得创建 retry。
- 普通 `--run-id` / `--event-id` retry 选中 `causal_hypothesis_provider_permanent_error` failed run 时，按 `retry_terminal_failure` 跳过。
- 因 `retry_terminal_failure` 跳过时，`existingRunId = selectedFailedRun.runId`，`status = "failed"`，不写入 `errors[]` 或 `wouldErrors[]`，没有其他错误时退出码为 0。
- `attemptNumber < 4` 且 `nextAttemptAt = null` 不再一律表示数据损坏；如果错误码是明确终止失败，`nextAttemptAt = null` 是正常终止语义。
- 当前已定义的明确终止失败错误码为 `causal_hypothesis_provider_permanent_error`。
- 修复凭证、配置、模型 id 或请求结构后，如果要对同一 key 重新生成，需要未来单独设计强制修复入口；第一版普通 retry 不隐式重跑。

缺少原因生成器本地配置仍按既有配置预检规则处理：自动触发不写 `pending` run，手动 `--execute` 预检失败且不写 run。该路径不复用 `causal_hypothesis_provider_permanent_error`。

这样永久错误不会被无意义地自动重试，也不会把 `nextAttemptAt = null` 的正常终止语义误判成数据损坏。

### TD-139 修复永久 provider 错误后普通 retry 仍不自动重跑

修复凭证、权限、模型配置或请求结构后，第一版普通 retry 仍不得自动重跑已经终止的永久 provider 错误。

规则：

- 普通 `--run-id` retry 选中 `causal_hypothesis_provider_permanent_error` failed run 时，仍按 `retry_terminal_failure` 跳过。
- 普通 `--event-id` retry 命中同 key latest failed run 且该 run 是 `causal_hypothesis_provider_permanent_error` 时，仍按 `retry_terminal_failure` 跳过。
- 自动 due retry 入队流程不得因为当前配置已修复而重新纳入 `causal_hypothesis_provider_permanent_error` run。
- 手动批量 backfill / repair 不得因为当前配置已修复而自动重新排队 `causal_hypothesis_provider_permanent_error` run。
- 第一版不实现“检测配置已修复后重开终止失败”的后台逻辑。
- 第一版不通过比较 provider 配置版本、凭证状态或模型 id 变化来自动重启终止失败 run。
- 第一版不为永久 provider 错误提供隐式 force 行为。
- 修复后如果要重跑同一 key，必须未来单独设计显式强制修复入口。
- 未来显式强制修复入口不得复用普通 retry 语义。
- 未来显式强制修复入口必须定义目标范围、操作者来源、`force_reason`、active 替换、projection refresh、审计记录和风险控制。

这样永久失败的终止语义不会因为环境后来变好而被普通自动化静默改写；修复后重跑会成为一个显式、可审计的运维动作，而不是普通 retry 的副作用。

### TD-140 显式强制修复入口不进入第一版实现范围

第一版不实现修复永久 provider 错误后的显式强制修复入口。

规则：

- 第一版不新增 `--force`。
- 第一版不新增 `--force-terminal-failure` 或等价命令行参数。
- 第一版不新增专门用于重跑永久 provider 终止失败的脚本入口。
- 第一版不新增公开 provider API、frontend 按钮或 MCP public tool 来强制重跑永久 provider 终止失败。
- 第一版不新增后台自动修复任务来重跑永久 provider 终止失败。
- 第一版不为永久 provider 终止失败新增 `force_reason`、operator 或审批字段。
- 第一版只需要保证普通 retry、自动 due retry 和手动批量 backfill / repair 继续跳过永久 provider 终止失败。
- 已有“未来显式强制修复入口”的描述只作为未来设计约束，不是当前实现任务。
- 未来如果要实现该入口，必须另行形成产品定义、技术设计、测试计划和审计规则。

这样第一版不会把运维修复能力扩成新的控制面；当前实现只闭合永久失败的终止语义和普通 retry 的跳过语义。

### TD-141 永久 provider 错误进入 ops/status light 聚合摘要

第一版 ops/status light 必须暴露永久 provider 错误的聚合健康摘要，但不得暴露原始 provider 报错。

规则：

- light 状态展示 `permanentProviderErrorCount`。
- light 状态展示 `latestPermanentProviderErrorAt`。
- light 状态必须始终返回这两个字段。
- 没有永久 provider 错误时，`permanentProviderErrorCount = 0`。
- 没有永久 provider 错误时，`latestPermanentProviderErrorAt = null`。
- `permanentProviderErrorCount` 统计当前保留的 run 表全量可见历史中 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 failed run 数量，字段完整性缺失不影响计数。
- `latestPermanentProviderErrorAt` 使用这类 failed run 中已有持久化 `finishedAt` 的最大值。
- light 状态不得返回 provider 原始报错、原始 request / response payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential 或完整配置。
- light 状态不得返回 runId、eventId、inputChecksum 或 request id 列表；这些属于 diagnostics。
- diagnostics 模式必须返回 `permanentProviderErrorSamples` 数组，承载少量永久 provider 错误 run 样例。
- `permanentProviderErrorSamples[]` 的样例对象字段形状由 TD-146 定义。
- diagnostics 模式仍不得返回 provider 原始报错、原始 request / response payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential 或完整配置。
- `permanentProviderErrorCount` 进入运行健康摘要，不改变 provider-facing `causalStatus`。
- `permanentProviderErrorCount` 不替代 failure rate；failure rate 仍按既有规则统计已经尝试生成的 eligible runs。
- `permanentProviderErrorCount` 不进入 pending count、`notGeneratedCount` 或 `blockedByGeneratorConfigCount`。
- 缺少本地生成器配置仍由 `blockedByGeneratorConfigCount` / missing config 表达，不进入 `permanentProviderErrorCount`。

这样 ops/status 默认摘要能提示“存在需要配置/权限修复的终止性 provider 问题”，但不会把 provider 内部错误和敏感载荷暴露到轻量状态接口。

### TD-142 永久 provider 错误统计窗口使用当前保留 run 表全量可见历史

第一版 `permanentProviderErrorCount` 和 `latestPermanentProviderErrorAt` 不引入新的时间窗口配置。

规则：

- `permanentProviderErrorCount` 基于当前保留的 `event_causal_hypothesis_runs` 全量可见历史统计。
- `latestPermanentProviderErrorAt` 基于当前保留的 `event_causal_hypothesis_runs` 全量可见历史取已有持久化 `finishedAt` 的最大值。
- 统计过滤条件仍为 `status = "failed"` 且 `errorCode = "causal_hypothesis_provider_permanent_error"`。
- 第一版不新增 24 小时、7 天、30 天或其他 rolling window。
- 第一版不新增 `EVENT_ENGINE_CAUSAL_HYPOTHESIS_*_WINDOW` 或等价统计窗口配置。
- run 表未来如果执行保留期清理，清理后的 ops/status 统计自然反映“当前保留历史”，不承诺覆盖已被清理的历史 run。
- diagnostics 的样例数量可以限量，但样例限量不得影响 light 聚合计数和最新时间。
- diagnostics 样例字段完整性不得影响 `permanentProviderErrorCount`。
- 缺少持久化 `finishedAt` 的 run 不得为 `latestPermanentProviderErrorAt` 合成替代时间。
- `latestPermanentProviderErrorAt` 负责表达这类终止错误的新鲜度；调用方不得只用 count 判断问题是否仍然当前发生。
- 未来如果需要固定时间窗口，必须和 run 保留策略、ops/status schema 和告警语义一起重新设计。

这样第一版避免新增配置面和窗口口径争议，同时保留运维摘要对终止性 provider 问题的可见性。

### TD-143 永久 provider 错误聚合字段固定返回

第一版 ops/status light 的永久 provider 错误聚合字段必须保持稳定形状。

规则：

- `permanentProviderErrorCount` 必须始终存在。
- `latestPermanentProviderErrorAt` 必须始终存在。
- 没有永久 provider 错误时，`permanentProviderErrorCount = 0`。
- 没有永久 provider 错误时，`latestPermanentProviderErrorAt = null`。
- 有永久 provider 错误时，`permanentProviderErrorCount` 是大于 0 的整数。
- 有永久 provider 错误且至少一条匹配 run 有持久化 `finishedAt` 时，`latestPermanentProviderErrorAt` 是这些 `finishedAt` 的最大值。
- 有永久 provider 错误但所有匹配 run 都缺少持久化 `finishedAt` 时，`permanentProviderErrorCount > 0` 且 `latestPermanentProviderErrorAt = null`。
- 不得因为没有错误而省略这两个字段。
- 不得用缺省字段、空字符串、`undefined`、`false` 或 `0` 代替 `latestPermanentProviderErrorAt = null`。
- 不得要求调用方通过字段是否存在判断是否有永久 provider 错误。
- 调用方判断是否存在永久 provider 错误时，应先看 `permanentProviderErrorCount > 0`。

这样 ops/status light 的机器契约稳定，前端、脚本和下游自动化不需要为“字段不存在”和“确实没有错误”写两套解析逻辑。

### TD-144 diagnostics 固定返回永久 provider 错误样例数组

第一版 ops/status diagnostics 的永久 provider 错误 run 样例使用固定数组字段。

规则：

- diagnostics 模式必须始终返回 `permanentProviderErrorSamples`。
- `permanentProviderErrorSamples` 必须是数组。
- 没有永久 provider 错误样例时，`permanentProviderErrorSamples = []`。
- 不得因为没有样例而省略 `permanentProviderErrorSamples`。
- 不得用 `null`、空对象、`undefined` 或 `false` 代替空数组。
- `permanentProviderErrorSamples` 只在 diagnostics 模式返回。
- ops/status light 不得返回 `permanentProviderErrorSamples`。
- `permanentProviderErrorSamples[]` 只允许承载少量脱敏 run 级样例。
- 样例对象字段形状由 TD-146 定义。
- 样例不得包含 provider 原始报错、原始 request / response payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential 或完整配置。
- `permanentProviderErrorSamples` 不参与 `permanentProviderErrorCount` 或 `latestPermanentProviderErrorAt` 的计算。
- 样例限量不得影响 light 聚合计数和最新时间。
- 样例上限和排序由 TD-145 定义。

这样 diagnostics 的机器契约稳定，调用方能直接按数组处理样例，同时不会把 run 级定位信息泄漏到 light 状态。

### TD-145 永久 provider 错误 diagnostics 样例最多 10 条并按最新失败优先

第一版 `permanentProviderErrorSamples` 用于快速定位最近的永久 provider 错误，不作为完整 run 列表接口。

规则：

- `permanentProviderErrorSamples` 最多返回 10 条。
- 样例候选只包含 `status = "failed"` 且 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 run。
- 样例候选还必须满足 TD-156、TD-157 和 TD-158 的字段完整性要求。
- 样例先按 `finishedAt` 倒序排序。
- `finishedAt` 相同时，按 `runId` 升序稳定兜底。
- 样例数组必须在排序后再截断到 10 条。
- 样例上限只影响 diagnostics 样例数组，不影响 `permanentProviderErrorCount`。
- 样例上限只影响 diagnostics 样例数组，不影响 `latestPermanentProviderErrorAt`。
- `permanentProviderErrorSamples` 不提供分页、offset、cursor 或按事件筛选能力。
- 如果需要查看完整 run 历史，应使用本地运行记录查看脚本，而不是扩展 ops/status diagnostics。

这样 diagnostics 默认展示最近、最相关的终止性 provider 问题，同时避免把 ops/status 扩成 run 查询接口。

### TD-146 permanentProviderErrorSamples 样例字段形状固定

第一版 `permanentProviderErrorSamples[]` 的样例对象使用固定字段形状。

规则：

- 每个样例固定包含 `runId`。
- 每个样例固定包含 `eventId`。
- 每个样例固定包含 `finishedAt`。
- 每个样例固定包含 `provider`。
- 每个样例固定包含 `model`。
- 每个样例固定包含 `httpStatus`。
- 每个样例固定包含 `errorType`。
- 每个样例固定包含 `requestId`。
- 每个样例固定包含 `errorSummary`。
- `runId`、`eventId` 和 `finishedAt` 来自 run 记录，必须存在。
- `runId` 的来源边界由 TD-158 定义，只能来自样例对应 failed run 自身的主键。
- `eventId` 的来源边界由 TD-157 定义，只能来自同一 run 记录保存的 canonical event 绑定。
- `finishedAt` 的来源边界由 TD-156 定义，只能来自同一 run 记录的持久化完成时间。
- `runId`、`eventId`、`finishedAt` 和 `errorType` 来自 run 记录或后端归一化错误分类，必须存在。
- `provider`、`model`、`httpStatus`、`requestId` 和 `errorSummary` 缺失时，必须返回 `null`。
- `provider` 和 `model` 的来源边界由 TD-154 定义，只能来自本系统发起 run 时已知的调用上下文或配置元数据，长度上限由 TD-155 定义。
- `errorType` 的枚举边界由 TD-150 定义，必须使用第一版后端归一化枚举，不得返回 `null`。
- 不得因为某个 provider 诊断字段缺失而省略该字段。
- 不得用空字符串、`undefined`、`false`、空对象或缺省字段代替 `null`。
- `httpStatus` 的取值范围由 TD-151 定义，只能是真实 HTTP 状态码整数 `100..599` 或 `null`。
- `requestId` 的来源边界由 TD-152 定义，只能来自 provider 明确提供的 request id / correlation id 元数据或 `null`，长度上限由 TD-153 定义。
- `errorSummary` 只能是系统生成的脱敏短摘要或 `null`，生成边界由 TD-147 定义。
- 第一版不得在样例对象中加入 provider 原始报错、原始 request / response payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential、完整配置、stack trace 或 SQL。
- 第一版不得加入未定义的临时字段来承载 provider-specific payload。
- 未来如需新增样例字段，必须明确字段名、脱敏边界和是否可为 `null`。

这样 diagnostics 样例既方便机器稳定解析，又不会因为不同 provider 返回字段不同而产生多种对象形状。

### TD-147 errorSummary 不直接使用 provider message

第一版 `permanentProviderErrorSamples[].errorSummary` 必须由系统生成脱敏短摘要，不得直接透传、截断或轻度改写 provider message。

规则：

- `errorSummary` 只用于 diagnostics 的人读快速定位，不作为机器判断字段。
- 机器判断仍必须使用 `errorType`、`httpStatus`、`requestId`、`runId`、`eventId` 和固定错误码。
- `errorSummary` 必须由系统根据归一化后的错误类型、HTTP status、provider / model 标识和安全定位信息生成。
- `errorSummary` 可以使用受控模板或固定短语。
- `errorSummary` 不得直接复制 provider message。
- `errorSummary` 不得把 provider message 做简单截断后返回。
- `errorSummary` 不得把 provider message 做翻译、同义改写或轻度摘要后返回。
- 如果只能从 provider message 获得错误信息，系统必须先映射到粗粒度 `errorType` 或安全模板；无法安全映射时返回 `errorSummary = null`。
- `errorSummary` 不得包含 provider 原始报错、原始 request / response payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential、完整配置、stack trace 或 SQL。
- `errorSummary` 的长度上限由 TD-148 定义。

这样 diagnostics 可以给人一个可读提示，但不会把 provider 自由文本变成新的泄漏通道或不稳定契约。

### TD-148 errorSummary 第一版最多 200 个字符

第一版 `permanentProviderErrorSamples[].errorSummary` 的最终输出最多 200 个字符。

规则：

- `errorSummary = null` 不受长度限制。
- 长度上限只约束最终输出的 `errorSummary` 字段。
- 长度上限不约束 `provider`、`model`、`httpStatus`、`errorType`、`requestId`、`runId`、`eventId` 或 `finishedAt`。
- 200 个字符的计数单位由 TD-149 定义。
- 系统生成摘要后必须保证 `errorSummary` 不超过 200 个字符。
- 如果受控模板生成的摘要超过 200 个字符，系统必须选择更短的受控模板或移除非必要安全上下文。
- 不得通过截断 provider message 来满足 200 个字符上限。
- 不得通过复制 provider message 前 200 个字符、追加省略号或类似方式生成 `errorSummary`。
- 不得为了满足长度上限而保留不完整的 provider 原始错误片段。
- 如果系统无法生成安全且不超过 200 个字符的摘要，必须返回 `errorSummary = null`。
- 未来如需调整上限，必须作为 diagnostics schema 变更明确记录。

这样 `errorSummary` 既足够短，适合 ops/status diagnostics 快速扫描，也不会因为长度限制重新打开 provider message 透传通道。

### TD-149 errorSummary 长度按 Unicode code point 计数

第一版 `permanentProviderErrorSamples[].errorSummary` 的 200 字符上限按 Unicode code point 计数。

规则：

- 计数对象是最终输出的 `errorSummary` 字符串。
- `errorSummary = null` 不参与字符数计算。
- 200 个 Unicode code point 合法。
- 201 个 Unicode code point 不合法。
- 不得按 UTF-8 字节数计算。
- 不得按 JavaScript UTF-16 code unit 计算。
- 不得使用 JavaScript `string.length` 作为最终长度判定口径。
- 含有非 BMP 字符时，必须仍按 Unicode code point 计数。
- 如果按 Unicode code point 计数超过 200，必须按 TD-148 选择更短系统模板、移除非必要安全上下文或返回 `null`。
- 未来如果要改为其他计数单位，必须作为 diagnostics schema 变更明确记录。

这样中文、英文和非 BMP 字符使用同一套人读字符口径，避免同一摘要因为运行时字符串内部表示不同而出现不同的合规结果。

### TD-150 errorType 使用第一版归一化枚举

第一版 `permanentProviderErrorSamples[].errorType` 必须使用后端归一化枚举，禁止 provider-specific 自由字符串。

允许值：

- `authentication_failed`
- `permission_denied`
- `model_not_found`
- `provider_config_invalid`
- `invalid_request`
- `unsupported_request`
- `unknown_permanent_provider_error`

规则：

- 每个 `permanentProviderErrorSamples[]` 样例都必须包含 `errorType`。
- `errorType` 不得为 `null`。
- `errorType` 不得为空字符串。
- `errorType` 不得使用 provider 原始错误码。
- `errorType` 不得使用 provider 原始错误文本。
- `errorType` 不得使用 HTTP status 文本。
- `errorType` 不得使用 provider-specific 自由字符串。
- 鉴权失败、凭证无效、凭证过期或缺少 provider 鉴权材料时，使用 `authentication_failed`。
- provider 账号、project、organization、region 或模型访问权限不足时，使用 `permission_denied`。
- provider 明确表示模型不存在时，使用 `model_not_found`。
- provider profile、model id、provider/model 组合或 provider 侧配置指向无效目标时，使用 `provider_config_invalid`。
- provider 明确表示请求结构、必填字段、参数值或 payload 非法时，使用 `invalid_request`。
- provider 明确表示参数、格式、工具能力、输出格式或模型能力不支持时，使用 `unsupported_request`。
- 已经确定是永久 provider 错误，但无法安全归入上述枚举时，使用 `unknown_permanent_provider_error`。
- 缺少原因生成器本地配置仍按配置预检处理，不进入 `permanentProviderErrorSamples[]`，也不映射为 `provider_config_invalid`。
- `errorType` 是机器判断字段；`errorSummary` 只供人读快速定位。
- 如果未来需要暴露 provider 原始错误码，必须新增单独字段并重新定义脱敏边界，不能复用 `errorType`。

这样 diagnostics 的机器字段稳定，调用方不需要理解各个 provider 的原始错误码或自由文本。

### TD-151 httpStatus 只能是真实 HTTP 状态码

第一版 `permanentProviderErrorSamples[].httpStatus` 只能是真实 HTTP 状态码整数 `100..599` 或 `null`。

规则：

- `httpStatus` 必须始终存在。
- `httpStatus` 可以为 `null`。
- `httpStatus` 为数字时，必须是整数。
- `httpStatus` 为数字时，必须在 `100..599` 范围内。
- `100` 合法。
- `599` 合法。
- `99` 非法。
- `600` 非法。
- `0` 非法。
- 负数非法。
- 小数非法。
- 字符串状态码非法。
- SDK 自定义状态非法。
- provider 自定义错误码非法。
- 网络错误码、系统错误码、DNS / TLS / socket 错误码不得放入 `httpStatus`。
- provider 没有返回可确认的 HTTP response status 时，必须返回 `httpStatus = null`。
- provider SDK 只返回抽象错误 code 或 status 字段，且无法确认它是真实 HTTP response status 时，必须返回 `httpStatus = null`。
- 不得从 provider error message 中解析或猜测 `httpStatus`。
- 不得把 `errorType`、provider 原始错误码或本地错误码映射成 `httpStatus`。
- 真实 HTTP status 只用于 diagnostics 定位，不替代 `errorType`、固定错误码或 retry 语义。

这样 `httpStatus` 保持标准 HTTP 语义，不会混入 SDK、网络栈或 provider 自定义错误体系。

### TD-152 requestId 不从 provider message 解析

第一版 `permanentProviderErrorSamples[].requestId` 只能使用 provider SDK / response metadata 明确提供的 request id 或 correlation id。

规则：

- `requestId` 必须始终存在。
- `requestId` 可以为 `null`。
- provider SDK 明确提供 request id 字段时，可以使用。
- provider SDK 明确提供 correlation id 字段时，可以使用。
- provider response metadata 明确提供 request id 字段时，可以使用。
- provider response metadata 明确提供 correlation id 字段时，可以使用。
- provider response header 明确标注为 request id 或 correlation id 时，可以使用。
- `requestId` 作为 opaque string 使用，不解析、不改写语义。
- provider 没有明确提供 request id 或 correlation id 元数据时，必须返回 `requestId = null`。
- 不得从 provider message 中解析 `requestId`。
- 不得从 provider 原始报错文本中解析 `requestId`。
- 不得从 `errorSummary` 中解析 `requestId`。
- 不得从 stack trace、本地日志行或异常字符串中解析 `requestId`。
- 不得把 `runId`、`eventId`、`inputChecksum`、`httpStatus`、`errorType`、provider 原始错误码或本地错误码映射成 `requestId`。
- 不得为了填充字段而生成、拼接或伪造 provider `requestId`。
- 不得暴露完整 provider 原始 request / response payload 来承载 `requestId`。
- `requestId` 只用于 diagnostics 定位，不替代 `errorType`、固定错误码、retry 语义或本地 run 定位字段。

这样 `requestId` 保持 provider 显式定位标识语义，不把自由文本解析变成新的不稳定契约。

### TD-153 requestId 第一版最多 128 个 Unicode code point

第一版 `permanentProviderErrorSamples[].requestId` 最多 128 个 Unicode code point。

规则：

- `requestId = null` 不受长度限制。
- 长度上限只约束最终输出的 `requestId` 字段。
- 长度上限不约束 `provider`、`model`、`httpStatus`、`errorType`、`errorSummary`、`runId`、`eventId` 或 `finishedAt`。
- 128 个 Unicode code point 合法。
- 129 个 Unicode code point 不合法。
- 不得按 UTF-8 字节数计算。
- 不得按 JavaScript UTF-16 code unit 计算。
- 不得使用 JavaScript `string.length` 作为最终长度判定口径。
- 含有非 BMP 字符时，必须仍按 Unicode code point 计数。
- provider 明确提供的 request id 或 correlation id 超过 128 个 Unicode code point 时，必须返回 `requestId = null`。
- 不得裁剪 provider request id。
- 不得复制 provider request id 前 128 个字符。
- 不得追加省略号。
- 不得为了满足长度上限而保留不完整 provider request id 片段。
- 不得哈希、重编码或压缩 provider request id 来绕过长度上限。
- 未来如需调整上限，必须作为 diagnostics schema 变更明确记录。

这样 `requestId` 保持短、稳定、可扫描，同时避免 provider 返回异常长字符串进入 diagnostics 契约。

### TD-154 provider 和 model 不从 provider message 解析

第一版 `permanentProviderErrorSamples[].provider` 和 `permanentProviderErrorSamples[].model` 只能来自本系统发起该 run 时已知的调用上下文或配置元数据。

规则：

- `provider` 必须始终存在。
- `model` 必须始终存在。
- `provider` 可以为 `null`。
- `model` 可以为 `null`。
- `provider` 可以来自 run 记录中保存的 provider 标识。
- `model` 可以来自 run 记录中保存的 model 标识。
- `provider` 可以来自本次 run 创建或模型调用时选中的 provider 配置。
- `model` 可以来自本次 run 创建或模型调用时选中的 model 配置。
- retry run 使用的 `provider` / `model` 必须跟随该 retry run 实际使用的输入身份和调用上下文。
- 如果 run 记录、输入身份和调用上下文都无法确认 provider，必须返回 `provider = null`。
- 如果 run 记录、输入身份和调用上下文都无法确认 model，必须返回 `model = null`。
- 不得从 provider message 中解析 `provider` 或 `model`。
- 不得从 provider 原始报错文本中解析 `provider` 或 `model`。
- 不得从 `errorSummary` 中解析 `provider` 或 `model`。
- 不得从 provider 原始 response payload 中解析 `provider` 或 `model`。
- 不得从 stack trace、本地日志行或异常字符串中解析 `provider` 或 `model`。
- 不得从 `requestId`、`httpStatus`、`errorType`、provider 原始错误码或本地错误码映射出 `provider` 或 `model`。
- 不得为了填充字段而猜测、生成、拼接或伪造 `provider` 或 `model`。
- `provider` / `model` 只用于 diagnostics 定位，不替代 `errorType`、固定错误码、retry 语义或本地 run 定位字段。

这样 `provider` / `model` 表达的是本系统实际选择的调用上下文，不把 provider 自由文本或返回载荷变成新的事实来源。

### TD-155 provider 和 model 第一版各最多 128 个 Unicode code point

第一版 `permanentProviderErrorSamples[].provider` 和 `permanentProviderErrorSamples[].model` 各自最多 128 个 Unicode code point。

规则：

- `provider = null` 不受长度限制。
- `model = null` 不受长度限制。
- 长度上限只约束最终输出的 `provider` 和 `model` 字段。
- 长度上限不约束 `httpStatus`、`errorType`、`requestId`、`errorSummary`、`runId`、`eventId` 或 `finishedAt`。
- `provider` 为 128 个 Unicode code point 合法。
- `model` 为 128 个 Unicode code point 合法。
- `provider` 为 129 个 Unicode code point 不合法。
- `model` 为 129 个 Unicode code point 不合法。
- 不得按 UTF-8 字节数计算。
- 不得按 JavaScript UTF-16 code unit 计算。
- 不得使用 JavaScript `string.length` 作为最终长度判定口径。
- 含有非 BMP 字符时，必须仍按 Unicode code point 计数。
- 本系统调用上下文或配置元数据中的 provider 标识超过 128 个 Unicode code point 时，必须返回 `provider = null`。
- 本系统调用上下文或配置元数据中的 model 标识超过 128 个 Unicode code point 时，必须返回 `model = null`。
- 不得裁剪 `provider` 或 `model`。
- 不得复制 `provider` 或 `model` 前 128 个字符。
- 不得追加省略号。
- 不得为了满足长度上限而保留不完整 `provider` 或 `model` 片段。
- 不得哈希、重编码或压缩 `provider` 或 `model` 来绕过长度上限。
- 未来如需调整上限，必须作为 diagnostics schema 变更明确记录。

这样 `provider` / `model` 保持短、稳定、可扫描，同时避免配置异常或意外长字符串进入 diagnostics 契约。

### TD-156 finishedAt 只能来自 run 记录完成时间

第一版 `permanentProviderErrorSamples[].finishedAt` 只能来自同一 run 记录的持久化完成时间。

规则：

- `finishedAt` 必须始终存在。
- `finishedAt` 不得为 `null`。
- `finishedAt` 必须读取同一 run 记录保存的完成时间。
- `finishedAt` 不得使用 provider 返回时间。
- `finishedAt` 不得使用 provider error timestamp。
- `finishedAt` 不得使用模型输出时间。
- `finishedAt` 不得使用 ops/status 查询时间。
- `finishedAt` 不得使用脚本扫描时间。
- `finishedAt` 不得使用 scheduler 发现失败的时间。
- `finishedAt` 不得使用本地日志时间。
- `finishedAt` 不得用 `finishedAt + backoff`、`nextAttemptAt - backoff` 或当前时间重新推导。
- `finishedAt` 不得从 provider message、provider 原始报错、provider 原始 response payload、`errorSummary`、stack trace、本地日志行或异常字符串中解析。
- `permanentProviderErrorSamples[]` 候选必须是 `status = "failed"`、`errorCode = "causal_hypothesis_provider_permanent_error"` 且同一 run 记录已有持久化 `finishedAt` 的 run。
- `permanentProviderErrorSamples[]` 排序必须使用这个 run 记录 `finishedAt`。
- `latestPermanentProviderErrorAt` 必须使用 run 记录 `finishedAt` 的最大值。
- 如果永久 provider failed run 缺少持久化 `finishedAt`，不得进入 `permanentProviderErrorSamples[]`。
- 如果永久 provider failed run 缺少持久化 `finishedAt`，不得为了 `latestPermanentProviderErrorAt` 合成替代时间。
- 如果永久 provider failed run 缺少持久化 `finishedAt`，仍应计入 `permanentProviderErrorCount`。
- 缺少 `finishedAt` 属于 run 数据一致性问题，应由 diagnostics 之外的数据一致性检查或修复流程处理。

这样 diagnostics 和 light 的时间语义都来自同一个 run 事实，不会被 provider 时间、查询时间或后台扫描时间污染。

### TD-157 eventId 只能来自 run 记录事件绑定

第一版 `permanentProviderErrorSamples[].eventId` 只能来自同一 run 记录保存的 canonical event 绑定。

规则：

- `eventId` 必须始终存在。
- `eventId` 不得为 `null`。
- `eventId` 必须读取同一 run 记录保存的事件绑定。
- `eventId` 不得从 provider payload 中解析。
- `eventId` 不得从 provider message 中解析。
- `eventId` 不得从 provider 原始报错、provider 原始 response payload、`errorSummary`、stack trace、本地日志行或异常字符串中解析。
- `eventId` 不得用当前 canonical event lookup 替代缺失的 run 记录事件绑定。
- `eventId` 不得用当前 projection lookup 替代缺失的 run 记录事件绑定。
- `eventId` 不得从 `requestId`、`httpStatus`、`errorType`、provider 原始错误码、本地错误码或 `inputChecksum` 映射。
- `eventId` 不得从 `retry_of_run_id` 链或其他历史 run 反向推断。
- `eventId` 不得为了填充字段而猜测、生成、拼接或伪造。
- `permanentProviderErrorSamples[]` 候选必须是 `status = "failed"`、`errorCode = "causal_hypothesis_provider_permanent_error"` 且同一 run 记录已有持久化 `eventId` 的 run。
- 如果永久 provider failed run 缺少持久化 `eventId`，不得进入 `permanentProviderErrorSamples[]`。
- 如果永久 provider failed run 缺少持久化 `eventId`，仍应计入 `permanentProviderErrorCount`。
- 缺少 `eventId` 属于 run 数据一致性问题，应由 diagnostics 之外的数据一致性检查或修复流程处理。

这样 diagnostics 样例定位的是失败发生时的 run 事实，不会被 provider 自由文本、当前事件状态或后续投影修复污染。

### TD-158 runId 只能来自样例 run 自身主键

第一版 `permanentProviderErrorSamples[].runId` 只能来自样例对应 failed run 自身的持久化主键。

规则：

- `runId` 必须始终存在。
- `runId` 不得为 `null`。
- `runId` 必须读取样例对应 failed run 自身的主键。
- `runId` 不得从本地日志行中解析。
- `runId` 不得从 provider request id、provider correlation id、provider payload、provider message、provider 原始报错、provider 原始 response payload、`errorSummary`、stack trace 或异常字符串中解析。
- `runId` 不得使用 `retry_of_run_id`。
- `runId` 不得使用被重试 run、触发 retry 的 run、阻止 retry 的 `existingRunId` 或其他关联 run 的 id。
- `runId` 不得使用新建 retry run 的 id 替代永久 provider failed run 自身的 id。
- `runId` 不得从 `eventId`、`inputChecksum`、`httpStatus`、`errorType`、provider 原始错误码或本地错误码映射。
- `runId` 不得为了填充字段而猜测、生成、拼接或伪造。
- `permanentProviderErrorSamples[]` 候选必须是 `status = "failed"`、`errorCode = "causal_hypothesis_provider_permanent_error"` 且有自身持久化主键的 run。
- 如果永久 provider failed run 缺少自身持久化主键，不得进入 `permanentProviderErrorSamples[]`。
- 如果永久 provider failed run 缺少自身持久化主键，仍应计入 `permanentProviderErrorCount`。
- 缺少 `runId` 属于 run 数据一致性问题，应由 diagnostics 之外的数据一致性检查或修复流程处理。

这样 diagnostics 样例的本地定位字段始终指向被展示的那条 failed run 本身，不会被 provider 定位信息或 retry 关系污染。

### TD-159 permanentProviderErrorCount 不受 samples 字段完整性影响

第一版 `permanentProviderErrorCount` 是永久 provider 错误的健康摘要计数，不是 diagnostics 样例数量。

规则：

- `permanentProviderErrorCount` 必须始终存在。
- `permanentProviderErrorCount` 必须是非负整数。
- `permanentProviderErrorCount` 只统计当前保留 run 表里的 run。
- `permanentProviderErrorCount` 只统计 `status = "failed"` 的 run。
- `permanentProviderErrorCount` 只统计 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 run。
- `permanentProviderErrorCount` 不受 `permanentProviderErrorSamples` 最多 10 条限制影响。
- `permanentProviderErrorCount` 不受 diagnostics 是否请求影响。
- `permanentProviderErrorCount` 不受 `permanentProviderErrorSamples[]` 字段完整性影响。
- 永久 provider failed run 即使缺少自身持久化 `runId`，仍应计入 `permanentProviderErrorCount`。
- 永久 provider failed run 即使缺少持久化 `eventId`，仍应计入 `permanentProviderErrorCount`。
- 永久 provider failed run 即使缺少持久化 `finishedAt`，仍应计入 `permanentProviderErrorCount`。
- 永久 provider failed run 即使缺少 `provider`、`model`、`httpStatus`、`requestId` 或 `errorSummary`，仍应计入 `permanentProviderErrorCount`。
- 不得因为某条 run 不能进入 `permanentProviderErrorSamples[]` 而从 `permanentProviderErrorCount` 中排除。
- 不得因为某条 run 不能参与 `latestPermanentProviderErrorAt` 计算而从 `permanentProviderErrorCount` 中排除。
- `latestPermanentProviderErrorAt` 只从匹配 run 中已有持久化 `finishedAt` 的 run 计算最大值。
- 如果 `permanentProviderErrorCount > 0` 但没有任何匹配 run 有持久化 `finishedAt`，`latestPermanentProviderErrorAt = null`。
- `permanentProviderErrorSamples = []` 不代表 `permanentProviderErrorCount = 0`。
- `latestPermanentProviderErrorAt = null` 不代表 `permanentProviderErrorCount = 0`。

这样 light 摘要不会因为数据一致性问题或 diagnostics 样例字段缺失而低估永久 provider 错误总量；样例和 latest time 继续保持各自的安全字段约束。

### TD-160 提供永久 provider samples 数据一致性检查脚本

因字段缺失不能进入 `permanentProviderErrorSamples[]` 的永久 provider failed run，不应把排除原因塞进 ops/status light。第一版必须提供本地只读数据一致性检查脚本：

- `scripts/check-causal-hypothesis-run-consistency.ts`

规则：

- 脚本只用于本地自动化巡检和内部运维。
- 脚本只读，不得写数据库、创建 run、重试 run、修复 run、刷新 projection 或替换 active 原因假设。
- 脚本不新增 frontend 按钮、公开 provider API、MCP public tool 或 ops/status light 字段。
- 检查范围是当前保留 run 表中 `status = "failed"` 且 `errorCode = "causal_hypothesis_provider_permanent_error"` 的 run。
- 脚本必须报告缺少样例必需定位字段的 run：样例 run 自身持久化 `runId`、同一 run 记录持久化 `eventId`、同一 run 记录持久化 `finishedAt`。
- 缺少 `finishedAt` 还必须标记会影响 `latestPermanentProviderErrorAt` 计算。
- `provider`、`model`、`httpStatus`、`requestId` 和 `errorSummary` 缺失时按 diagnostics 规则返回 `null`，不得作为 samples 排除问题报告。
- `permanentProviderErrorCount` 仍统计所有匹配 run，不受该脚本 findings 影响。
- 脚本默认可以输出人读摘要，但必须支持稳定 `--json`。
- `--json` 顶层固定包含 `schemaVersion`、`mode`、`exitCode`、`durationMs`、`requested`、`summary`、`findings` 和 `errors`。
- `schemaVersion = 1`。
- `mode = "causal_hypothesis_run_consistency_check"`。
- `exitCode` 必须等于进程实际退出码。
- `requested` 只包含规范化后的安全请求字段；第一版至少包含 `findingsLimit`。
- `summary` 至少包含 `checkedCount`、`permanentProviderErrorCount`、`sampleIneligibleCount`、`missingRunIdCount`、`missingEventIdCount`、`missingFinishedAtCount`、`findingsReturned` 和 `findingsTruncated`。
- `findings[]` 每项至少包含 `target`、`missingFields`、`affects` 和 `recommendedAction`。
- `target` 固定包含 `scope = "run"`、`runId` 和 `eventId`；缺失时对应字段为 `null`。
- `missingFields` 只允许 `runId`、`eventId` 和 `finishedAt`。
- `affects` 只允许 `permanentProviderErrorSamples` 和 `latestPermanentProviderErrorAt`。
- `recommendedAction` 第一版固定为 `repair_run_record_consistency`。
- `findingsLimit` 只限制 `findings[]` 返回数量，不限制 `summary` 的全量统计。
- 退出码：检查完成且没有 findings 时为 `0`；检查完成但发现数据一致性问题时为 `2`；参数、数据库或运行时失败时为 `1`。
- JSON 和默认日志不得输出 provider 原始 payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential、完整配置、SQL 或 stack trace。
- 该脚本只暴露“哪些 run 记录缺少哪些持久化字段”和稳定修复建议，不负责自动修复。

这样 ops/status light 继续保持投资者可读的健康摘要；自动化巡检仍能发现数据一致性问题，并用稳定 JSON 定位后续修复工作。

### TD-161 数据一致性检查脚本第一版不提供修复模式

第一版 `scripts/check-causal-hypothesis-run-consistency.ts` 只做检查，不做修复。

规则：

- 不提供 `--repair`。
- 不提供 `--fix`。
- 不提供 `--execute` 或等价变更模式。
- 不提供可通过环境变量、配置、hidden flag 或 debug mode 开启的修复路径。
- 不根据当前 canonical event、projection、retry 链、provider payload、日志或历史 run 自动补齐 `runId`、`eventId` 或 `finishedAt`。
- `recommendedAction = "repair_run_record_consistency"` 只是稳定建议枚举，不表示脚本能执行修复。
- 参数解析遇到 `--repair`、`--fix`、`--execute` 或等价变更参数时必须失败。
- 失败的 JSON 使用 `errors[]`，不得生成 `findings[]` 后继续尝试修复。
- 未来如果需要修复，必须另起可审计的数据修复设计，定义数据来源、写入边界、回滚策略、验证脚本和审计输出。

这样检查脚本不会成为隐式数据改写入口；缺失 run 身份或完成时间的修复需要单独设计，避免破坏审计链。

### TD-162 数据一致性检查脚本 findingsLimit 默认和上限

第一版 `scripts/check-causal-hypothesis-run-consistency.ts` 的 findings 截断规则固定如下：

- 命令行参数名为 `--findings-limit`。
- 省略 `--findings-limit` 时，`findingsLimit = 100`。
- 显式传入 `--findings-limit` 时，必须是 `1..1000` 的十进制整数。
- `1` 和 `1000` 合法。
- `0`、负数、小数、非数字、空字符串和超过 `1000` 的值非法。
- 非法 `--findings-limit` 固定按参数解析失败处理。
- 不得把超过 `1000` 的值自动截断为 `1000`。
- 不得把小数取整、向上取整或向下取整。
- `requested.findingsLimit` 必须输出最终有效值；省略参数时输出 `100`。
- `findingsLimit` 只限制 `findings[]` 返回数量。
- `summary` 必须始终基于当前保留 run 表全量统计，不受 `findingsLimit` 影响。
- `findingsReturned` 是实际返回的 `findings[]` 数量。
- `findingsTruncated = true` 表示全量 findings 数量大于 `findingsReturned`。
- 参数解析失败时不得输出半解析的 `requested.findingsLimit`。

这样自动化可以用默认值获得可读输出，也可以在巡检时显式提高返回量；同时全量统计不会因为明细截断而失真。

### TD-163 数据一致性检查脚本 findings 截断前稳定排序

第一版 `scripts/check-causal-hypothesis-run-consistency.ts` 必须先对全量 findings 稳定排序，再应用 `findingsLimit`。

排序规则：

- 先构造全量 findings，再排序，再截断到 `findingsLimit`。
- 影响 `latestPermanentProviderErrorAt` 的 finding 排在只影响 `permanentProviderErrorSamples` 的 finding 前面。
- `missingFields` 数量多的 finding 排在数量少的 finding 前面。
- 再按同一 run 记录上的可用持久化时间倒序。
- 可用持久化时间依次取同一 run 记录的 `finishedAt`、`startedAt`、`createdAt` 中第一个非空值。
- 缺少持久化时间的 finding 排在有持久化时间的 finding 后面。
- 不得使用 provider 时间、查询时间、脚本扫描时间、本地日志时间或当前时间参与排序。
- 持久化时间相同时，按 `runId` 升序稳定兜底。
- `runId` 缺失时排在有 `runId` 的 finding 后面。
- `runId` 相同或均缺失时，按 `eventId` 升序稳定兜底。
- `eventId` 缺失时排在有 `eventId` 的 finding 后面。
- `findingsReturned` 和 `findingsTruncated` 必须基于排序后的截断结果计算。

这样同一数据库状态下，`findings[]` 的前 N 条稳定可比对，自动化不会因为数据库自然顺序变化而产生噪声。

### TD-164 数据一致性检查脚本 errors[] 使用独立小枚举

第一版 `scripts/check-causal-hypothesis-run-consistency.ts --json` 的 `errors[]` 复用 backfill 脚本错误对象形状，但不复用 backfill 的完整错误枚举。

规则：

- `errors[]` 每项固定包含 `target`、`errorCode`、`phase`、`retryable` 和 `message`。
- `target` 第一版只允许 `target.scope = "global"`。
- 数据一致性问题只进入 `findings[]`，不进入 `errors[]`。
- 检查完成但发现 findings 时，`exitCode = 2` 且 `errors = []`。
- 参数、数据库或运行时失败时，`findings = []`。
- 第一版 `errorCode` 只允许 `invalid_arguments`、`database_unavailable` 和 `unexpected_runtime_error`。
- 第一版 `phase` 只允许 `argument_parse`、`database_scan` 和 `runtime`。
- 参数解析失败使用 `errorCode = "invalid_arguments"`、`phase = "argument_parse"`、`retryable = false`。
- 数据库连接失败、查询失败或扫描 run 表失败使用 `errorCode = "database_unavailable"`、`phase = "database_scan"`、`retryable = true`。
- 已被脚本捕获但不属于参数或数据库扫描失败的运行时异常使用 `errorCode = "unexpected_runtime_error"`、`phase = "runtime"`、`retryable = true`。
- 机器判断只能依赖 `target`、`errorCode`、`phase` 和 `retryable`，不得依赖 `message` 文案。
- `message` 只供人读，必须由脚本生成并脱敏。
- `message` 不得包含 raw exception、SQL、堆栈信息、provider 原始报错、provider 原始 request / response payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential 或完整配置。
- 不输出 `wouldErrors[]`。
- 不输出 backfill 专属错误码，例如 `generator_config_missing`、`event_not_found`、`candidate_ineligible`、`input_build_failed`、`dedupe_check_failed`、`enqueue_failed` 或 `unexpected_candidate_error`。

这样内部自动化可以复用错误对象解析逻辑，但不会把 backfill / repair 的业务错误枚举泄漏到只读一致性检查脚本。

### TD-165 数据一致性检查脚本非 JSON 模式退出码与 JSON 一致

第一版 `scripts/check-causal-hypothesis-run-consistency.ts` 的默认人读输出模式必须和 `--json` 使用同一套退出码语义。

规则：

- 非 `--json` 模式可以向 stdout 输出简短人读摘要。
- 非 `--json` 模式检查完成且没有 findings 时退出 `0`。
- 非 `--json` 模式检查完成但发现 findings 时退出 `2`。
- 非 `--json` 模式参数、数据库或运行时失败时退出 `1`。
- 非 `--json` 模式不得因为输出是人读摘要而在发现 findings 时退出 `0`。
- 非 `--json` 模式不得使用和 `--json` 不同的退出码映射。
- 需要结构化字段的自动化必须使用 `--json`；只需要告警语义的本地 cron / launchd 可以依赖进程退出码。
- 人读摘要可以包含安全计数、`findingsTruncated` 和已允许暴露的 run / event 定位信息。
- 人读摘要、stderr 和本地日志不得输出 provider 原始 payload、raw prompt、完整模型输入、完整模型输出、完整原文、secret、token、credential、完整配置、SQL 或 stack trace。
- stderr 和本地日志只供人读诊断，不作为机器契约。

这样本地巡检不会因为是否传 `--json` 而得到不同告警结果；机器消费方仍通过 `--json` 获取稳定字段。

### TD-166 技术方案审批通过

`technical-design.md` 已完成实现前一致性检查并审批通过，可以进入实施计划执行阶段。

审批依据：

- 模块边界已收敛到 `server/services/event-engine/causal-hypothesis/*` 和 `server/database/causal-hypotheses.ts`。
- 数据库初始化、SQL ownership、run 表时间字段、队列 claim、retry、projection repair、provider/MCP/frontend、ops/status 和脚本契约均已有实现级约束。
- `implementation-plan.md` 已声明与 `technical-design.md`、`product-spec.md` 和 AGENTS.md backend truth 规则一致。
- 未实现内容仍不得写入当前生效文档；当前生效文档只在功能实现和验证完成后同步。

进入实现后的边界：

- 必须按 `implementation-plan.md` 分步推进。
- 不得把核心原因语义移到 frontend、MCP formatter、prompt、skill 或外部 repo。
- 不得新增未在方案中审批的公开生成 API、frontend 触发按钮、MCP public tool 或独立 daemon。

### TD-84 errors[] 和 wouldErrors[] 必须包含 retryable

manual backfill / repair JSON 中的 `errors[]` 和 dry-run `wouldErrors[]` 每一项都必须包含 `retryable` 布尔字段。

规则：

- `retryable` 由脚本/服务根据固定 `errorCode` 和 `phase` 计算。
- 自动化不能从 `message` 自由文本推断是否可重试。
- `retryable = true` 表示同样请求在不修改参数、配置或数据的情况下可以自动重试。
- `retryable = false` 表示需要人工或上游系统改变输入、配置、数据，或者第一版无法安全判断可重试。
- `retryable` 不改变退出码语义。
- `retryable` 不让 `skipped` 进入 `errors[]`。
- 第一版默认映射：
  - `database_unavailable`: `retryable = true`
  - `enqueue_failed`: `retryable = true`
  - `unexpected_runtime_error`: `retryable = true`
  - `invalid_arguments`: `retryable = false`
  - `generator_config_missing`: `retryable = false`
  - `event_not_found`: `retryable = false`
  - `candidate_ineligible`: `retryable = false`
  - `input_build_failed`: `retryable = false`
  - `dedupe_check_failed`: `retryable = false`
  - `unexpected_candidate_error`: `retryable = false`

这样 cron、launchd 或后续内部自动化可以稳定决定是否重跑，而不是把错误文案当协议。

### TD-85 errors[] 和 wouldErrors[] 使用固定 target 对象

manual backfill / repair JSON 中的 `errors[]` 和 dry-run `wouldErrors[]` 每一项都必须使用固定 `target` 对象定位失败范围，不能使用自由文本描述目标。

规则：

- `target` 必须是对象，不允许是字符串。
- `target.scope` 是固定枚举：`global`、`event`、`run`。
- 全局错误使用 `target.scope = "global"`。
- 候选级事件错误使用 `target.scope = "event"`，并在可获得时带 `eventId`。
- run 级错误使用 `target.scope = "run"`，并在可获得时带 `runId` 和 `eventId`。
- 批量候选错误在可获得时带 `candidateIndex`。
- 输入已经构建完成后，在可获得时带 `inputChecksum`。
- 不允许把 `target` 写成 `target: "event failed"` 或类似自由文本。
- 自由文本只能放在 `message`。

第一版 `target` 结构为：

```ts
type BackfillErrorTarget = {
  scope: "global" | "event" | "run";
  eventId?: string;
  runId?: string;
  candidateIndex?: number;
  inputChecksum?: string;
};
```

这样自动化可以稳定区分整批失败、某个事件失败和某次 run 失败。

### TD-86 target.candidateIndex 使用最终候选列表的 0-based 位置

`target.candidateIndex` 必须使用 0-based index，并指向过滤、排序、`--limit` 截断后的最终候选列表。

规则：

- `candidateIndex` 从 0 开始。
- `candidateIndex` 指向 dry-run `wouldQueueEventIds` / `wouldSkip` 和 execute 实际遍历的同一候选顺序。
- `candidateIndex` 不得使用数据库原始 offset、分页 offset、进入过滤前的位置或被 `--limit` 截断前的位置。
- 如果能获得 `eventId`，带 `candidateIndex` 的 `target` 也必须同时带 `eventId`。
- 精确 `--event-id` 模式下，如仍构造单元素候选列表，候选级错误使用 `candidateIndex = 0`。

这样人和自动化都可以把错误稳定映射回 dry-run / execute 看到的同一个候选列表。

### TD-87 全局预检失败不计入 failedCount

manual backfill / repair 的真实 `--execute` 中，`failedCount` 只统计候选级失败数量，不统计全局预检失败。

规则：

- 全局预检失败包括参数错误、原因生成器配置错误、数据库不可用或基础运行环境不可用。
- 全局预检失败时必须立即停止，不处理候选，不写入任何 run，不刷新 projection。
- 全局预检失败时 `queuedCount = 0`。
- 全局预检失败时 `skippedCount = 0`。
- 全局预检失败时 `failedCount = 0`。
- 全局预检失败必须在 `errors[]` 中写入至少一条 `target.scope = "global"` 的错误。
- 全局预检失败退出码必须为非 0。
- 候选级失败才计入 `failedCount`，并使用 `target.scope = "event"` 或 `target.scope = "run"`。

这样自动化可以区分“整批没有开始”和“候选处理过程中部分失败”。

### TD-88 dry-run JSON 必须包含 executionBlocked

manual backfill / repair 的 dry-run JSON 必须包含 `executionBlocked` 布尔字段，用来表达同样请求如果真实 `--execute` 是否会被全局预检阻断。

规则：

- `executionBlocked` 只描述真实执行是否会被全局预检阻断，不描述候选级失败。
- `executionBlocked = true` 时，`wouldErrors[]` 必须包含至少一条 `target.scope = "global"` 的错误。
- `executionBlocked = false` 时，不得用全局阻断语义解释 `wouldErrors[]`。
- 缺少原因生成配置但 dry-run 仍能成功返回候选时，dry-run 可以退出 0，同时设置 `executionBlocked = true`。
- 如果参数错误、数据库不可用或运行环境错误导致 dry-run 本身无法产出有效预览，dry-run 仍应非 0；若能输出 JSON envelope，也应设置 `executionBlocked = true` 并写入 global `wouldErrors[]`。
- 候选级预计失败只进入 `wouldFailCount` / `wouldErrors[]`，不设置 `executionBlocked = true`。
- `executionBlocked` 不创建 run、不刷新 projection、不影响真实 `--execute` 的退出码规则。

这样自动化不需要扫描 `wouldErrors[]` 才能判断“dry-run 正常完成，但 execute 会整批被挡住”。

### TD-89 executionBlocked=true 时 would* 字段仍是候选级预览

当 dry-run JSON 中 `executionBlocked = true` 时，`wouldQueueCount`、`wouldSkipCount`、`wouldFailCount`、`wouldQueueEventIds`、`wouldSkip` 和候选级 `wouldErrors[]` 仍然表达候选级预览。

规则：

- `would*` 字段表示“如果全局阻断被修复，这批候选在去重和候选级检查后会怎样”。
- `executionBlocked = true` 时，自动化不得把 `wouldQueueCount > 0` 当成当前可真实执行。
- `executionBlocked = true` 时，当前真实 `--execute` 仍会整批失败，且写入 0 个 run。
- `executionBlocked = true` 时，候选级 `wouldErrors[]` 可以和 global `wouldErrors[]` 同时存在。
- `executionBlocked = false` 时，`would*` 字段按普通候选级 dry-run 预览解释。

这样 dry-run 仍可用于排查候选范围和去重结果，同时不会误导自动化发起当前不可成功的真实执行。

### TD-90 wouldFailCount 只统计候选级预计失败

dry-run JSON 中的 `wouldFailCount` 只统计候选级预计失败，不统计 global 阻断。

规则：

- global 阻断只由 `executionBlocked = true` 和 `target.scope = "global"` 的 `wouldErrors[]` 表达。
- 候选级预计失败仍进入 `wouldFailCount`。
- `executionBlocked = true` 且存在候选级预计失败时，`wouldFailCount` 可以大于 0。
- 候选级 `wouldErrors[]` 使用 `target.scope = "event"` 或 `target.scope = "run"`。
- 自动化判断当前是否可真实执行时，必须先看 `executionBlocked`。
- 自动化判断候选质量或预计部分失败时，再看 `wouldFailCount` 和候选级 `wouldErrors[]`。

这样 dry-run 的两个问题被分开：全局是否挡住执行，以及候选本身预计会失败多少。

### TD-91 dry-run 完整候选预览时 would* 计数必须守恒

dry-run 成功产出完整候选级预览时，`wouldQueueCount + wouldSkipCount + wouldFailCount` 必须等于过滤、排序、`--limit` 截断后的最终候选数量。

规则：

- 完整候选级预览是指脚本已经得到最终候选列表，并能把每个候选归入预计排队、预计跳过或预计候选级失败之一。
- 每个候选必须且只能进入 `wouldQueueCount`、`wouldSkipCount`、`wouldFailCount` 三类中的一类。
- 即使 `executionBlocked = true`，只要候选级预览完整，三者之和也必须等于最终候选数量。
- global 阻断本身不计入 `wouldFailCount`，也不破坏这条计数守恒。
- 如果 dry-run 因参数错误、数据库不可用或运行环境错误无法产出最终候选列表，可以不要求三者之和守恒。
- 无法产出最终候选列表时，dry-run 应非 0，并通过 `target.scope = "global"` 的 `wouldErrors[]` 说明原因。

这样自动化可以用计数守恒校验 dry-run 预览是否完整，同时仍能正确处理全局阻断。

### TD-92 dry-run JSON 显式输出 candidateCount

dry-run JSON 必须显式输出 `candidateCount`，用于表达过滤、排序、`--limit` 截断后的最终候选数量。

规则：

- `candidateCount` 等于过滤、排序、`--limit` 截断后的最终候选列表长度。
- `candidateCount` 不是数据库原始候选总量。
- `candidateCount` 不是过滤前数量、排序前数量、分页前数量或新排队目标数量。
- dry-run 成功产出完整候选级预览时，`candidateCount = wouldQueueCount + wouldSkipCount + wouldFailCount`。
- 即使 `executionBlocked = true`，只要候选级预览完整，也必须输出 `candidateCount` 并满足计数守恒。
- 如果 dry-run 无法产出最终候选列表，仍必须输出 `candidateCount = null`。
- 无法产出最终候选列表时，dry-run 应非 0，并通过 `target.scope = "global"` 的 `wouldErrors[]` 说明原因。

这样自动化可以直接校验候选级预览完整性，而不用从多个数组长度反推最终候选数量。

### TD-93 candidateCount 不可用时固定为 null

dry-run JSON 必须保持稳定 schema。即使无法产出最终候选列表，也必须保留 `candidateCount` 字段，并将其设为 `null`。

规则：

- `candidateCount = null` 表示最终候选列表不可用。
- 不允许省略 `candidateCount`。
- 不允许用 `candidateCount = 0` 表示不可用；`0` 只表示已经成功产出最终候选列表且候选数量确实为 0。
- 当 `candidateCount = null` 时，`executionBlocked` 必须为 `true`。
- 当 `candidateCount = null` 时，`wouldErrors[]` 必须至少包含一个 `target.scope = "global"` 的错误。

这样 cron、launchd 和内部自动化可以按固定字段解析 dry-run 输出，同时不会把“无法计算候选列表”和“候选列表为空”混为一谈。

### TD-94 candidateCount 为 null 时 would 字段保持稳定类型

当 dry-run 无法产出最终候选列表并返回 `candidateCount = null` 时，`would*` 计数字段和候选级结果数组仍必须保持稳定类型。

规则：

- `wouldQueueCount = 0`。
- `wouldSkipCount = 0`。
- `wouldFailCount = 0`。
- `wouldQueueEventIds = []`。
- `wouldSkip = []`。
- 不得输出候选级 `wouldErrors[]`。
- `wouldErrors[]` 仍必须至少包含一个 `target.scope = "global"` 的错误。
- 自动化必须先看 `candidateCount` 和 `executionBlocked`，不得把三个 `would*Count = 0` 解释成“最终候选列表成功为空”。

这样 `--json` 使用方不用处理数字字段缺省或变成 `null`，同时仍能准确区分“候选列表不可用”和“有效候选列表为空”。

### TD-95 --json 非 0 退出时仍输出可解析 JSON

manual backfill / repair 脚本进入 `--json` 模式后，标准输出必须是机器契约，而不是人读日志。只要脚本已经进入自己的错误处理流程，即使最终退出码非 0，也必须尽力向 stdout 输出一份完整、可解析的 JSON。

规则：

- stdout 必须只包含一份 JSON 对象。
- stdout 不得在 JSON 前后输出进度、日志、人读摘要或错误文本。
- 日志、进度和人读错误只能输出到 stderr。
- 参数解析成功并进入 dry-run 语义后，dry-run 非 0 的结构化失败写入 `wouldErrors[]`。
- execute 非 0 时，结构化失败写入 `errors[]`。
- 参数错误、配置错误、数据库错误、候选级部分失败和已捕获运行时异常，只要脚本能够构造 JSON envelope，都必须输出 JSON。
- 只有脚本无法接管的进程级失败允许没有 JSON，例如 Node 启动失败、模块加载失败、进程被操作系统终止或严重崩溃。
- 调用方遇到“非 0 且无 JSON”时，应按进程级失败处理，而不是按业务失败处理。

这样 cron、launchd 和内部自动化可以优先解析 JSON 获得失败原因，不需要从 stderr 文本里猜测脚本状态。

### TD-96 参数解析失败时 requested 为 null

`--json` 输出的顶层 `requested` 字段必须始终存在。参数解析成功时，`requested` 输出规范化后的请求；参数解析失败时，`requested = null`。

规则：

- 参数解析成功时，`requested` 只包含规范化、被系统接受的请求字段。
- 未知参数、拼写错误参数或当前版本不支持的未来参数都属于参数解析失败。
- `--event-id` 与 `--run-id` 同时出现属于参数解析失败。
- 没有 `--event-id` 或 `--run-id` 时，缺少 `--limit` 属于参数解析失败，即使传入了 `--include-noise`。
- 传入非法 `--limit` 值属于参数解析失败；`--limit` 必须是 `1..100` 的整数。
- 重复传入当前版本已定义的任一命令行参数属于参数解析失败。
- `--execute` 与显式 `--dry-run` 同时出现属于参数解析失败。
- 参数解析失败时，不得把半解析参数塞进 `requested`。
- 参数解析失败时，不得把原始命令行完整回显进 JSON。
- 参数解析失败必须以结构化 global error 表达。
- 参数解析失败的 `errorCode = "invalid_arguments"`。
- 参数解析失败的 `phase = "argument_parse"`。
- 参数解析失败的 `target.scope = "global"`。
- 参数解析失败的 `retryable = false`。
- 该错误固定放入 `errors[]`，不得放入 `wouldErrors[]`。

这样自动化能区分“请求已经被系统接受但执行失败”和“请求本身没有通过参数解析”，也避免未来参数里带入敏感值时被 JSON 原样回显。

### TD-102 requested 只保存规范化安全请求字段

`requested` 用于审计和复现用户意图，不是原始命令行快照，也不是内部实现配置快照。

规则：

- 参数解析成功时，`requested` 只保存规范化、被系统接受、对审计和复现有用的有效请求字段。
- 有效请求字段必须包含已经应用的稳定机器契约默认值。
- 第一版允许的 `requested` 字段包括 `eventId`、`runId`、`limit`、`includeNoise`、`dryRun` 和 `execute`。
- 未来新增筛选、排序或截断参数时，只能保存规范化后的安全参数。
- 如果用户省略 `--include-noise`，`requested.includeNoise = false`。
- 如果 `limit` 存在稳定机器契约默认值，`requested.limit` 记录最终有效值。
- `requested.dryRun` 和 `requested.execute` 记录最终有效执行模式。
- `requested` 不得保存原始 `argv`。
- `requested` 不得保存环境变量。
- `requested` 不得保存 profile secret、API key、token 或 credential。
- `requested` 不得保存 raw prompt、完整模型输入、provider 原始 request / response payload。
- `requested` 不得保存完整模型配置或 provider 参数。
- `requested` 不得保存内部批大小、数据库分页大小、临时并发策略等内部实现默认值。
- 参数解析失败时仍使用 `requested = null`。

这样 `requested` 可以支持自动化审计和复现用户意图，同时不会变成泄密面，也不会把脚本内部实现细节固化成长期契约。

### TD-103 requested 记录应用稳定默认值后的有效请求

`requested` 记录应用稳定机器契约默认值后的有效请求，不记录“用户显式传入了哪些参数”的原始参数集合。

规则：

- 参数解析成功时，`requested` 是系统接受的最终有效请求。
- `requested` 必须包含稳定机器契约默认值。
- 如果用户省略 `--include-noise`，`requested.includeNoise = false`。
- 如果 `limit` 存在稳定机器契约默认值，`requested.limit` 记录最终有效值。
- `requested.dryRun` 和 `requested.execute` 记录最终有效执行模式。
- `requested` 不记录内部批大小、数据库分页大小、临时并发策略等内部实现默认值。
- 参数解析失败时仍使用 `requested = null`。

这样自动化可以直接按 `requested` 复现同一次有效请求，不必猜测哪些字段来自显式参数、哪些字段来自稳定默认值，同时也不会把内部实现细节误固化成外部契约。

### TD-104 requested 已定义可选字段保持稳定形状

`requested` 中已经进入当前 JSON 字段契约的可选字段必须保持稳定形状；字段不适用于当前请求时写 `null`，未知字段、未来字段或当前版本没有定义的字段才省略。

规则：

- 参数解析失败时仍使用 `requested = null`。
- 参数解析成功时，当前版本已定义的 `requested` 字段必须按稳定形状输出。
- `eventId` 和 `runId` 是模式相关的可选定位字段；不适用于当前请求时写 `null`。
- `limit` 在批量模式下有显式值或稳定默认值时写数字；在精确单事件或单 run 模式下不适用时写 `null`。
- `includeNoise`、`dryRun` 和 `execute` 是布尔字段；只要 `requested` 不是 `null`，就必须始终存在。
- 未知字段、未来字段或当前 JSON 字段契约没有定义的字段不得为了占位写入 `null`。

这样自动化可以依赖稳定字段形状解析第一版契约，同时不会把还没设计清楚的未来字段提前固化。

### TD-97 参数解析失败固定进入 errors[]

参数解析失败发生在请求被系统接受之前，不能解释成有效 dry-run 预览。因此参数解析失败时，错误固定进入 `errors[]`，不得根据用户输入里是否出现 `--dry-run` 或其他预览意图放入 `wouldErrors[]`。

规则：

- `requested = null`。
- `dryRun = false`。
- `execute = false`。
- `errors[]` 必须包含一条 `target.scope = "global"` 的 `invalid_arguments` / `argument_parse` / `retryable = false` 错误。
- 不得输出 dry-run 预览字段，包括 `candidateCount`、`wouldQueueCount`、`wouldSkipCount`、`wouldFailCount`、`wouldQueueEventIds`、`wouldSkip`、`wouldErrors` 和 `executionBlocked`。
- 不得因为原始命令行里看起来包含 dry-run 意图，就把参数解析失败解释成 dry-run 结果。

这样自动化不会把“命令写错了”误判成“有效 dry-run 已完成但预览失败”。

### TD-98 参数解析失败时 mode 仍保持脚本级固定值

`--json` 输出的顶层 `mode` 表示这份 JSON 来自哪个机器接口，不表示用户请求已经被成功解析成哪个执行模式。因此参数解析失败时，`mode` 仍必须输出脚本级固定值。

规则：

- `scripts/backfill-causal-hypotheses.ts --json` 的 `mode` 固定为 `causal_hypothesis_backfill`。
- 参数解析成功和失败时都使用同一个 `mode`。
- 参数解析失败时不得把 `mode` 设为 `null`。
- 参数解析失败时不得把 `mode` 改成 `dry_run`、`execute`、`argument_error` 或其他请求状态。
- 请求是否成立由 `requested`、`dryRun`、`execute` 和结构化错误表达，不由 `mode` 表达。
- 参数解析失败时，自动化可以先按 `mode` 路由到对应 JSON schema，再根据 `requested = null` 和 global `invalid_arguments` 错误判断请求未成立。

这样自动化在参数错误时仍能稳定识别 JSON 来源，不需要从 stderr、命令名或外部调度配置反推 schema。

### TD-99 --json 顶层显式输出 schemaVersion

`--json` 输出必须在顶层显式包含 `schemaVersion`。`mode` 解决“这份 JSON 来自哪个机器接口”，`schemaVersion` 解决“这份机器契约是哪一版”。

规则：

- `schemaVersion` 必须始终存在。
- 第一版 `schemaVersion = 1`。
- `schemaVersion` 使用整数，不使用 semver 字符串。
- 参数解析成功和失败时都必须输出 `schemaVersion = 1`。
- 破坏性 JSON 契约变更才递增 `schemaVersion`。
- 兼容性新增字段不递增 `schemaVersion`。
- 自动化应按 `mode + schemaVersion` 选择解析逻辑。

这样 cron、launchd、内部脚本和 NexusFi 侧消费方可以稳定识别同一脚本不同版本的机器输出契约。

### TD-100 --json 顶层显式输出 exitCode

`--json` 输出必须在顶层显式包含 `exitCode`。`exitCode` 表示脚本最终进程退出语义，必须和进程实际退出码一致。

规则：

- `exitCode` 必须始终存在于已输出的 JSON 中。
- `exitCode` 必须是整数。
- `exitCode` 必须与进程实际退出码一致。
- `exitCode = 0` 只表示脚本按契约完成，不表示真实 execute 一定可执行。
- dry-run 中是否可真实执行仍必须看 `executionBlocked`。
- 非 0 且有 JSON 表示脚本已处理的失败，结构化原因在 `errors[]` 或 `wouldErrors[]`。
- 非 0 且无 JSON 表示脚本无法接管的进程级失败。
- 第一版不增加 `ok` 或 `success` 布尔字段。

这样自动化可以先解析 JSON，再用 `exitCode` 对齐进程退出语义，同时不会把 dry-run 阻断、候选级失败和进程级失败压成一个模糊布尔值。

### TD-101 --json 顶层显式输出 durationMs

`--json` 输出必须在顶层显式包含 `durationMs`。第一版只输出耗时，不输出 `startedAt` 或 `finishedAt`。

规则：

- `durationMs` 必须始终存在于已输出的 JSON 中。
- `durationMs` 必须是非负整数毫秒。
- `durationMs` 表示脚本从进入可接管的 main 流程到生成 JSON envelope 的耗时。
- 参数解析失败时也必须输出 `durationMs`。
- `durationMs` 不包括 Node 启动、模块加载失败或进程被操作系统终止这类脚本无法接管的阶段。
- 第一版不输出 `startedAt`。
- 第一版不输出 `finishedAt`。
- 墙钟时间先由外层 cron、launchd 或运维日志记录。

这样自动化可以识别脚本运行是否异常变慢，同时避免时区、时钟漂移和时间格式争议进入第一版机器契约。
