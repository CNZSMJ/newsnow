import { getCacheTable } from "#/database/cache"
import { getNewsSnapshotTable } from "#/database/news-snapshots"
import { getters } from "#/getters"
import { NewsQueryService } from "#/services/news-query/service"
import { getSharedSourceRuntime } from "#/services/source-runtime/shared"

export async function getNewsQueryService() {
  return new NewsQueryService({
    snapshots: await getNewsSnapshotTable(),
    cache: await getCacheTable(),
    refreshRuntime: getSharedSourceRuntime(),
    getters,
  })
}
