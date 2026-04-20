import { Version } from "@shared/consts"
import { getEventTable } from "#/database/events"
import { getEventBusWorkerStatus } from "#/services/event-bus"
import { getMissingLoginConfigKeys, isLoginConfigured } from "#/utils/login-config"

export default defineEventHandler(async () => {
  const updatedTime = Date.now()
  const worker = getEventBusWorkerStatus()
  const loginEnabled = isLoginConfigured(process.env)
  const databaseReady = Boolean(await getEventTable())
  const healthy = databaseReady
    && (!worker.enabled || (worker.started && !worker.lastError))

  return {
    status: "success",
    service: "newsnow",
    version: Version,
    updatedTime,
    healthy,
    login: {
      enabled: loginEnabled,
      missingConfig: loginEnabled ? [] : getMissingLoginConfigKeys(process.env),
    },
    database: {
      ready: databaseReady,
    },
    worker,
  }
})
