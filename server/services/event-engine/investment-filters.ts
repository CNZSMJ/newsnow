import type { InvestmentActionBucket, InvestmentEventBrief } from "@shared/types"

export type InvestmentScanFocus = "all" | "actionable" | "watchable"

export interface InvestmentScanSummary {
  total: number
  actionable: number
  watch: number
  noise: number
}

export function filterInvestmentBriefsByFocus(items: InvestmentEventBrief[], focus: InvestmentScanFocus) {
  if (focus === "actionable")
    return items.filter(item => item.actionBucket === "actionable")
  if (focus === "watchable")
    return items.filter(item => item.actionBucket !== "noise")
  return items
}

export function countInvestmentActionBuckets(items: Pick<InvestmentEventBrief, "actionBucket">[]): InvestmentScanSummary {
  return items.reduce<InvestmentScanSummary>((acc, item) => {
    acc.total += 1
    if (item.actionBucket === "actionable") acc.actionable += 1
    else if (item.actionBucket === "watch") acc.watch += 1
    else acc.noise += 1
    return acc
  }, {
    total: 0,
    actionable: 0,
    watch: 0,
    noise: 0,
  })
}

export function formatInvestmentScanFocusLabel(focus: InvestmentScanFocus) {
  switch (focus) {
    case "actionable":
      return "优先处理"
    case "watchable":
      return "优先处理 + 重点观察"
    default:
      return "全部事件"
  }
}

export function orderByActionBucket(items: InvestmentEventBrief[]) {
  const weight: Record<InvestmentActionBucket, number> = {
    actionable: 0,
    watch: 1,
    noise: 2,
  }
  return [...items].sort((a, b) => weight[a.actionBucket] - weight[b.actionBucket])
}
