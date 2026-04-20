import { useQuery } from "@tanstack/react-query"
import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router"
import type { AffectedMarket, DirectionalView } from "@shared/event-profile"
import { allIndustryTags, industries, type IndustryTag } from "@shared/industry"
import type { ReactNode } from "react"
import type {
  EventType,
  InvestmentActionBucket,
  InvestmentEventBrief,
  InvestmentEventFamily,
  InvestmentProviderEventListResponse,
  WatchlistRecord,
} from "@shared/types"
import { useTitle } from "react-use"
import { EventTimeMeta } from "~/components/event-time-meta"
import { myFetch } from "~/utils"
import { useRelativeTime } from "~/hooks/useRelativeTime"
import { getMatchingWatchlists } from "~/utils/watchlist-links"

const sortOptions = [
  { label: "投资优先", value: "investment" },
  { label: "最新优先", value: "latest" },
] as const

const eventTypeOptions = [
  { label: "全部事件", value: "all" },
  { label: "政策", value: "policy" },
  { label: "宏观", value: "macro" },
  { label: "公告", value: "announcement" },
  { label: "产业", value: "industry" },
  { label: "盘口异动", value: "market_move" },
] as const satisfies Array<{ label: string, value: "all" | EventType }>

const marketOptions = [
  { label: "全部市场", value: "all" },
  { label: "A 股", value: "A" },
  { label: "港股", value: "HK" },
  { label: "资金面", value: "CN_rates" },
  { label: "中国宏观", value: "CN_macro" },
  { label: "全球宏观", value: "global_macro" },
] as const satisfies Array<{ label: string, value: "all" | AffectedMarket }>

const directionalOptions = [
  { label: "全部方向", value: "all" },
  { label: "偏正向", value: "positive" },
  { label: "偏负向", value: "negative" },
  { label: "中性", value: "neutral" },
  { label: "混合", value: "mixed" },
  { label: "方向待定", value: "unknown" },
] as const satisfies Array<{ label: string, value: "all" | DirectionalView }>

const familyOptions = [
  { label: "全部家族", value: "all" },
  { label: "资金与利率", value: "rates_liquidity" },
  { label: "宏观数据", value: "macro_print" },
  { label: "政策", value: "policy" },
  { label: "政策线索", value: "policy_signal" },
  { label: "业绩", value: "earnings" },
  { label: "融资", value: "financing" },
  { label: "公司动作", value: "corporate_action" },
  { label: "公告线索", value: "disclosure_signal" },
  { label: "交易状态", value: "trading_status" },
  { label: "产业数据", value: "industry_data" },
  { label: "行业报告", value: "industry_report" },
  { label: "行业动态", value: "industry_news" },
  { label: "传闻澄清", value: "rumor_clarification" },
  { label: "盘口异动", value: "market_move" },
  { label: "一般资讯", value: "general_news" },
] as const satisfies Array<{ label: string, value: "all" | InvestmentEventFamily }>

const industryOptions = [
  { label: "全部产业", value: "all" },
  ...allIndustryTags.map(tag => ({ label: industries[tag], value: tag })),
] as const

const actionBucketOrder: InvestmentActionBucket[] = ["actionable", "watch", "noise"]
const focusOptions = [
  { label: "全部事件", value: "all" },
  { label: "优先处理", value: "actionable" },
  { label: "优先处理 + 重点观察", value: "watchable" },
] as const

const queryModeOptions = [
  { label: "默认扫描", value: "feed" },
  { label: "关键词检索", value: "search" },
  { label: "主体检索", value: "entity" },
] as const

export const Route = createFileRoute("/events")({
  component: EventsPage,
})

function EventsPage() {
  const pathname = useRouterState({
    select: state => state.location.pathname,
  })

  if (pathname !== "/events") {
    return <Outlet />
  }

  return <EventsListPage />
}

