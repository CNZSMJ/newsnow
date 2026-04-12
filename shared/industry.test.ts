import { describe, expect, it } from "vitest"
import { resolveIndustryTagsFromKeywordQuery } from "./industry"

describe("industry keyword aliases", () => {
  it("maps Chinese vertical aliases into canonical industry tags", () => {
    expect(resolveIndustryTagsFromKeywordQuery("创新药")).toContain("medicine")
    expect(resolveIndustryTagsFromKeywordQuery("医药")).toContain("medicine")
    expect(resolveIndustryTagsFromKeywordQuery("AI算力")).toContain("ai-computing")
    expect(resolveIndustryTagsFromKeywordQuery("锂电")).toContain("new-energy-vehicle")
  })
})
