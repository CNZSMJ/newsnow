import { describe, expect, it } from "vitest"
import { extractExchangeAnnouncementFacts } from "#/services/event-engine/extractors/exchange-announcement"

describe("extractExchangeAnnouncementFacts", () => {
  it("extracts security code and announcement subtype from CNInfo payload", () => {
    const facts = extractExchangeAnnouncementFacts({
      eventId: "evt_cninfo",
      rawId: "raw_cninfo",
      sourceId: "cninfo-sse",
      raw: {
        raw_id: "raw_cninfo",
        source_id: "cninfo-sse",
        source_item_id: "123",
        title: "贵州茅台：2025年年度报告",
        url: "https://static.cninfo.com.cn/demo.pdf",
        mobile_url: null,
        published_at: Date.UTC(2026, 3, 12, 0, 0, 0),
        fetched_at: Date.UTC(2026, 3, 12, 0, 5, 0),
        fingerprint: "fp",
        payload_json: "{}",
        status: "active",
      },
      payload: {
        id: "123",
        title: "贵州茅台：2025年年度报告",
        url: "https://static.cninfo.com.cn/demo.pdf",
        extra: {
          raw: {
            secCode: "600519",
            announcementTypeName: "年度报告",
          },
        },
      },
      eventSubType: "earnings",
    })

    expect(facts).toHaveLength(1)
    expect(facts[0]?.fact_type).toBe("exchange_announcement")
    expect(facts[0]?.metric_name).toBe("earnings")
    expect(facts[0]?.entity_id).toBe("600519")
  })
})
