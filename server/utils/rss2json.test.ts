import { afterEach, describe, expect, it, vi } from "vitest"
import { myFetch } from "./fetch"
import { rss2json } from "./rss2json"

vi.mock("./fetch", () => ({
  myFetch: vi.fn(),
}))

const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AI Feed</title>
    <description>AI updates</description>
    <link>https://example.com</link>
    <item>
      <title>New AI accelerator</title>
      <link>https://example.com/ai-accelerator</link>
      <pubDate>Wed, 10 Jun 2026 15:26:45 +0000</pubDate>
      <description>AI infrastructure update</description>
    </item>
  </channel>
</rss>`

describe("rss2json", () => {
  afterEach(() => {
    vi.mocked(myFetch).mockReset()
  })

  it("parses RSS XML returned as a Blob", async () => {
    vi.mocked(myFetch).mockResolvedValue(new Blob([rssXml], { type: "application/rss+xml" }) as never)

    const rss = await rss2json("https://example.com/feed.xml")

    expect(rss?.title).toBe("AI Feed")
    expect(rss?.items).toEqual([
      expect.objectContaining({
        title: "New AI accelerator",
        link: "https://example.com/ai-accelerator",
        created: "Wed, 10 Jun 2026 15:26:45 +0000",
      }),
    ])
  })
})
