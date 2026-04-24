import type { SourceID, SourceResponse } from "@shared/types"
import { getters } from "#/getters"
import { getNewsQueryService } from "#/services/news-query/factory"

export default defineEventHandler(async (event): Promise<SourceResponse> => {
  try {
    const query = getQuery(event)
    const latest = query.latest !== undefined && query.latest !== "false"
    let id = query.id as SourceID
    const isValid = (id: SourceID) => !id || !sources[id] || !getters[id]

    if (isValid(id)) {
      const redirectID = sources?.[id]?.redirect
      if (redirectID) id = redirectID
      if (isValid(id)) throw new Error("Invalid source id")
    }

    const service = await getNewsQueryService()
    return await service.getSource({
      sourceId: id,
      intervalMs: sources[id].interval,
      forceRefresh: latest && (event.context.disabledLogin || Boolean(event.context.user)),
      waitUntil: event.context.waitUntil?.bind(event.context),
    })
  } catch (e: any) {
    logger.error(e)
    throw createError({
      statusCode: 500,
      message: e instanceof Error ? e.message : "Internal Server Error",
    })
  }
})
