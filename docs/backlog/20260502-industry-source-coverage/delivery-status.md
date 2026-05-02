# Delivery Status

状态：Validation；静态验证通过，live source smoke 仍有外部站点可用性缺口
最后更新：2026-05-02
范围：行业源覆盖扩展的交付状态、验证记录和剩余风险

## 1. 当前状态

- backlog 六件套已建立。
- source registry 扩展已落地。
- industry research generic getter 已落地。
- broad-tag guardrail 已集中到 shared industry module。
- 当前处于验证阶段：代码、类型、构建和文档治理通过；新增 live source smoke 暴露部分外部站点不可用或页面结构不适配，未标记为 Completed。

## 2. 已完成内容

- 扩展 canonical industry tags：
  - `power-battery`
  - `cloud-infrastructure`
  - `communication-equipment`
  - `robotics`
  - `manufacturing`
- 新增行业研究来源及 generated registry。
- 新增 `server/sources/industryResearch.ts`。
- 新增 source coverage 测试。
- 新增 generic extraction 测试。
- 统一 broad-tag 判断 helper。

## 3. 验证记录

已通过：

- `pnpm exec tsx ./scripts/source.ts`
- `pnpm test -- shared/industry.test.ts shared/industry-source-coverage.test.ts server/sources/__tests__/industry-research.test.ts server/services/event-engine/resolver.test.ts server/database/events.test.ts shared/event-profile.test.ts`
- `pnpm typecheck`
- `pnpm docs:check`
- `pnpm perf:query-plans`
- `git diff --check`
- `pnpm build`

Live source smoke：

- 检查新增 `industryResearch` getter：27 个。
- 当前可返回条目：9 个。
- 当前为空：8 个。
- 当前外部访问错误：10 个。

已根据 smoke 结果收紧 generic extractor，过滤导航、社交、RSS、pricing、平台入口等非新闻条目。

当前仍未闭环的来源：

- empty：`bnef-energy-transition`、`cabia-battery`、`ccid-consulting`、`delloro-telecom`、`lightcounting-newsletter`、`mir-automation`、`woodmac-renewables`、`yole-semiconductor`
- error：`canalys-cloud-infrastructure`、`cignal-ai-optical`、`customs-manufacturing`、`gartner-newsroom`、`ggii-battery`、`ggii-robotics`、`omdia-cloud-infrastructure`、`omdia-optical-communications`、`omdia-semiconductor`、`techinsights-semiconductor`

## 4. 剩余风险

- 外部网站页面结构可能变化，generic page extraction 只能提供 best-effort coverage。
- 部分外部站点当前存在 403、timeout 或区域访问限制，需要 source-specific adapter、替代 RSS/API 或禁用策略。
- 如果直接启用全部候选来源，调度器不会破坏其他 source，但可能增加 source fetch failure 噪音。

## 5. 下一步

- 决定 live smoke 未通过来源的处理策略：
  - 为高价值来源补 source-specific adapter 或替代 RSS/API。
  - 对无法稳定抓取的候选来源先禁用或移出 enabled registry。
- 处理完成后再把本 backlog 更新为 Completed。
