import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import type {
  InvestmentActionBucket,
  InvestmentEventBrief,
  InvestmentProviderWatchlistDetailResponse,
  InvestmentWatchlistDetail,
} from "@shared/types"
import { industries } from "@shared/industry"
import type { AffectedMarket } from "@shared/event-profile"
import dayjs from "dayjs"
import type { ReactNode } from "react"
import { useTitle } from "react-use"
import { useRelativeTime } from "~/hooks/useRelativeTime"
import { myFetch } from "~/utils"

const sortOptions = [
  { label: "投资优先", value: "investment" },
  { label: "最新优先", value: "latest" },
] as const

const focusOptions = [
  { label: "全部事件", value: "all" },
  { label: "优先处理", value: "actionable" },
  { label: "优先处理 + 重点观察", value: "watchable" },
] as const

export const Route = createFileRoute("/watchlists/$watchlistId")({
  component: WatchlistDetailPage,
})

function WatchlistDetailPage() {
  const { watchlistId } = Route.useParams()
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]["value"]>("investment")
  const [focusMode, setFocusMode] = useState<(typeof focusOptions)[number]["value"]>("all")

  const query = useQuery({
    queryKey: ["watchlist-detail", watchlistId, sortBy, focusMode],
    queryFn: async (): Promise<InvestmentWatchlistDetail> => {
      const res = await myFetch<InvestmentProviderWatchlistDetailResponse>(`investment-watchlists/${watchlistId}`, {
        query: {
          limit: 30,
          sort: sortBy,
        },
      })
      if (focusMode === "all") return res.item

      const eventsRes = await myFetch<{ status: "success", items: InvestmentEventBrief[] }>(`investment-watchlists/${watchlistId}/events`, {
        query: {
          limit: 30,
          sort: sortBy,
          focus: focusMode,
        },
      })
      return {
        ...res.item,
        recentEvents: eventsRes.items,
      }
    },
    staleTime: 60 * 1000,
  })

  useTitle(query.data ? `NewsNow | ${query.data.name}` : "NewsNow | Watchlist")

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-3xl border border-neutral-400/10 px-5 py-12 text-center text-sm text-neutral-500">
          正在加载监控清单...
        </div>
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-3xl border border-red-400/20 bg-red-400/5 px-5 py-12 text-center text-sm text-red-500">
          监控清单加载失败，请稍后重试。
        </div>
      </div>
    )
  }

  const item = query.data
  const grouped = {
    actionable: item.recentEvents.filter(event => event.actionBucket === "actionable"),
    watch: item.recentEvents.filter(event => event.actionBucket === "watch"),
    noise: item.recentEvents.filter(event => event.actionBucket === "noise"),
  }
  const familySummary = summariseWatchlistFamilies(item.recentEvents)
  const marketSummary = summariseWatchlistMarkets(item.recentEvents)
  const nextChecks = collectDistinctLines(
    item.recentEvents.flatMap(event => event.whatToWatchNext),
    6,
  )
  const misreadRisks = collectDistinctLines(
    item.recentEvents.flatMap(event => event.riskOfMisread),
    4,
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackLink />

      <section className={$([
        "rounded-3xl border border-primary/12 bg-primary/2 px-5 py-5",
        "md:(px-6 py-6)",
      ])}
      >
        <div className="flex flex-col gap-3 md:(flex-row items-end justify-between)">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 font-semibold">
              监控清单视图
            </p>
            <div>
              <h1 className="text-3xl font-bold leading-tight md:text-4xl">
                {item.name}
              </h1>
              {item.description && (
                <p className="mt-2 text-sm text-neutral-500 md:text-base">
                  {item.description}
                </p>
              )}
            </div>
          </div>
          <div className="text-xs text-neutral-500">
            最近检查：
            {" "}
            {item.lastCheckedAt ? <Relative timestamp={item.lastCheckedAt} /> : "未检查"}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {item.query.entities?.map(value => <Badge key={`entity-${value}`} tone="subtle">主体：{value}</Badge>)}
          {item.query.topics?.map(value => <Badge key={`topic-${value}`} tone="subtle">赛道：{formatWatchlistTopic(value)}</Badge>)}
          {item.query.markets?.map(value => <Badge key={`market-${value}`} tone="subtle">市场：{formatWatchlistMarket(value)}</Badge>)}
          {!item.query.entities?.length && !item.query.topics?.length && !item.query.markets?.length && (
            <Badge tone="subtle">默认监控</Badge>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Metric label="可交易" value={String(grouped.actionable.length)} />
          <Metric label="先观察" value={String(grouped.watch.length)} />
          <Metric label="噪音较高" value={String(grouped.noise.length)} />
          <Metric label="最近命中" value={String(item.recentEvents.length)} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {sortOptions.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSortBy(option.value)}
              className={$([
                "rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer",
                sortBy === option.value
                  ? "border-primary/30 bg-primary/8 text-primary"
                  : "border-neutral-400/12 text-neutral-500 hover:bg-neutral-400/6",
              ])}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <SummaryCard
            title="高频事件家族"
            items={familySummary.map(item => `${item.label} · ${item.count}`)}
            empty="当前命中事件还不足以形成稳定家族分布。"
          />
          <SummaryCard
            title="主要影响市场"
            items={marketSummary.map(item => `${item.label} · ${item.count}`)}
            empty="当前样本不足以归纳主要影响市场。"
          />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <SummaryCard
            title="下一步重点确认"
            items={nextChecks}
            empty="当前暂无需要特别追加确认的事项。"
          />
          <SummaryCard
            title="主要误读风险"
            items={misreadRisks}
            empty="当前未发现明显误读风险。"
          />
        </div>
      </section>

      <section className="space-y-6">
        <EventSection
          title="可交易"
          description="优先处理。时效性、重要性和可执行性更高。"
          items={grouped.actionable}
        />
        <EventSection
          title="先观察"
          description="有投资意义，但还需要更多确认。"
          items={grouped.watch}
        />
        <EventSection
          title="噪音较高"
          description="更像背景信息或弱线索，不建议优先占用注意力。"
          items={grouped.noise}
        />
      </section>
    </div>
  )
}

function EventSection({ title, description, items }: { title: string, description: string, items: InvestmentEventBrief[] }) {
  if (!items.length) return null
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-neutral-500">{description}</p>
      </div>
      <div className="space-y-3">
        {items.map(item => <WatchlistEventCard key={item.eventId} item={item} />)}
      </div>
    </section>
  )
}

