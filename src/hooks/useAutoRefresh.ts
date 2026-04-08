import type { SourceID } from "@shared/types"
import { ultraFastSourceIds } from "@shared/realtime"
import { useUpdateQuery } from "./query"
import { autoRefreshSources } from "~/utils/data"

const UltraFastInterval = 60 * 1000

export function useAutoRefresh(items: SourceID[]) {
  const updateQuery = useUpdateQuery()

  const ultraFastSources = useMemo(() => {
    return items.filter(id => ultraFastSourceIds.includes(id))
  }, [items])

  useEffect(() => {
    if (ultraFastSources.length === 0) return

    const timer = window.setInterval(() => {
      ultraFastSources.forEach(id => autoRefreshSources.add(id))
      updateQuery(...ultraFastSources)
    }, UltraFastInterval)

    return () => window.clearInterval(timer)
  }, [ultraFastSources, updateQuery])
}
