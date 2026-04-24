import type { SourceResponse } from "@shared/types"
import { describe, expect, it, vi } from "vitest"
import { getHottestLatestNews } from "./news-tools"

function sourceResponse(): SourceResponse {
  return {
    id: "wallstreetcn-quick",
    status: "cache",
    updatedTime: 1000,
    items: [
      {
        id: "n-1",
        title: "first",
        url: "https://example.com/first",
      },
      {
        id: "n-2",
        title: "second",
        url: "https://example.com/second",
      },
    ],
  }
}

describe("mcp news tools", () => {
  it("serves get_hotest_latest_news from News Query Service and exposes structured content", async () => {
    const getSource = vi.fn(async () => sourceResponse())

    const result = await getHottestLatestNews(
      { id: "wallstreetcn-quick", count: 1 },
      { service: { getSource } },
    )

    expect(getSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "wallstreetcn-quick",
      forceRefresh: false,
      intervalMs: expect.any(Number),
    }))
    expect(result.structuredContent).toMatchObject({
      sourceId: "wallstreetcn-quick",
      sourceName: "华尔街见闻",
      status: "cache",
      updatedTime: 1000,
      count: 1,
      items: [
        {
          id: "n-1",
          title: "first",
          url: "https://example.com/first",
        },
      ],
    })
    expect(result.content).toEqual([
      {
        type: "text",
        text: "[first](https://example.com/first)",
      },
    ])
  })
})
