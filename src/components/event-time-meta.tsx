import dayjs from "dayjs"
import { useRelativeTime } from "~/hooks/useRelativeTime"

interface EventTimeLike {
  publishedAt?: number | null
  ingestedAt?: number | null
  latestLifecycleAt?: number | null
}

const timeFields = [
  { key: "publishedAt", label: "发布时间" },
  { key: "ingestedAt", label: "集成时间" },
  { key: "latestLifecycleAt", label: "最后更新时间" },
] as const satisfies Array<{
  key: keyof EventTimeLike
  label: string
}>

export function EventTimeMeta({
  item,
  compact = false,
  showEmpty = false,
}: {
  item: EventTimeLike
  compact?: boolean
  showEmpty?: boolean
}) {
  const entries = timeFields
    .map(field => ({
      ...field,
      timestamp: item[field.key] ?? undefined,
    }))
    .filter(entry => showEmpty || Boolean(entry.timestamp))

  if (!entries.length) return null

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "grid gap-2 md:grid-cols-3"}>
      {entries.map(entry => (
        <EventTimeEntry
          key={entry.key}
          label={entry.label}
          timestamp={entry.timestamp}
          compact={compact}
          showRelative={entry.key === "latestLifecycleAt"}
        />
      ))}
    </div>
  )
}

function EventTimeEntry({
  label,
  timestamp,
  compact,
  showRelative,
}: {
  label: string
  timestamp?: number
  compact: boolean
  showRelative: boolean
}) {
  const relative = useRelativeTime(timestamp ?? 0)
  const displayValue = timestamp ? dayjs(timestamp).format("MM-DD HH:mm") : "待补充"

  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1 rounded-full bg-neutral-400/6 px-2.5 py-1 text-[11px] text-neutral-500">
        <span className="text-neutral-400">{label}</span>
        <span>{displayValue}</span>
        {timestamp && showRelative && relative && (
          <span className="text-neutral-400">{relative}</span>
        )}
      </span>
    )
  }

  return (
    <div className="rounded-2xl bg-neutral-400/6 px-3 py-3">
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p className="mt-1 text-sm font-medium">{displayValue}</p>
      {timestamp && showRelative && relative && (
        <p className="mt-1 text-xs text-neutral-400">{relative}</p>
      )}
    </div>
  )
}
