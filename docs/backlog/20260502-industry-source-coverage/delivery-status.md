# Delivery Status

状态：Completed；默认启用来源 live smoke gate 通过，未稳定候选已禁用并记录
最后更新：2026-05-02
范围：行业源覆盖扩展的交付状态、验证记录和剩余风险

## 1. 当前状态

- backlog 六件套已建立。
- source registry 扩展已落地。
- industry research generic getter 已落地。
- broad-tag guardrail 已集中到 shared industry module。
- 默认启用的 industryResearch sources 已通过 live smoke。
- 未稳定候选来源已保留在 `shared/pre-sources.ts` 和 getter module 中，但 `disable: true`，不会进入默认 generated registry、UI、调度或在线 source fetch。

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
- 新增 `pnpm sources:smoke-industry`，默认检查 enabled industryResearch sources。
- 将 18 个不稳定候选来源禁用并记录恢复条件。

## 3. 验证记录

已通过：

- `pnpm exec tsx ./scripts/source.ts`
- `pnpm test -- shared/industry.test.ts shared/industry-source-coverage.test.ts server/sources/__tests__/industry-research.test.ts server/services/event-engine/resolver.test.ts server/database/events.test.ts shared/event-profile.test.ts`
- `pnpm typecheck`
- `pnpm docs:check`
- `pnpm perf:query-plans`
- `git diff --check`
- `pnpm build`
- `pnpm sources:smoke-industry`

Live source smoke：

- 默认 enabled 模式检查：9 个。
- 默认 enabled 模式结果：9 ok / 0 empty / 0 error。
- `--all` 候选池审计：27 个。
- `--all` 候选池结果：10 ok / 8 empty / 9 error。

已根据 smoke 结果收紧 generic extractor，过滤导航、社交、RSS、pricing、平台入口等非新闻条目。

当前禁用候选来源：

- `bnef-energy-transition`
- `cabia-battery`
- `canalys-cloud-infrastructure`
- `ccid-consulting`
- `cignal-ai-optical`
- `customs-manufacturing`
- `delloro-telecom`
- `gartner-newsroom`
- `ggii-battery`
- `ggii-robotics`
- `lightcounting-newsletter`
- `mir-automation`
- `omdia-cloud-infrastructure`
- `omdia-optical-communications`
- `omdia-semiconductor`
- `techinsights-semiconductor`
- `woodmac-renewables`
- `yole-semiconductor`

## 4. 剩余风险

- 外部网站页面结构可能变化，generic page extraction 只能提供 best-effort coverage。
- 禁用候选来源后，默认调度不再承担这些 403、timeout、fetch error 或 empty 结果。
- 后续如果恢复候选来源，必须先补 source-specific adapter、RSS/API 替代或更严格抽取规则，并重新通过 `pnpm sources:smoke-industry`。

## 5. 下一步

- 后续可单独开启小 PR，为高价值禁用候选补 source-specific adapter 或替代 RSS/API。
