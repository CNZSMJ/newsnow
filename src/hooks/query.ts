import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { SourceID, SourceResponse } from "@shared/types"

export function useUpdateQuery() {
  const queryClient = useQueryClient()

  /**
   * update query
   */
  return useCallback(async (...sources: SourceID[]) => {
    await queryClient.refetchQueries({
      predicate: (query) => {
        const [type, id] = query.queryKey as ["source" | "entire", SourceID]
        return type === "source" && sources.includes(id)
      },
    })
  }, [queryClient])
}

export function useEntireQuery(items: SourceID[]) {
  const queryClient = useQueryClient()
  return useQuery({
    // sort in place
    queryKey: ["entire", [...items].sort()],
    queryFn: async ({ queryKey }) => {
      const sources = queryKey[1]
      if (sources.length === 0) return null
      const res: SourceResponse[] | undefined = await myFetch("s/entire", {
        method: "POST",
        body: {
          sources,
        },
      })
      if (res?.length) {
        res.forEach((v) => {
          const id = v.id
          if (!cacheSources.has(id) || cacheSources.get(id)!.updatedTime < v.updatedTime) {
            cacheSources.set(id, v)
            queryClient.setQueryData(["source", id], v)
          }
        })

        return res
      }
      return null
    },
    staleTime: 1000 * 60 * 3,
    retry: false,
  })
}
