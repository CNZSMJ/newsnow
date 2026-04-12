import { useQuery } from "@tanstack/react-query"
import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router"
import type { WatchlistRecord } from "@shared/types"
import dayjs from "dayjs"
import type { ReactNode } from "react"
import { useTitle } from "react-use"
import { myFetch } from "~/utils"
import { useRelativeTime } from "~/hooks/useRelativeTime"

export const Route = createFileRoute("/watchlists")({
  component: WatchlistsPage,
})

function WatchlistsPage() {
  const pathname = useRouterState({
    select: state => state.location.pathname,
  })

  if (pathname !== "/watchlists") {
    return <Outlet />
  }

  return <WatchlistsListPage />
}

function WatchlistsListPage() {
  useTitle("NewsNow | Watchlists")

  const query = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => myFetch<{ status: "success", updatedTime: number, items?: WatchlistRecord[] }>("watchlists"),
    staleTime: 60 * 1000,
  })

  const items = query.data?.items ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className={$([
        "rounded-3xl border border-primary/12 bg-primary/2 px-5 py-5",
        "md:(px-6 py-6)",
      ])}
      >
        <div className="flex flex-col gap-3 md:(flex-row items-end justify-between)">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 font-semibold">
              Investor Watchlists
            </p>
            <div>
              <h1 className="text-3xl font-bold leading-tight md:text-4xl">
                监控清单
              </h1>
              <p className="mt-2 text-sm text-neutral-500 md:text-base">
                按统一事件语义查看你的重点主体、赛道和市场监控清单。
              </p>
            </div>
          </div>
          <div className="text-xs text-neutral-500">
            最近更新：
            {" "}
            {query.data?.updatedTime ? <Relative timestamp={query.data.updatedTime} /> : "加载中"}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {query.isPending && (
          <div className="rounded-2xl border border-neutral-400/10 px-4 py-10 text-center text-sm text-neutral-500">
            正在加载监控清单...
          </div>
        )}
        {query.isError && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-10 text-center text-sm text-red-500">
            监控清单加载失败，请稍后重试。
          </div>
        )}
        {!query.isPending && !query.isError && !items.length && (
          <div className="rounded-2xl border border-neutral-400/10 px-4 py-10 text-center text-sm text-neutral-500">
            当前还没有监控清单。
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {items.map(item => <WatchlistCard key={item.watchlistId} item={item} />)}
        </div>
      </section>
    </div>
  )
}

function WatchlistCard({ item }: { item: WatchlistRecord }) {
  const filters = [
    item.query.entities?.length ? `主体 ${item.query.entities.length}` : undefined,
    item.query.topics?.length ? `赛道 ${item.query.topics.length}` : undefined,
    item.query.markets?.length ? `市场 ${item.query.markets.length}` : undefined,
    item.query.eventTypes?.length ? `类型 ${item.query.eventTypes.length}` : undefined,
  ].filter(Boolean)

  return (
    <article className="rounded-3xl border border-neutral-400/10 bg-base px-5 py-4 shadow-sm shadow-black/3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug">
            {item.name}
          </h2>
          {item.description && (
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              {item.description}
            </p>
          )}
        </div>
        <Link
          to="/watchlists/$watchlistId"
          params={{ watchlistId: item.watchlistId }}
          className="shrink-0 rounded-full border border-primary/20 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/6 cursor-pointer"
        >
          查看详情
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {filters.length
          ? filters.map(label => (
              <Badge key={label} tone="subtle">
                {label}
              </Badge>
            ))
          : <Badge tone="subtle">默认监控</Badge>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
        <span>ID：{item.watchlistId}</span>
        <span>创建于：{dayjs(item.createdAt).format("MM-DD HH:mm")}</span>
        <span>
          最近检查：
          {" "}
          {item.lastCheckedAt ? <Relative timestamp={item.lastCheckedAt} /> : "未检查"}
        </span>
      </div>
    </article>
  )
}

function Badge({ children, tone = "default" }: { children: ReactNode, tone?: "default" | "subtle" }) {
  return (
    <span
      className={$(
        "inline-flex items-center rounded-full px-2 py-1 font-medium",
        tone === "subtle" ? "bg-neutral-400/10 text-neutral-500" : "bg-primary/10 text-primary",
      )}
    >
      {children}
    </span>
  )
}

function Relative({ timestamp }: { timestamp: number }) {
  const relative = useRelativeTime(timestamp)
  return <span>{relative || dayjs(timestamp).format("MM-DD HH:mm")}</span>
}
