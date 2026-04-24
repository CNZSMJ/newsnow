import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { SourceID, SourceResponse } from "@shared/types"
import sources from "@shared/sources"
import type { NewsQueryService } from "#/services/news-query/service"

interface GetHottestLatestNewsInput {
  id: string
  count: number
}

interface GetHottestLatestNewsOptions {
  service?: Pick<NewsQueryService, "getSource">
}

function normalizeCount(count: number) {
  if (Number.isNaN(count) || count < 1) return 10
  return Math.min(Math.trunc(count), 100)
}

function assertSourceId(id: string): asserts id is SourceID {
  if (!sources[id as SourceID]) throw new Error(`Invalid source id: ${id}`)
}

async function resolveNewsQueryService(
  options: GetHottestLatestNewsOptions,
): Promise<Pick<NewsQueryService, "getSource">> {
  if (options.service) return options.service
  const { getNewsQueryService } = await import("#/services/news-query/factory")
  return await getNewsQueryService()
}

export async function getHottestLatestNews(
  input: GetHottestLatestNewsInput,
  options: GetHottestLatestNewsOptions = {},
): Promise<CallToolResult> {
  const count = normalizeCount(Number(input.count))
  assertSourceId(input.id)

  const service = await resolveNewsQueryService(options)
  const response: SourceResponse = await service.getSource({
    sourceId: input.id,
    intervalMs: sources[input.id].interval,
    forceRefresh: false,
  })
  const items = response.items.slice(0, count)

  return {
    structuredContent: {
      sourceId: response.id,
      sourceName: sources[response.id].name,
      status: response.status,
      updatedTime: response.updatedTime,
      count: items.length,
      items: items.map(item => ({
        id: item.id,
        title: item.title,
        url: item.url,
      })),
    },
    content: items.map(item => ({
      text: `[${item.title}](${item.url})`,
      type: "text" as const,
    })),
  }
}
