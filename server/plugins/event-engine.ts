import { getEventTable } from "#/database/events"
import { getWatchlistTable } from "#/database/watchlists"
import { ensureEventBusWorkerStarted } from "#/services/event-bus"

export default defineNitroPlugin(async () => {
  await Promise.allSettled([
    getEventTable(),
    getWatchlistTable(),
  ])
  ensureEventBusWorkerStarted()
})
