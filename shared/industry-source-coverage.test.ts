import { describe, expect, it } from "vitest"
import sources from "./sources"

const requestedSourceGroups: Record<string, string[]> = {
  "semiconductor": [
    "gartner-newsroom",
    "omdia-semiconductor",
    "trendforce-semiconductor",
    "techinsights-semiconductor",
    "yole-semiconductor",
    "semi-semiconductor",
    "semi-data",
    "wsts-press",
  ],
  "ai server and cloud infrastructure": [
    "idc-cloud-infrastructure",
    "gartner-newsroom",
    "canalys-cloud-infrastructure",
    "omdia-cloud-infrastructure",
  ],
  "optical modules and communication equipment": [
    "lightcounting-newsletter",
    "delloro-telecom",
    "omdia-optical-communications",
    "cignal-ai-optical",
  ],
  "power battery": [
    "sne-research-battery",
    "cabia-battery",
    "ggii-battery",
    "evtank-battery",
  ],
  "photovoltaic": [
    "chinapv-policy",
    "chinapv-news",
    "infolink-solar",
    "woodmac-renewables",
    "bnef-energy-transition",
  ],
  "robotics and industrial automation": [
    "ifr-robotics",
    "mir-automation",
    "ggii-robotics",
  ],
  "china manufacturing": [
    "miit-industry",
    "stats-industry",
    "customs-manufacturing",
    "ccid-consulting",
    "caict-reports",
    "chinaisa-stats",
    "caam-nev-stats",
    "chinania-stats",
  ],
}

const expectedTagCoverage = {
  "cloud-infrastructure": [
    "gartner-newsroom",
    "idc-cloud-infrastructure",
    "canalys-cloud-infrastructure",
    "omdia-cloud-infrastructure",
  ],
  "communication-equipment": [
    "lightcounting-newsletter",
    "delloro-telecom",
    "omdia-optical-communications",
    "cignal-ai-optical",
  ],
  "power-battery": [
    "sne-research-battery",
    "cabia-battery",
    "ggii-battery",
    "evtank-battery",
  ],
  "robotics": [
    "ifr-robotics",
    "mir-automation",
    "ggii-robotics",
  ],
  "manufacturing": [
    "miit-industry",
    "stats-industry",
    "customs-manufacturing",
    "ccid-consulting",
    "caict-reports",
  ],
} as const

describe("requested investment data source coverage", () => {
  it("registers every requested source as an investment-facing industry source", () => {
    const missing: string[] = []
    const invalid: string[] = []

    for (const [group, sourceIds] of Object.entries(requestedSourceGroups)) {
      for (const sourceId of sourceIds) {
        const source = sources[sourceId as keyof typeof sources]
        if (!source) {
          missing.push(`${group}:${sourceId}`)
          continue
        }
        if (
          source.redirect
          || source.column !== "industry"
          || !source.eventProfile
          || !source.tags?.length
        ) {
          invalid.push(`${group}:${sourceId}`)
        }
      }
    }

    expect(missing).toEqual([])
    expect(invalid).toEqual([])
  })

  it("adds canonical tags for newly covered industry verticals", () => {
    const missingCoverage: string[] = []

    for (const [tag, sourceIds] of Object.entries(expectedTagCoverage)) {
      for (const sourceId of sourceIds) {
        const source = sources[sourceId as keyof typeof sources]
        if (!source?.tags?.includes(tag as never)) {
          missingCoverage.push(`${tag}:${sourceId}`)
        }
      }
    }

    expect(missingCoverage).toEqual([])
  })
})
