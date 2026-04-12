import type { EventProfile } from "@shared/event-profile"
import { sourceKindAllowedEventTypes } from "@shared/event-profile"
import type { SourceID } from "@shared/types"
import sources from "@shared/sources"

function getLegacyProfile(sourceId: SourceID): EventProfile | undefined {
  const [mainId] = sourceId.split("-")
  if (["pbc", "safe", "csrc", "gov", "sasac", "mof", "mofcom"].includes(mainId)) {
    return {
      sourceKind: "official_policy_notice",
      defaultEventType: "policy",
      authorityLevel: "official",
      parserFamily: "policy",
      assetClasses: ["equity", "rates", "fx", "commodity", "credit", "fund"],
      markets: ["A", "HK", "CN_rates", "CN_macro", "global_macro"],
    }
  }
  if (["stats"].includes(mainId)) {
    return {
      sourceKind: "official_macro_release",
      defaultEventType: "macro",
      defaultEventSubType: "macro_data",
      authorityLevel: "official",
      parserFamily: "macro_release",
      assetClasses: ["equity", "rates", "fx", "commodity", "credit", "fund"],
      markets: ["CN_macro"],
    }
  }
  if (["cninfo", "sse", "hkexnews"].includes(mainId)) {
    return {
      sourceKind: "exchange_disclosure",
      defaultEventType: "announcement",
      authorityLevel: "exchange",
      parserFamily: "exchange_announcement",
      assetClasses: ["equity", "fund"],
      markets: ["A", "HK"],
    }
  }
  if (sources[sourceId]?.column === "industry") {
    return {
      sourceKind: "industry_stat_release",
      defaultEventType: "industry",
      authorityLevel: "association",
      parserFamily: "industry_stat",
      assetClasses: ["equity", "commodity"],
      markets: ["A", "HK", "CN_macro"],
    }
  }
  return undefined
}

export function getSourceEventProfile(sourceId: SourceID) {
  return sources[sourceId]?.eventProfile ?? getLegacyProfile(sourceId)
}

export function validateSourceEventProfile(sourceId: SourceID) {
  const profile = getSourceEventProfile(sourceId)
  if (!profile) return
  const allowedTypes = sourceKindAllowedEventTypes[profile.sourceKind]
  if (!allowedTypes.includes(profile.defaultEventType)) {
    throw new Error(`Invalid event profile for ${sourceId}: ${profile.sourceKind} cannot default to ${profile.defaultEventType}`)
  }
}
