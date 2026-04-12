import type { SourceID } from "@shared/types"
import { ingestEventSources } from "#/services/event-bus"

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
    force?: boolean
    replayRecentHours?: number
    replayLimit?: number
    replayRawIds?: string[]
  }>(event)
  const replayRecentHours = Number(body?.replayRecentHours)
  const res = await ingestEventSources({
    sourceIds: body?.sources,
    force: body?.force === true,
    replaySince: Number.isFinite(replayRecentHours) && replayRecentHours > 0
      ? Date.now() - replayRecentHours * 60 * 60 * 1000
      : undefined,
    replayLimit: typeof body?.replayLimit === "number" ? body.replayLimit : undefined,
    replayRawIds: body?.replayRawIds,
  })
  return {
    status: "success",
    updatedTime: res.updatedAt,
    ingestedSources: res.ingestedSources,
    replayedRawItems: res.replayedRawItems,
    removedEvents: res.removedEvents,
  }
})
