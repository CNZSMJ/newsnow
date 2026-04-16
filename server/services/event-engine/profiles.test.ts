import { describe, expect, it } from "vitest"
import { getExchangeDisclosureMarkets, getSourceEventProfile } from "#/services/event-engine/profiles"

describe("event source profiles", () => {
  it("narrows exchange disclosure markets to the actual listing venue", () => {
    expect(getExchangeDisclosureMarkets("sse-latest")).toEqual(["A"])
    expect(getExchangeDisclosureMarkets("cninfo-szse")).toEqual(["A"])
    expect(getExchangeDisclosureMarkets("cninfo-hk-main")).toEqual(["HK"])
    expect(getExchangeDisclosureMarkets("hkexnews-latest")).toEqual(["HK"])
  })

  it("returns normalized exchange disclosure profiles for investor impact scoring", () => {
    expect(getSourceEventProfile("sse-latest")?.markets).toEqual(["A"])
    expect(getSourceEventProfile("cninfo-hk-disclosure")?.markets).toEqual(["HK"])
  })
})
