import type { SourceID } from "@shared/types"
import { compareEventShadow } from "#/services/event-engine/shadow"

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Number(query.limit ?? 100)
  const hours = Number(query.hours)
  const sourceIds = typeof query.sources === "string"
    ? query.sources.split(",").map(item => item.trim()).filter(Boolean) as SourceID[]
    : undefined

  const comparison = await compareEventShadow({
    sourceIds,
    since: Number.isFinite(hours) && hours > 0 ? Date.now() - hours * 60 * 60 * 1000 : undefined,
    limit: Number.isNaN(limit) ? 100 : Math.min(Math.max(limit, 1), 500),
  })

  return {
    status: "success",
    updatedTime: Date.now(),
    ...comparison,
  }
})
