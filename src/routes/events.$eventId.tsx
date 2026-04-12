import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import type { DirectionalView } from "@shared/event-profile"
import { industries } from "@shared/industry"
import type {
  InvestmentActionBucket,
  InvestmentEventBrief,
  InvestmentEventDetail,
  InvestmentEventEvidence,
  InvestmentEventFact,
  InvestmentProviderEventDetailResponse,
  InvestmentTimelineEntry,
  WatchlistRecord,
} from "@shared/types"
import dayjs from "dayjs"
import { useTitle } from "react-use"
import { useRelativeTime } from "~/hooks/useRelativeTime"
import { myFetch } from "~/utils"
import { getMatchingWatchlists } from "~/utils/watchlist-links"

export const Route = createFileRoute("/events/$eventId")({
  component: EventDetailPage,
})

function EventDetailPage() {
  const { eventId } = Route.useParams()

  const query = useQuery({
    queryKey: ["event-detail", eventId],
    queryFn: async (): Promise<InvestmentEventDetail> => {
      const res = await myFetch<InvestmentProviderEventDetailResponse>(`investment-events/${eventId}`)
      return res.item
    },
    staleTime: 60 * 1000,
  })
  const watchlistsQuery = useQuery({
    queryKey: ["watchlists-quick-links", "detail"],
    queryFn: () => myFetch<{ status: "success", updatedTime: number, items?: WatchlistRecord[] }>("watchlists"),
    staleTime: 5 * 60 * 1000,
  })

  useTitle(query.data ? `NewsNow | ${query.data.title}` : "NewsNow | 事件详情")

  if (query.isPending) {
    return (
      <div className="rounded-3xl border border-neutral-400/10 px-5 py-12 text-center text-sm text-neutral-500">
        正在加载事件详情...
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-3xl border border-red-400/20 bg-red-400/5 px-5 py-12 text-center text-sm text-red-500">
          事件详情加载失败，请稍后重试。
        </div>
      </div>
    )
  }

  const item = query.data
  const matchingWatchlists = getMatchingWatchlists(item, watchlistsQuery.data?.items ?? [], 3)
  const titleClassName = getDetailTitleClassName(item.title)
  const interpretationLines = buildInterpretationLines(item)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackLink />

      <section className={$([
        "rounded-3xl border border-primary/12 bg-primary/2 px-5 py-5",
        "md:(px-6 py-6)",
      ])}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={actionBucketTone(item.actionBucket)}>{item.actionLabel}</Badge>
          <Badge>{item.eventFamilyLabel}</Badge>
          <Badge tone={directionTone(item.signalDirection)}>{item.signalDirectionLabel}</Badge>
          <Badge tone="subtle">{item.tradableNowLabel}</Badge>
          {item.affectedMarketLabels.map(marketLabel => (
            <Badge key={marketLabel} tone="subtle">{marketLabel}</Badge>
          ))}
          {item.relatedTopics.slice(0, 3).map(tag => (
            <Badge key={tag} tone="subtle">{industries[tag]}</Badge>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-4 md:(flex-row justify-between items-start)">
          <div className="min-w-0">
            <h1 className={titleClassName}>
              {item.title}
            </h1>
            {item.summary && (
              <p className="mt-3 max-w-4xl text-sm leading-7 text-neutral-600 md:text-base">
                {item.summary}
              </p>
            )}
          </div>
          {item.canonicalUrl && (
            <a
              href={item.canonicalUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full border border-primary/20 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/6 cursor-pointer"
            >
              查看原文
            </a>
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-primary/5 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/70">投资解读</p>
          <div className="mt-2 space-y-3 text-sm leading-6 text-neutral-600">
            {interpretationLines.map(line => <p key={line}>{line}</p>)}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <PromptCard title="发生了什么" items={[item.whatHappened]} />
          <PromptCard title="影响对象" items={item.whoIsAffected.length ? item.whoIsAffected : [item.subjectSummary]} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <PromptCard title="下一步要看什么" items={item.whatToWatchNext} />
          <PromptCard title="误读风险" items={item.riskOfMisread} empty="当前误读风险较低" />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Metric label="当前层级" value={item.actionLabel} />
          <Metric label="重要性" value={formatScore(item.materialityScore, item.materialityInsight.band)} note={item.materialityInsight.note} />
          <Metric label="可交易性" value={formatScore(item.tradabilityScore, item.tradabilityInsight.band)} note={item.tradabilityInsight.note} />
          <Metric label="当前动作" value={item.tradableNowLabel} />
        </div>
        <div className="mt-3 rounded-2xl bg-neutral-400/5 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{getActionReasonTitle(item.actionBucket)}</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">{item.actionReason}</p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Metric label="权威度" value={formatScore(item.authorityScore, item.authorityInsight.band)} note={item.authorityInsight.note} />
          <Metric label="方向置信度" value={formatScore(item.signalConfidence, item.signalConfidenceInsight.band)} note={item.signalConfidenceInsight.note} />
        </div>
        {!!matchingWatchlists.length && (
          <div className="mt-3 rounded-2xl bg-neutral-400/5 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">关联监控清单</p>
                <p className="mt-1 text-sm text-neutral-500">这条事件已经命中现有监控维度，可直接跳转到对应清单查看最近的连续事件。</p>
              </div>
              <Link
                to="/watchlists"
                className="rounded-full border border-neutral-400/12 px-3 py-1.5 text-xs text-neutral-500 transition-colors hover:bg-neutral-400/6 cursor-pointer"
              >
                查看全部清单
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {matchingWatchlists.map(watchlist => (
                <Link
                  key={`${item.eventId}-${watchlist.watchlistId}`}
                  to="/watchlists/$watchlistId"
                  params={{ watchlistId: watchlist.watchlistId }}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/6 cursor-pointer"
                >
                  进入清单：{watchlist.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
          <span>{item.subjectSummary}</span>
          <span>发布时间：{formatTimestamp(item.publishedAt ?? item.latestLifecycleAt ?? Date.now())}</span>
          <RelativeStamp timestamp={item.latestLifecycleAt ?? item.publishedAt ?? Date.now()} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <InfoCard title="结构化事实" count={item.keyFacts.length}>
            {!item.keyFacts.length && <EmptyText text="当前事件暂无高价值结构化事实。" />}
            <div className="space-y-3">
              {item.keyFacts.map(fact => <FactCard key={`${fact.evidenceId ?? fact.label}-${fact.label}`} fact={fact} />)}
            </div>
          </InfoCard>

          <InfoCard title="证据来源" count={item.evidence.length}>
            {!item.evidence.length && <EmptyText text="当前事件暂无有效证据来源。" />}
            <div className="space-y-3">
              {item.evidence.map(evidence => <EvidenceCard key={evidence.evidenceId} evidence={evidence} />)}
            </div>
          </InfoCard>
        </div>

        <div className="space-y-6">
          <InfoCard title="事件演化" count={item.timelineSummary.length}>
            {!item.timelineSummary.length && <EmptyText text="当前事件暂无演化记录。" />}
            <div className="space-y-3">
              {item.timelineSummary.map(entry => <TimelineCard key={entry.timelineId} entry={entry} />)}
            </div>
          </InfoCard>

          <InfoCard title="相关事件" count={item.relatedEvents?.reduce((total, section) => total + section.items.length, 0) ?? 0}>
            {!item.relatedEvents?.length && <EmptyText text="当前暂无同主体、同赛道或同市场的高相关事件。" />}
            <div className="space-y-4">
              {item.relatedEvents?.map(section => (
                <div key={`${section.context}-${section.label}`} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-neutral-500">{section.displayLabel}</p>
                    <span className="text-xs text-neutral-400">{section.items.length}</span>
                  </div>
                  <div className="space-y-3">
                    {section.items.map(related => <RelatedEventCard key={related.eventId} item={related} />)}
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard title="后续跟踪对象" count={item.affectedEntities.length}>
            {!item.affectedEntities.length && <EmptyText text="当前暂无可用于串联后续事件的跟踪对象。" />}
            {!!item.affectedEntities.length && (
              <p className="mb-3 text-xs leading-5 text-neutral-500">
                这些对象用于把当前事件和后续同主体、同赛道、同市场的事件串起来。只有标注为“交易标的”的对象，才更接近直接可交易对象。
              </p>
            )}
            <div className="space-y-2">
              {item.affectedEntities.map(entity => (
                <div key={`${entity.entityType}-${entity.entityId}`} className="rounded-2xl bg-neutral-400/5 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge>{entity.entityTypeLabel}</Badge>
                    {entity.market && <Badge tone="subtle">{entity.market === "A" ? "A股" : entity.market === "HK" ? "港股" : entity.market}</Badge>}
                  </div>
                  <p className="mt-2 font-medium">{entity.label}</p>
                  {entity.code && <p className="mt-1 text-neutral-500">{entity.code}</p>}
                </div>
              ))}
            </div>
          </InfoCard>
        </div>
      </section>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/events"
      className="inline-flex items-center gap-2 rounded-full border border-neutral-400/12 px-3 py-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-400/6 cursor-pointer"
    >
      <span className="i-ph:arrow-left" />
      返回事件流
    </Link>
  )
}

function PromptCard({ title, items, empty }: { title: string, items: string[], empty?: string }) {
  return (
    <div className="rounded-2xl bg-neutral-400/5 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{title}</p>
      <div className="mt-3 space-y-2 text-sm leading-6 text-neutral-600">
        {(items.length ? items : [empty ?? "暂无"]).map(line => <p key={line}>{line}</p>)}
      </div>
    </div>
  )
}

function buildInterpretationLines(item: InvestmentEventDetail) {
  const lines = [item.whyItMatters]
  const thesis = item.thesis?.trim()
  if (
    thesis
    && thesis !== item.whyItMatters
    && thesis !== item.actionReason
    && !thesis.includes(item.actionReason)
  ) {
    lines.push(thesis)
  }
  return lines.filter((line, index, arr) => !!line && arr.indexOf(line) === index)
}

function FactCard({ fact }: { fact: InvestmentEventFact }) {
  const lines = [
    fact.value !== undefined && fact.value !== null ? { label: fact.valueLabel ?? "当前值", value: formatFactValue(fact.value, fact.unit) } : undefined,
    fact.previousValue !== undefined && fact.previousValue !== null ? { label: fact.previousValueLabel ?? "前值", value: formatFactValue(fact.previousValue, fact.unit) } : undefined,
    fact.delta !== undefined && fact.delta !== null ? { label: fact.deltaLabel ?? "变化", value: String(fact.delta) } : undefined,
    fact.directionLabel ? { label: "方向", value: fact.directionLabel } : undefined,
    fact.entity ? { label: fact.entity.entityTypeLabel, value: fact.entity.label } : undefined,
  ].filter(Boolean) as Array<{ label: string, value: string }>
  const showConfidenceHint = fact.confidence < 0.65

  return (
    <div className="rounded-2xl bg-neutral-400/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge>{fact.label}</Badge>
        {shouldShowMetricName(fact) && <Badge tone="subtle">{fact.metricName}</Badge>}
      </div>
      {fact.summary && <p className="mt-2 text-sm leading-6 text-neutral-500">{fact.summary}</p>}
      <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
        {lines.map(line => (
          <p key={line.label}>
            <span className="text-neutral-400">{line.label}：</span>
            <span>{line.value}</span>
          </p>
        ))}
      </div>
      {showConfidenceHint && <p className="mt-2 text-xs text-amber-500/90">这条事实仍偏线索型，使用时需要更多证据确认。</p>}
    </div>
  )
}

function EvidenceCard({ evidence }: { evidence: InvestmentEventEvidence }) {
  return (
    <div className="rounded-2xl bg-neutral-400/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge>{evidence.sourceName}</Badge>
        {evidence.sourceTitle && <Badge tone="subtle">{evidence.sourceTitle}</Badge>}
        <Badge tone="subtle">{evidence.authorityLabel}</Badge>
      </div>
      <p className="mt-2 text-sm font-medium leading-6">{evidence.title}</p>
      {evidence.summary && <p className="mt-1 text-sm leading-6 text-neutral-500">{evidence.summary}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
        {evidence.publishedAt && <span>{formatTimestamp(evidence.publishedAt)}</span>}
        {evidence.extractionStatus !== "ready" && <span>证据处理：{evidence.extractionStatusLabel}</span>}
        {evidence.url && (
          <a href={evidence.url} target="_blank" rel="noreferrer" className="text-primary hover:underline cursor-pointer">
            打开来源
          </a>
        )}
      </div>
    </div>
  )
}

function TimelineCard({ entry }: { entry: InvestmentTimelineEntry }) {
  return (
    <div className="rounded-2xl bg-neutral-400/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge>{entry.label}</Badge>
          {entry.sourceName && <Badge tone="subtle">{entry.sourceName}</Badge>}
        </div>
        <span className="text-xs text-neutral-500">{formatTimestamp(entry.changedAt)}</span>
      </div>
      {entry.note && <p className="mt-2 text-sm text-neutral-500">{entry.note}</p>}
      {(entry.relatedEventTitle || entry.relatedEventUrl) && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
          {entry.relatedEventTitle && <span>被归并事件：{entry.relatedEventTitle}</span>}
          {entry.relatedEventId && !entry.relatedEventUrl && <span>ID：{entry.relatedEventId}</span>}
          {entry.relatedEventUrl && (
            <a
              href={entry.relatedEventUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline cursor-pointer"
            >
              查看被归并事件原文
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function RelatedEventCard({ item }: { item: InvestmentEventBrief }) {
  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: item.eventId }}
      className="block rounded-2xl bg-neutral-400/5 px-4 py-3 transition-colors hover:bg-neutral-400/8 cursor-pointer"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={actionBucketTone(item.actionBucket)}>{item.actionLabel}</Badge>
        <Badge>{item.eventFamilyLabel}</Badge>
        <Badge tone={directionTone(item.signalDirection)}>{item.signalDirectionLabel}</Badge>
      </div>
      <p className="mt-2 text-sm font-medium leading-6">{item.title}</p>
      <p className="mt-1 text-xs text-neutral-500 line-clamp-2">{item.whyItMatters}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
        <span>{item.tradableNowLabel}</span>
        <span>{formatScore(item.materialityScore)} 分重要性</span>
        <span>{formatTimestamp(item.publishedAt ?? item.latestLifecycleAt ?? Date.now())}</span>
      </div>
    </Link>
  )
}

function InfoCard({ title, count, children }: { title: string, count: number, children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-neutral-400/10 bg-base px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-xs text-neutral-500">{count}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Badge({ children, tone = "default" }: { children: React.ReactNode, tone?: "default" | "positive" | "negative" | "neutral" | "subtle" }) {
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

function Metric({ label, value, note }: { label: string, value: string, note?: string }) {
  return (
    <div className="rounded-2xl bg-neutral-400/6 px-3 py-2">
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
      {note && <p className="mt-1 text-xs leading-5 text-neutral-500">{note}</p>}
    </div>
  )
}

function getDetailTitleClassName(title: string) {
  const length = title.trim().length

  if (length > 160) {
    return "text-xl font-semibold leading-snug md:text-2xl"
  }

  if (length > 90) {
    return "text-2xl font-semibold leading-snug md:text-3xl"
  }

  return "text-3xl font-bold leading-tight md:text-4xl"
}

function EmptyText({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-neutral-400/10 px-4 py-8 text-center text-sm text-neutral-500">
      {text}
    </div>
  )
}

function RelativeStamp({ timestamp }: { timestamp: number }) {
  const relative = useRelativeTime(timestamp)
  return <span>{relative || formatTimestamp(timestamp)}</span>
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

function formatFactValue(value: string | number | boolean, unit?: string | null) {
  const text = String(value)
  if (!unit) return text
  if (unit === "%") return `${text}%`
  if (unit === "bp") return `${text}bp`
  if (unit === "CNY_100M") return `${text} 亿元`
  return `${text} ${unit}`
}

function shouldShowMetricName(fact: InvestmentEventFact) {
  if (!fact.metricName) return false
  if (fact.metricName === fact.label) return false
  if (fact.metricName.length > 28) return false
  return true
}

function formatTimestamp(value: number) {
  return dayjs(value).format("MM-DD HH:mm")
}

function getActionReasonTitle(value: InvestmentActionBucket) {
  switch (value) {
    case "actionable":
      return "为何现在值得优先处理"
    case "watch":
      return "为何当前更适合先观察"
    default:
      return "为何当前不宜优先处理"
  }
}

function formatScore(value?: number, band?: string) {
  if (value === undefined) return "--"
  return band ? `${value}（${band}）` : `${value}`
}
