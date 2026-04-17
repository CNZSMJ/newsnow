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
    expect(JSON.parse(facts[0]?.payload_json ?? "{}")).toMatchObject({
      announcementTitle: "贵州茅台：2025年年度报告",
      announcementTypeName: "年度报告",
      securityCode: "600519",
      securityName: "贵州茅台",
      market: "A",
      actionKind: null,
      announcementStage: null,
      financingPath: null,
      ownershipDirection: null,
      isFormalDisclosure: true,
      raw: {
        secCode: "600519",
        announcementTypeName: "年度报告",
      },
    })
  })

  it.each([
    {
      label: "financing",
      eventSubType: "financing" as const,
      title: "向特定对象发行股票募集说明书",
      announcementTypeName: "再融资",
      expected: {
        actionKind: "financing",
        announcementStage: "pre_disclosure",
        financingPath: "refinancing",
        ownershipDirection: null,
      },
    },
    {
      label: "buyback",
      eventSubType: "buyback" as const,
      title: "关于回购公司股份方案的公告",
      announcementTypeName: "回购",
      expected: {
        actionKind: "buyback",
        announcementStage: "proposal",
        financingPath: null,
        ownershipDirection: null,
      },
    },
    {
      label: "dividend",
      eventSubType: "dividend" as const,
      title: "2025年度利润分配预案公告",
      announcementTypeName: "权益分派",
      expected: {
        actionKind: "dividend",
        announcementStage: "proposal",
        financingPath: null,
        ownershipDirection: null,
      },
    },
    {
      label: "shareholding_change",
      eventSubType: "shareholding_change" as const,
      title: "关于控股股东减持公司股份预披露公告",
      announcementTypeName: "减持预披露",
      expected: {
        actionKind: "shareholding_change",
        announcementStage: "pre_disclosure",
        financingPath: null,
        ownershipDirection: "decrease",
      },
    },
  ])("normalizes structured disclosure payloads for $label", ({ eventSubType, title, announcementTypeName, expected }) => {
    const facts = extractExchangeAnnouncementFacts({
      eventId: `evt_${eventSubType}`,
      rawId: `raw_${eventSubType}`,
      sourceId: "cninfo-sse",
      raw: {
        raw_id: `raw_${eventSubType}`,
        source_id: "cninfo-sse",
        source_item_id: "123",
        title: `贵州茅台：${title}`,
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
        title: `贵州茅台：${title}`,
        url: "https://static.cninfo.com.cn/demo.pdf",
        extra: {
          raw: {
            secCode: "600519",
            secName: "贵州茅台",
            announcementTitle: title,
            announcementTypeName,
          },
        },
      },
      eventSubType,
    })

    expect(facts).toHaveLength(1)
    expect(facts[0]?.fact_type).toBe("exchange_announcement")
    expect(facts[0]?.metric_name).toBe(eventSubType)
    expect(facts[0]?.entity_id).toBe("600519")
    expect(JSON.parse(facts[0]?.payload_json ?? "{}")).toMatchObject({
      announcementTitle: title,
      announcementTypeName,
      securityCode: "600519",
      securityName: "贵州茅台",
      market: "A",
      isFormalDisclosure: true,
      ...expected,
      raw: {
        secCode: "600519",
        secName: "贵州茅台",
        announcementTitle: title,
        announcementTypeName,
      },
    })
  })
})