function EventsListPage() {

  useTitle("NewsNow | 事件")

  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]["value"]>("investment")
  const [eventType, setEventType] = useState<(typeof eventTypeOptions)[number]["value"]>("all")
  const [eventFamily, setEventFamily] = useState<(typeof familyOptions)[number]["value"]>("all")
  const [market, setMarket] = useState<(typeof marketOptions)[number]["value"]>("all")
  const [directionalView, setDirectionalView] = useState<(typeof directionalOptions)[number]["value"]>("all")
  const [industry, setIndustry] = useState<(typeof industryOptions)[number]["value"]>("all")
  const [focusMode, setFocusMode] = useState<(typeof focusOptions)[number]["value"]>("all")
  const [queryMode, setQueryMode] = useState<(typeof queryModeOptions)[number]["value"]>("feed")
  const [draftQuery, setDraftQuery] = useState("")
  const [activeQuery, setActiveQuery] = useState("")
  const [compactMode, setCompactMode] = useState(false)
  const [visibleLimit, setVisibleLimit] = useState(40)
  const searchEnabled = queryMode === "feed" || !!activeQuery.trim()

  useEffect(() => {
    setVisibleLimit(40)
  }, [sortBy, eventType, eventFamily, market, directionalView, industry, focusMode, queryMode, activeQuery])

  const watchlistsQuery = useQuery({
    queryKey: ["watchlists-quick-links"],
    queryFn: () => myFetch<{ status: "success", updatedTime: number, items?: WatchlistRecord[] }>("watchlists"),
    staleTime: 5 * 60 * 1000,
  })

  const query = useQuery({
    queryKey: ["events", {
      sortBy,
      eventType,
      eventFamily,
      market,
      directionalView,
      industry,
      focusMode,
      queryMode,
      activeQuery,
      visibleLimit,
    }],
    queryFn: async () => {
      const baseQuery = {
        limit: visibleLimit,
        sort: sortBy,
        focus: focusMode === "all" ? undefined : focusMode,
        event_family: eventFamily === "all" ? undefined : eventFamily,
        market: market === "all" ? undefined : market,
        directional_view: directionalView === "all" ? undefined : directionalView,
        topic: industry === "all" ? undefined : industry,
      }
      const res = queryMode === "search"
        ? await myFetch<InvestmentProviderEventListResponse>("investment-events/search", {
            query: {
              ...baseQuery,
              q: activeQuery,
            },
          })
        : queryMode === "entity"
          ? await myFetch<InvestmentProviderEventListResponse>("investment-events/entity", {
              query: {
                ...baseQuery,
                entity: activeQuery,
              },
            })
          : await myFetch<InvestmentProviderEventListResponse>("investment-events/latest", {
              query: {
                ...baseQuery,
                event_type: eventType === "all" ? undefined : eventType,
              },
            })
      return res
    },
    enabled: searchEnabled,
    staleTime: 60 * 1000,
  })
  const updatedRelative = useRelativeTime(query.data?.updatedTime ?? 0)

  const updatedTime = query.data?.updatedTime
  const allItems = query.data?.items ?? []
  const visibleItems = allItems
  const displayedCount = query.data?.displayedCount ?? visibleItems.length
  const totalCount = query.data?.totalCount ?? displayedCount
  const hasMore = Boolean(query.data?.hasMore)
  const groupedItems = actionBucketOrder
    .map(bucket => ({
      bucket,
      items: visibleItems.filter(item => item.actionBucket === bucket),
    }))
    .filter(group => group.items.length > 0)
  const marketCounts = visibleItems
    .flatMap(item => item.affectedMarkets)
    .reduce((acc, market) => {
      acc[market] = (acc[market] ?? 0) + 1
      return acc
    }, {} as Partial<Record<AffectedMarket, number>>)
  const topMarkets = Object.entries(marketCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3) as Array<[AffectedMarket, number]>
  const actionableHighlights = visibleItems
    .filter(item => item.actionBucket === "actionable")
    .slice(0, 3)

  return (
    <div className="mx-auto max-w-7xl">
      <section className={$([
        "rounded-3xl border border-primary/12 bg-primary/2 px-5 py-5",
        "md:(px-6 py-6)",
      ])}
      >
        <div className="flex flex-col gap-3 md:(flex-row items-end justify-between)">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 font-semibold">
              投资决策视图
            </p>
            <div>
              <h1 className="text-3xl font-bold leading-tight md:text-4xl">
                结构化事件流
              </h1>
              <p className="mt-2 text-sm text-neutral-500 md:text-base">
                按投资优先级浏览政策、宏观、公告和产业事件，直接看方向、重要性与影响摘要。
              </p>
            </div>
          </div>
          <div className="text-xs text-neutral-500">
            最近更新：
            {" "}
            {updatedTime ? updatedRelative ?? "刚刚" : "加载中"}
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-6">
          <FilterSelect
            label="排序"
            value={sortBy}
            onChange={setSortBy}
            options={sortOptions}
          />
          <FilterSelect
            label="事件类型"
            value={eventType}
            onChange={setEventType}
            options={eventTypeOptions}
            disabled={queryMode !== "feed"}
          />
          <FilterSelect
            label="事件家族"
            value={eventFamily}
            onChange={setEventFamily}
            options={familyOptions}
          />
          <FilterSelect
            label="市场"
            value={market}
            onChange={setMarket}
            options={marketOptions}
          />
          <FilterSelect
            label="方向"
            value={directionalView}
            onChange={setDirectionalView}
            options={directionalOptions}
          />
          <FilterSelect
            label="产业"
            value={industry}
            onChange={setIndustry}
            options={industryOptions}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {focusOptions.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFocusMode(option.value)}
              className={$([
                "rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer",
                focusMode === option.value
                  ? "border-primary/30 bg-primary/8 text-primary"
                  : "border-neutral-400/12 text-neutral-500 hover:bg-neutral-400/6",
              ])}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCompactMode(value => !value)}
            className={$([
              "rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer",
              compactMode
                ? "border-primary/30 bg-primary/8 text-primary"
                : "border-neutral-400/12 text-neutral-500 hover:bg-neutral-400/6",
            ])}
          >
            {compactMode ? "退出高密度模式" : "高密度模式"}
          </button>
          <Link
            to="/watchlists"
            className="rounded-full border border-neutral-400/12 px-3 py-1.5 text-xs text-neutral-500 transition-colors hover:bg-neutral-400/6 cursor-pointer"
          >
            打开监控清单
          </Link>
        </div>
        <div className="mt-4 rounded-2xl bg-neutral-400/5 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {queryModeOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setQueryMode(option.value)}
                className={$([
                  "rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer",
                  queryMode === option.value
                    ? "border-primary/30 bg-primary/8 text-primary"
                    : "border-neutral-400/12 text-neutral-500 hover:bg-neutral-400/6",
                ])}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 md:(flex-row items-center)">
            <input
              value={draftQuery}
              onChange={event => setDraftQuery(event.currentTarget.value)}
              placeholder={queryMode === "entity" ? "输入主体名、股票代码或全代码" : queryMode === "search" ? "输入关键词或政策表述" : "默认扫描模式下无需输入"}
              disabled={queryMode === "feed"}
              className="min-w-0 flex-1 rounded-2xl border border-neutral-400/12 bg-base px-4 py-2 text-sm outline-none transition-colors focus:border-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveQuery(draftQuery.trim())}
                disabled={queryMode === "feed" || !draftQuery.trim()}
                className="rounded-full border border-primary/20 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/6 disabled:cursor-not-allowed disabled:opacity-50"
              >
                开始检索
              </button>
              {queryMode !== "feed" && activeQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftQuery("")
                    setActiveQuery("")
                  }}
                  className="rounded-full border border-neutral-400/12 px-4 py-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-400/6"
                >
                  清空
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {queryMode === "feed"
              ? "默认扫描适合快速看今天最值得处理的事件。"
              : queryMode === "entity"
                ? "主体检索适合回看某个公司、代码或机构的相关事件。"
                : "关键词检索适合回看某条政策线索、主题催化或新闻表述。"}
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-neutral-400/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">行动层级</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {actionBucketOrder.map(bucket => (
                <Badge key={bucket} tone={actionBucketTone(bucket)}>
                  {formatActionBucket(bucket)}
                  {" "}
                  {visibleItems.filter(item => item.actionBucket === bucket).length}
                </Badge>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-neutral-400/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">主要影响市场</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {topMarkets.length
                ? topMarkets.map(([market, count]) => (
                    <Badge key={market} tone="subtle">
                      {formatMarket(market)}
                      {" "}
                      {count}
                    </Badge>
                  ))
                : <span className="text-neutral-500">当前样本不足</span>}
            </div>
          </div>
          <div className="rounded-2xl bg-neutral-400/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">样本范围</p>
            <div className="mt-3 space-y-1 text-sm text-neutral-600">
              <p>
                当前展示
                {" "}
                <span className="font-semibold">{displayedCount}</span>
                {" "}
                条
              </p>
              <p>
                基础筛选命中
                {" "}
                <span className="font-semibold">{totalCount}</span>
                {" "}
                条
              </p>
              <p className="text-xs text-neutral-500">
                事件页默认按当前筛选展示前若干条结果，用于快速扫描，不代表事件库只有这些数据。
              </p>
            </div>
          </div>
        </div>
        {!!actionableHighlights.length && (
          <div className="mt-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-500/80">优先处理提示</p>
                <p className="mt-1 text-sm text-neutral-500">这几条事件具备更高的即时处理价值，先看原因再决定是否进入交易或风控动作。</p>
              </div>
              <Badge tone="positive">{actionableHighlights.length} 条高优先级</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {actionableHighlights.map(item => (
                <div key={`highlight-${item.eventId}`} className="rounded-2xl bg-base/70 px-4 py-3">
                  <div className="flex flex-col gap-3 md:(flex-row items-start justify-between)">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-6">{item.title}</p>
                      <p className="mt-1 text-sm text-neutral-600">{item.actionReason}</p>
                    </div>
                    <Link
                      to="/events/$eventId"
                      params={{ eventId: item.eventId }}
                      className="shrink-0 rounded-full border border-emerald-500/20 px-3 py-1.5 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/8 cursor-pointer"
                    >
                      进入详情
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
          <span>
            当前展示前
            {" "}
            {displayedCount}
            {" "}
            条
            {totalCount > displayedCount && (
              <>
                {" · "}
                基础筛选命中
                {" "}
                {totalCount}
                {" "}
                条
              </>
            )}
            {queryMode !== "feed" && activeQuery && ` · ${queryMode === "entity" ? "主体检索" : "关键词检索"}：${activeQuery}`}
            {industry !== "all" && ` · ${industries[industry]}`}
            {queryMode === "feed" && eventType !== "all" && ` · ${eventTypeOptions.find(option => option.value === eventType)?.label}`}
            {eventFamily !== "all" && ` · ${familyOptions.find(option => option.value === eventFamily)?.label}`}
            {market !== "all" && ` · ${marketOptions.find(option => option.value === market)?.label}`}
            {focusMode !== "all" && ` · ${focusOptions.find(option => option.value === focusMode)?.label}`}
          </span>
          {query.isFetching && !query.isPending && (
            <span className="text-primary">正在按筛选条件更新...</span>
          )}
        </div>
        {query.isPending && (
          <div className="rounded-2xl border border-neutral-400/10 px-4 py-10 text-center text-sm text-neutral-500">
            正在加载事件流...
          </div>
        )}
        {query.isError && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-10 text-center text-sm text-red-500">
            事件流加载失败，请稍后重试。
          </div>
        )}
        {!searchEnabled && (
          <div className="rounded-2xl border border-neutral-400/10 px-4 py-10 text-center text-sm text-neutral-500">
            输入关键词或主体后开始检索。
          </div>
        )}
        {searchEnabled && !query.isPending && !query.isError && !visibleItems.length && (
          <div className="rounded-2xl border border-neutral-400/10 px-4 py-10 text-center text-sm text-neutral-500">
            当前筛选条件下暂无事件。
          </div>
        )}
        {searchEnabled && groupedItems.map(group => (
          <section key={group.bucket} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-400/10 bg-neutral-400/4 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {formatActionBucket(group.bucket)}
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  {formatActionBucketDescription(group.bucket)}
                </p>
              </div>
              <span className="text-xs text-neutral-500">
                {group.items.length}
                {" "}
                条
              </span>
            </div>
            {group.items.map(item => (
              <EventCard
                key={item.eventId}
                item={item}
                compact={compactMode}
                activeIndustry={industry === "all" ? undefined : industry}
                watchlists={getMatchingWatchlists(item, watchlistsQuery.data?.items ?? [], 2)}
              />
            ))}
          </section>
        ))}
        {searchEnabled && !query.isPending && !query.isError && hasMore && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => setVisibleLimit(limit => Math.min(limit + 40, 400))}
              className="rounded-full border border-primary/20 px-5 py-2 text-sm text-primary transition-colors hover:bg-primary/6 cursor-pointer"
            >
              加载更多
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function FilterSelect<T extends string>(props: {
  label: string
  value: T
  onChange: (value: T) => void
  options: readonly { label: string, value: T }[]
  disabled?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs text-neutral-500">{props.label}</span>
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={event => props.onChange(event.target.value as T)}
        className={$([
          "rounded-2xl border border-neutral-400/15 bg-base px-3 py-2 text-sm cursor-pointer",
          "outline-none transition-colors focus:(border-primary/40)",
          props.disabled && "cursor-not-allowed opacity-60",
        ])}
      >
        {props.options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function EventCard({
  item,
  compact,
  activeIndustry,
  watchlists,
}: {
  item: InvestmentEventBrief
  compact: boolean
  activeIndustry?: IndustryTag
  watchlists: WatchlistRecord[]
}) {
  const visibleTopicTags = getVisibleTopicTags(item.relatedTopics, activeIndustry)

  return (
    <article className={$([
      "rounded-3xl border border-neutral-400/10 bg-base px-5 py-4",
      "shadow-sm shadow-black/3",
      compact && "px-4 py-3",
    ])}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={actionBucketTone(item.actionBucket)}>{item.actionLabel}</Badge>
        <Badge>{item.eventFamilyLabel}</Badge>
        {item.latestLifecycleState && <Badge tone="subtle">{formatLifecycle(item.latestLifecycleState)}</Badge>}
        {item.signalDirection && <Badge tone={directionTone(item.signalDirection)}>{item.signalDirectionLabel}</Badge>}
        {!!item.affectedMarkets.length && item.affectedMarketLabels.slice(0, 3).map(marketLabel => (
          <Badge key={marketLabel} tone="subtle">{marketLabel}</Badge>
        ))}
        {!!visibleTopicTags.length && visibleTopicTags.map(tag => (
          <Badge key={tag} tone={tag === activeIndustry ? "default" : "subtle"}>{industries[tag]}</Badge>
        ))}
      </div>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug">
            {item.title}
          </h2>
          {item.whatHappened && item.whatHappened !== item.title ? (
            <p className="mt-2 text-sm leading-6 text-neutral-500 line-clamp-2">
              {item.whatHappened}
            </p>
          ) : item.summary ? (
            <p className="mt-2 text-sm leading-6 text-neutral-500 line-clamp-3">
              {item.summary}
            </p>
          ) : null}
        </div>
        {item.canonicalUrl && (
          <a
            href={item.canonicalUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full border border-primary/20 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/6 cursor-pointer"
          >
            查看原文
          </a>
        )}
      </div>

      {!!item.whyItMatters && !compact && (
        <div className="mt-3 rounded-2xl bg-primary/4 px-3 py-3 text-sm leading-6 text-neutral-600">
          <p>{item.whyItMatters}</p>
          <p className="mt-2 text-xs text-neutral-500">{item.actionReason}</p>
        </div>
      )}
      {!!item.whyItMatters && compact && (
        <div className="mt-3 rounded-2xl bg-primary/4 px-3 py-2">
          <p className="text-sm leading-6 text-neutral-600">{item.actionReason}</p>
        </div>
      )}

      <div className={$([
        "mt-4 grid gap-2 text-sm md:grid-cols-4",
        compact && "md:grid-cols-3",
      ])}
      >
        <Metric label="重要性" value={formatScore(item.materialityScore)} />
        <Metric label="可交易性" value={formatScore(item.tradabilityScore)} />
        <Metric label="权威度" value={formatScore(item.authorityScore)} />
        {!compact && <Metric label="当前动作" value={item.tradableNowLabel} />}
      </div>

      <div className="mt-4 space-y-2 text-xs text-neutral-500">
        <span className="block">{item.subjectSummary}</span>
        <EventTimeMeta item={item} compact />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          to="/events/$eventId"
          params={{ eventId: item.eventId }}
          className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/6 cursor-pointer"
        >
          查看详情
          <span className="i-ph:arrow-up-right text-sm" />
        </Link>
        {watchlists.map(watchlist => (
          <Link
            key={`${item.eventId}-${watchlist.watchlistId}`}
            to="/watchlists/$watchlistId"
            params={{ watchlistId: watchlist.watchlistId }}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-400/12 px-3 py-1.5 text-xs text-neutral-500 transition-colors hover:bg-neutral-400/6 cursor-pointer"
          >
            进入清单：{watchlist.name}
          </Link>
        ))}
      </div>
    </article>
  )
}

function Badge({ children, tone = "default" }: {
  children: ReactNode
  tone?: "default" | "positive" | "negative" | "neutral" | "subtle"
}) {
  return (
    <span
      className={$(
        "inline-flex items-center rounded-full px-2 py-1 font-medium",
        tone === "positive" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
        tone === "negative" && "bg-red-500/10 text-red-500 dark:text-red-300",
        tone === "neutral" && "bg-amber-500/10 text-amber-600 dark:text-amber-300",
        tone === "subtle" && "bg-neutral-400/10 text-neutral-500",
        tone === "default" && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </span>
  )
}

function Metric({ label, value }: { label: string, value: string }) {
  return (
    <div className="rounded-2xl bg-neutral-400/6 px-3 py-2">
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}

function formatScore(value?: number) {
  return value === undefined ? "--" : `${value}`
}

function formatActionBucket(value: InvestmentActionBucket) {
  switch (value) {
    case "actionable": return "可交易"
    case "watch": return "先观察"
    default: return "噪音较高"
  }
}

function formatActionBucketDescription(value: InvestmentActionBucket) {
  switch (value) {
    case "actionable":
      return "具备较高时效性、重要性和执行价值，适合优先进入盘前/盘中决策。"
    case "watch":
      return "有投资意义，但还需要更多确认或后续数据验证。"
    default:
      return "当前更像背景信息或弱线索，不建议优先占用注意力。"
  }
}

function directionTone(value: DirectionalView) {
  switch (value) {
    case "positive": return "positive" as const
    case "negative": return "negative" as const
    case "neutral": return "neutral" as const
    default: return "subtle" as const
  }
}

function actionBucketTone(value: InvestmentActionBucket) {
  switch (value) {
    case "actionable": return "positive" as const
    case "watch": return "neutral" as const
    default: return "subtle" as const
  }
}

function formatLifecycle(value: InvestmentEventBrief["latestLifecycleState"]) {
  switch (value) {
    case "detected": return "发现"
    case "updated": return "更新"
    case "confirmed": return "确认"
    case "resolved": return "结束"
    default: return "状态"
  }
}

function formatMarket(value: AffectedMarket) {
  switch (value) {
    case "A": return "A股"
    case "HK": return "港股"
    case "CN_rates": return "资金面"
    case "CN_macro": return "中国宏观"
    case "global_macro": return "全球宏观"
    default: return value
  }
}

function getVisibleTopicTags(tags: IndustryTag[], activeIndustry?: IndustryTag) {
  if (!tags.length) return [] as IndustryTag[]
  if (!activeIndustry || !tags.includes(activeIndustry)) return tags.slice(0, 2)
  const ordered = [activeIndustry, ...tags.filter(tag => tag !== activeIndustry)]
  return ordered.slice(0, 2)
}
