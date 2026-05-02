import { describe, expect, it } from "vitest"
import { isBroadIndustryTagSet, resolveIndustryTagsFromKeywordQuery } from "./industry"

describe("industry keyword aliases", () => {
  it("maps Chinese vertical aliases into canonical industry tags", () => {
    expect(resolveIndustryTagsFromKeywordQuery("创新药")).toContain("medicine")
    expect(resolveIndustryTagsFromKeywordQuery("医药")).toContain("medicine")
    expect(resolveIndustryTagsFromKeywordQuery("AI算力")).toContain("ai-computing")
    expect(resolveIndustryTagsFromKeywordQuery("锂电")).toContain("new-energy-vehicle")
    expect(resolveIndustryTagsFromKeywordQuery("动力电池装机量")).toContain("power-battery")
    expect(resolveIndustryTagsFromKeywordQuery("光模块出货")).toContain("communication-equipment")
  })

  it("treats legacy all-sector tag lists as broad after canonical tag expansion", () => {
    expect(isBroadIndustryTagSet([
      "semiconductor",
      "photovoltaic",
      "new-energy-vehicle",
      "medicine",
      "ai-computing",
      "steel",
      "non-ferrous",
      "chemical",
    ])).toBe(true)

    expect(isBroadIndustryTagSet(["semiconductor", "ai-computing"])).toBe(false)
  })
})
