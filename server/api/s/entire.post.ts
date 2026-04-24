import type { SourceID, SourceResponse } from "@shared/types"
import { getNewsQueryService } from "#/services/news-query/factory"

export default defineEventHandler(async (event) => {
  try {
    const { sources: _ }: { sources: SourceID[] } = await readBody(event)
    const ids = _?.filter(k => sources[k])
    if (!ids?.length) return [] as SourceResponse[]

    const service = await getNewsQueryService()
    return await service.getSourcesBatch({
      sourceIds: ids,
      getIntervalMs: sourceId => sources[sourceId].interval,
      waitUntil: event.context.waitUntil?.bind(event.context),
    })
  } catch {
    //
  }
})
