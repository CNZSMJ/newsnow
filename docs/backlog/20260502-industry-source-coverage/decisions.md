# Decisions

状态：已接受；实现进入验证阶段
最后更新：2026-05-02
范围：行业源覆盖扩展的产品与技术决策

## Product Decisions

### PD-1 扩源目标服务投资事件，不服务泛新闻浏览

新增行业源必须进入 `industry` column，并具备投资事件可用的 `eventProfile` 和 canonical tags。

### PD-2 新增覆盖聚焦高投资相关产业链

本次新增覆盖聚焦：

- 半导体
- AI 服务器 / 云基础设施
- 光模块 / 通信设备
- 动力电池
- 光伏
- 机器人 / 工业自动化
- 中国制造业研究与进出口统计

### PD-3 扩源不能改变 backend truth 边界

source registry 和 getter 只提供输入，不成为投资语义来源。

canonical event semantics 仍由 backend event engine 统一计算。

## Technical Decisions

### TD-1 使用声明式 source registry 扩展来源

新增来源写入 `shared/pre-sources.ts`，再生成 `shared/sources.json` 和 `shared/pinyin.json`。

### TD-2 复用一个 industry research getter module

对以新闻稿、研究洞察页和 RSS 为主的行业研究来源，使用 `server/sources/industryResearch.ts` 提供统一 adapter。

专门结构化来源仍保留独立 getter。

### TD-3 Broad tag 判断必须集中在 `shared/industry.ts`

行业 tag 增长后，不能让 resolver 和查询层各自维护“多少 tag 算 broad”的判断。

统一使用 shared helper，保证写入侧和查询侧语义一致。

### TD-4 查询侧保留历史 broad-tag 兼容

旧 canonical rows 可能仍保存 8 个 legacy 行业 tag。查询侧必须继续把这种集合视为 broad，避免历史数据在 topic filter 下误入具体行业列表。
