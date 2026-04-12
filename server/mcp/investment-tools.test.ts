import { describe, expect, it } from "vitest"
import type { InvestmentEventBrief } from "@shared/types"
import {
  countInvestmentActionBuckets,
  filterInvestmentBriefsByFocus,
  formatInvestmentScanFocusLabel,
  orderByActionBucket,
} from "./investment-tools"

function makeBrief(eventId: string, actionBucket: InvestmentEventBrief["actionBucket"]): InvestmentEventBrief {
  return {
    eventId,
    title: eventId,
    eventFamily: "general_news",
    eventFamilyLabel: "一般资讯",
    actionBucket,
    actionLabel: actionBucket,
    whatHappened: "something happened",
    whoIsAffected: [],
    signalDirection: "neutral",
    signalDirectionLabel: "中性",
    signalConfidence: 50,
    signalConfidenceInsight: {
      band: "中低",
      note: "仅形成初步判断，先观察更稳妥。",
    },
    materialityScore: 50,
    materialityInsight: {
      band: "中等",
      note: "有投资意义，但通常需要结合更多证据确认。",
    },
    tradabilityScore: 50,
    tradabilityInsight: {
      band: "中等",
      note: "适合纳入观察和盘中跟踪，但不一定立即交易。",
    },
    authorityScore: 50,
    authorityInsight: {
      band: "中低",
      note: "来源参考价值有限，适合辅助观察。",
    },
    affectedMarkets: [],
    affectedMarketLabels: [],
    affectedEntities: [],
    subjectSummary: "影响对象待确认",
    whyItMatters: "matters",
    actionReason: "先观察，等待更多确认。",
    tradableNow: "watch",
    tradableNowLabel: "先观察",
    whatToWatchNext: [],
    riskOfMisread: [],
    relatedTopics: [],
    sourceSummary: {
      sourceKinds: [],
    },
  }
}

describe("mcp investment scan helpers", () => {
  const items = [
    makeBrief("evt_noise", "noise"),
    makeBrief("evt_watch", "watch"),
    makeBrief("evt_action", "actionable"),
  ]

  it("filters actionable and watchable focus modes correctly", () => {
    expect(filterInvestmentBriefsByFocus(items, "all").map(item => item.eventId)).toEqual([
      "evt_noise",
      "evt_watch",
      "evt_action",
    ])
    expect(filterInvestmentBriefsByFocus(items, "actionable").map(item => item.eventId)).toEqual([
      "evt_action",
    ])
    expect(filterInvestmentBriefsByFocus(items, "watchable").map(item => item.eventId)).toEqual([
      "evt_watch",
      "evt_action",
    ])
  })

  it("orders items by action priority and counts summary buckets", () => {
    expect(orderByActionBucket(items).map(item => item.eventId)).toEqual([
      "evt_action",
      "evt_watch",
      "evt_noise",
    ])
    expect(countInvestmentActionBuckets(items)).toEqual({
      total: 3,
      actionable: 1,
      watch: 1,
      noise: 1,
    })
  })

  it("formats human-readable focus labels", () => {
    expect(formatInvestmentScanFocusLabel("all")).toBe("全部事件")
    expect(formatInvestmentScanFocusLabel("actionable")).toBe("优先处理")
    expect(formatInvestmentScanFocusLabel("watchable")).toBe("优先处理 + 重点观察")
  })
})