function SummaryCard({ title, items, empty }: { title: string, items: string[], empty: string }) {
  return (
    <div className="rounded-2xl bg-neutral-400/5 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{title}</p>
      <div className="mt-3 space-y-2 text-sm leading-6 text-neutral-600">
        {(items.length ? items : [empty]).map(line => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  )
}

function WatchlistEventCard({ item }: { item: InvestmentEventBrief }) {
  return (
    <article className="rounded-3xl border border-neutral-400/10 bg-base px-5 py-4 shadow-sm shadow-black/3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={actionBucketTone(item.actionBucket)}>{item.actionLabel}</Badge>
        <Badge tone="subtle">{item.eventFamilyLabel}</Badge>
        {!!item.whoIsAffected.length && (
          <Badge tone="subtle">
            {item.whoIsAffected.slice(0, 2).join(" / ")}
          </Badge>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-snug">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-neutral-500 line-clamp-2">{item.whyItMatters}</p>
          <p className="mt-2 text-xs text-neutral-500">{item.actionReason}</p>
        </div>
        <Link
          to="/events/$eventId"
          params={{ eventId: item.eventId }}
          className="shrink-0 rounded-full border border-primary/20 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/6 cursor-pointer"
        >
          查看事件
        </Link>
      </div>
      <div className="mt-4 grid gap-2 text-sm md:grid-cols-4">
        <Metric label="重要性" value={String(item.materialityScore)} />
        <Metric label="可交易性" value={String(item.tradabilityScore)} />
        <Metric label="权威度" value={String(item.authorityScore)} />
        <Metric label="当前动作" value={item.tradableNowLabel} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
        <span>{item.whatHappened}</span>
        <span>{formatTimestamp(item.publishedAt ?? item.latestLifecycleAt ?? Date.now())}</span>
        <Relative timestamp={item.latestLifecycleAt ?? item.publishedAt ?? Date.now()} />
      </div>
    </article>
  )
}

function BackLink() {
  return (
    <Link
      to="/watchlists"
      className="inline-flex items-center gap-2 rounded-full border border-neutral-400/12 px-3 py-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-400/6 cursor-pointer"
    >
      <span className="i-ph:arrow-left" />
      返回监控清单
    </Link>
  )
}

function Badge({ children, tone = "default" }: { children: ReactNode, tone?: "default" | "positive" | "neutral" | "subtle" }) {
  return (
    <span
      className={$(
        "inline-flex items-center rounded-full px-2 py-1 font-medium",
        tone === "positive" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
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

function Relative({ timestamp }: { timestamp: number }) {
  const relative = useRelativeTime(timestamp)
  return <span>{relative || dayjs(timestamp).format("MM-DD HH:mm")}</span>
}

function formatTimestamp(value: number) {
  return dayjs(value).format("MM-DD HH:mm")
}

function actionBucketTone(value: InvestmentActionBucket) {
  switch (value) {
    case "actionable": return "positive" as const
    case "watch": return "neutral" as const
    default: return "subtle" as const
  }
}

function summariseWatchlistFamilies(items: InvestmentEventBrief[]) {
  return [...items.reduce((acc, item) => {
    acc.set(item.eventFamilyLabel, (acc.get(item.eventFamilyLabel) ?? 0) + 1)
    return acc
  }, new Map<string, number>()).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => ({ label, count }))
}

function summariseWatchlistMarkets(items: InvestmentEventBrief[]) {
  return [...items.flatMap(item => item.affectedMarketLabels).reduce((acc, label) => {
    acc.set(label, (acc.get(label) ?? 0) + 1)
    return acc
  }, new Map<string, number>()).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => ({ label, count }))
}

function collectDistinctLines(lines: string[], limit: number) {
  const values = [...new Set(lines.map(item => item.trim()).filter(Boolean))]
  return values.slice(0, limit)
}

function formatWatchlistTopic(value: string) {
  return industries[value as keyof typeof industries] ?? value
}

function formatWatchlistMarket(value: AffectedMarket) {
  switch (value) {
    case "A": return "A股"
    case "HK": return "港股"
    case "CN_rates": return "中国资金面"
    case "CN_macro": return "中国宏观"
    case "global_macro": return "全球宏观"
    default: return value
  }
}
