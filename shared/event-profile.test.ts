import { describe, expect, it } from "vitest"
import sources from "./sources"

const inScopeFamilies = [
  "pbc-",
  "chinamoney-",
  "cninfo-",
  "sse-",
  "hkexnews-",
  "safe-",
  "csrc-",
  "miit-",
  "ndrc-",
  "stats-",
  "nea-",
  "nhsa-",
  "chinaisa-",
  "chinania-",
  "chinapv-",
  "caam-",
  "caict-",
  "semi-",
  "cnchemicals-",
  "cde-",
  "cls-",
  "wallstreetcn-",
  "mktnews-",
  "gelonghui",
  "fastbull-",
  "jin10",
  "eastmoney-",
  "sina-",
] as const

describe("phase 1 source families declare event profiles", () => {
  it("all in-scope source ids carry eventProfile in generated sources", () => {
    const missing = Object.entries(sources)
      .filter(([sourceId, source]) => {
        if (source.redirect) return false
        const inScope = inScopeFamilies.some(prefix => sourceId === prefix || sourceId.startsWith(prefix))
        if (!inScope) return false
        return !source.eventProfile
      })
      .map(([sourceId]) => sourceId)

    expect(missing).toEqual([])
  })
})
