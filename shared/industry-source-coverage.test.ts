import { describe, expect, it } from "vitest"
import { originSources } from "./pre-sources"
import sources from "./sources"

const enabledSourceGroups: Record<string, string[]> = {
  "semiconductor": [
    "trendforce-semiconductor",
    "semi-semiconductor",
    "semi-data",
    "wsts-press",
  ],
  "ai server and cloud infrastructure": [
    "idc-cloud-infrastructure",
  ],
  "global AI model and platform": [
    "openai-news",
    "google-ai-news",
    "google-deepmind-news",
    "microsoft-ai-news",
    "aws-ai-news",
  ],
  "global AI compute supply chain": [
    "nvidia-ai-news",
    "amd-ai-press",
    "intel-ai-press",
    "broadcom-ai-news",
    "asml-press",
  ],
  "power battery": [
    "sne-research-battery",
    "evtank-battery",
  ],
  "photovoltaic": [
    "chinapv-policy",
    "chinapv-news",
    "infolink-solar",
  ],
  "robotics and industrial automation": [
    "ifr-robotics",
  ],
  "china manufacturing": [
    "miit-industry",
    "stats-industry",
    "caict-reports",
    "chinaisa-stats",
    "caam-nev-stats",
    "chinania-stats",
  ],
}

const deferredCandidateSourceIds = [
  "gartner-newsroom",
  "omdia-semiconductor",
  "omdia-cloud-infrastructure",
  "omdia-optical-communications",
  "techinsights-semiconductor",
  "anthropic-news",
  "meta-ai-news",
  "yole-semiconductor",
  "canalys-cloud-infrastructure",
  "lightcounting-newsletter",
  "delloro-telecom",
  "cignal-ai-optical",
  "cabia-battery",
  "ggii-battery",
  "ggii-robotics",
  "woodmac-renewables",
  "bnef-energy-transition",
  "mir-automation",
  "customs-manufacturing",
  "ccid-consulting",
  "tsmc-latest",
] as const

const expectedTagCoverage = {
  "cloud-infrastructure": [
    "idc-cloud-infrastructure",
    "aws-ai-news",
    "nvidia-ai-news",
    "amd-ai-press",
    "intel-ai-press",
    "broadcom-ai-news",
  ],
  "ai-computing": [
    "openai-news",
    "google-ai-news",
    "google-deepmind-news",
    "microsoft-ai-news",
    "aws-ai-news",
    "nvidia-ai-news",
    "amd-ai-press",
    "intel-ai-press",
    "broadcom-ai-news",
  ],
  "power-battery": [
    "sne-research-battery",
    "evtank-battery",
  ],
  "semiconductor": [
    "nvidia-ai-news",
    "amd-ai-press",
    "intel-ai-press",
    "broadcom-ai-news",
    "asml-press",
  ],
  "robotics": [
    "ifr-robotics",
  ],
  "manufacturing": [
    "miit-industry",
    "stats-industry",
    "caict-reports",
  ],
} as const

function sourceCandidatesFromOriginSources() {
  const originSourceRecords = originSources as Record<string, any>
  const entries: Record<string, {
    disable?: boolean | "cf"
    column?: string
    eventProfile?: unknown
    tags?: readonly string[]
  }> = {}

  for (const [sourceId, source] of Object.entries(originSourceRecords)) {
    if (source.sub && Object.keys(source.sub).length) {
      for (const [subId, subSource] of Object.entries(source.sub)) {
        entries[`${sourceId}-${subId}`] = {
          ...source,
          ...(subSource as Record<string, unknown>),
        }
      }
    } else {
      entries[sourceId] = source
    }
  }

  return entries
}

describe("requested investment data source coverage", () => {
  it("registers every enabled source as an investment-facing industry source", () => {
    const missing: string[] = []
    const invalid: string[] = []

    for (const [group, sourceIds] of Object.entries(enabledSourceGroups)) {
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

  it("keeps unstable live-smoke candidates documented but disabled by default", () => {
    const candidates = sourceCandidatesFromOriginSources()
    const missing: string[] = []
    const stillEnabled: string[] = []
    const invalid: string[] = []

    for (const sourceId of deferredCandidateSourceIds) {
      const candidate = candidates[sourceId]
      if (!candidate) {
        missing.push(sourceId)
        continue
      }
      if (sources[sourceId as keyof typeof sources]) {
        stillEnabled.push(sourceId)
      }
      if (
        candidate.disable !== true
        || candidate.column !== "industry"
        || !candidate.eventProfile
        || !candidate.tags?.length
      ) {
        invalid.push(sourceId)
      }
    }

    expect(missing).toEqual([])
    expect(stillEnabled).toEqual([])
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
