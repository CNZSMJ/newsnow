import { ensureEventBusWorkerStarted } from "#/services/event-bus"

export default defineNitroPlugin(() => {
  ensureEventBusWorkerStarted()
})
