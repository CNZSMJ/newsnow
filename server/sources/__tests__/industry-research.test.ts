import { describe, expect, it } from "vitest"
import industryResearchSources, { extractGenericIndustryPageItems } from "../industryResearch"

const industryResearchSourceIds = [
  "gartner-newsroom",
  "omdia-semiconductor",
  "omdia-cloud-infrastructure",
  "omdia-optical-communications",
  "trendforce-semiconductor",
  "techinsights-semiconductor",
  "yole-semiconductor",
  "wsts-press",
  "idc-cloud-infrastructure",
  "canalys-cloud-infrastructure",
  "lightcounting-newsletter",
  "delloro-telecom",
  "cignal-ai-optical",
  "sne-research-battery",
  "cabia-battery",
  "ggii-battery",
  "ggii-robotics",
  "evtank-battery",
  "chinapv-news",
  "infolink-solar",
  "woodmac-renewables",
  "bnef-energy-transition",
  "ifr-robotics",
  "mir-automation",
  "customs-manufacturing",
  "ccid-consulting",
  "caict-reports",
]

describe("generic industry research page extraction", () => {
  it("exports getters for all industry research sources", () => {
    const getters = industryResearchSources as Record<string, unknown>
    const missingGetters = industryResearchSourceIds.filter(sourceId => typeof getters[sourceId] !== "function")

    expect(missingGetters).toEqual([])
  })

  it("extracts dated unique items and filters them by investment keywords", () => {
    const html = `
      <main>
        <nav>
          <a href="/research">Market Research</a>
          <a href="/spot-price">Spot price</a>
          <a href="/company/linkedin">Linkedin</a>
        </nav>
        <article>
          <a href="/reports/semiconductor-2026">Global semiconductor capex outlook</a>
          <time>2026-03-15</time>
          <p>Semiconductor equipment spending keeps rising.</p>
        </article>
        <article>
          <a href="/reports">>>MORE</a>
          <p>Semiconductor reports archive</p>
        </article>
        <article>
          <a href="/reports/semiconductor-2026">Global semiconductor capex outlook</a>
          <span>2026-03-15</span>
        </article>
        <article>
          <a href="/reports/ai-server">AI server supply chain update</a>
          <span>April 02, 2026</span>
        </article>
        <nav>
          <a href="/about">About</a>
        </nav>
      </main>
    `

    const items = extractGenericIndustryPageItems({
      html,
      baseUrl: "https://example.com/news/",
      keywords: [/semiconductor/i, "AI server"],
    })

    expect(items).toEqual([
      {
        id: "https://example.com/reports/semiconductor-2026",
        title: "Global semiconductor capex outlook",
        url: "https://example.com/reports/semiconductor-2026",
        pubDate: "2026-03-15",
        extra: {
          info: "Semiconductor equipment spending keeps rising.",
        },
      },
      {
        id: "https://example.com/reports/ai-server",
        title: "AI server supply chain update",
        url: "https://example.com/reports/ai-server",
        pubDate: "April 02, 2026",
      },
    ])
  })
})
