import { getEventTable } from "#/database/events"
import { getWatchlistTable } from "#/database/watchlists"
import { ensureEventBusWorkerStarted, listLatestEvents } from "#/services/event-bus"

export default defineNitroPlugin(async () => {
  await Promise.allSettled([
    getEventTable(),
    getWatchlistTable(),
    listLatestEvents({
      limit: 40,
      sortBy: "investment",
      includeTotalCount: false,
    }),
  ])
  ensureEventBusWorkerStarted()
})
