import type { SourceID } from "@shared/types"
import { backfillEventHistory } from "#/services/event-engine/scheduler"

export default defineEventHandler(async (event) => {
  if (event.context.disabledLogin) {
    throw createError({
      statusCode: 506,
      message: "Server not configured, disable login",
    })
  }
  if (!event.context.user?.id) {
    throw createError({
      statusCode: 401,
      message: "JWT verification failed",
    })
  }

  const body = await readBody<{
    sources?: SourceID[]
    hours?: number
    limit?: number
  }>(event)

  const res = await backfillEventHistory({
    sourceIds: body?.sources,
    hours: typeof body?.hours === "number" ? body.hours : undefined,
    limit: typeof body?.limit === "number" ? body.limit : undefined,
  })

  return {
    status: "success",
    updatedTime: Date.now(),
    ...res,
  }
})
