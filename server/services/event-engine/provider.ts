import type { InvestmentProviderMeta } from "@shared/types"

export const INVESTMENT_PROVIDER_CONTRACT_VERSION: InvestmentProviderMeta["version"] = "investment-provider-v1"

export function buildInvestmentProviderMeta(surface: InvestmentProviderMeta["surface"]): InvestmentProviderMeta {
  return {
    version: INVESTMENT_PROVIDER_CONTRACT_VERSION,
    projection: "investment",
    surface,
  }
}
