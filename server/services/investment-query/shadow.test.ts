import { describe, expect, it } from "vitest"
import type { EventRecord, InvestmentEventBrief } from "@shared/types"
import { compareInvestmentQueryShadow, runInvestmentQueryShadowValidation } from "#/services/investment-query/shadow"

function eventRecord(eventId: string): EventRecord {
  return {
    eventId,
    title: `事件 ${eventId}`,
    eventType: "policy",
    eventSubType: "industrial_policy",
    sourceKind: "media_fast_feed",
    publishedAt: 1700000000000,
    ingestedAt: 1700000005000,
    primaryEntityName: "人工智能",
    importance: "high",
    directionalView: "positive",
    directionalConfidence: 70,
    materialityScore: 80,
    tradabilityScore: 60,
    authorityScore: 75,
    affectedMarkets: ["A"],
    topicTags: ["ai-computing"],
    evidenceCount: 1,
    sourceIds: ["wallstreetcn-quick"],
  }
}

function investmentBrief(eventId: string): InvestmentEventBrief {
  return {
    eventId,
    title: `事件 ${eventId}`,
    eventFamily: "policy_signal",
    eventFamilyLabel: "政策信号",
    actionBucket: "watch",
    actionLabel: "重点观察",
    actionReason: "需要跟踪正式文件",
    whatHappened: "政策发布",
    whoIsAffected: ["产业赛道：AI/算力"],
    signalDirection: "positive",
    signalDirectionLabel: "偏正向",
    signalConfidence: 70,
    signalConfidenceInsight: { band: "中高", note: "方向较清晰" },
    materialityScore: 80,
    materialityInsight: { band: "高", note: "重要" },
    tradabilityScore: 60,
    tradabilityInsight: { band: "中等", note: "观察" },
    authorityScore: 75,
    authorityInsight: { band: "中高", note: "可信" },
    affectedMarkets: ["A"],
    affectedMarketLabels: ["A股"],
    affectedEntities: [{
      entityId: "ai-computing",
      label: "AI/算力",
      entityType: "industry",
      entityTypeLabel: "产业赛道",
    }],
    subjectSummary: "AI/算力",
    whyItMatters: "影响产业预期",
    tradableNow: "watch",
    tradableNowLabel: "先观察",
    whatToWatchNext: ["跟踪正式文件"],
    riskOfMisread: [],
    relatedTopics: ["ai-computing"],
    sourceSummary: {
      primarySourceId: "wallstreetcn-quick",
      primarySourceName: "华尔街见闻",
      sourceKinds: ["media_fast_feed"],
    },
    publishedAt: 1700000000000,
    ingestedAt: 1700000005000,
  }
}

describe("investment query shadow validation", () => {
  it("detects projection/canonical ID drift", () => {
    expect(compareInvestmentQueryShadow({
      projection: {
        updatedAt: 1,
        items: [investmentBrief("evt_1"), investmentBrief("evt_extra")],
        totalCount: 2,
      },
      canonical: {
        items: [eventRecord("evt_1"), eventRecord("evt_missing")],
        totalCount: 2,
      },
    })).toMatchObject({
      status: "diff",
      missingFromProjection: ["evt_missing"],
      extraInProjection: ["evt_extra"],
      totalCountDelta: 0,
    })
  })

  it("runs projection and canonical queries before comparing", async () => {
    await expect(runInvestmentQueryShadowValidation({
      projectionQuery: async () => ({
        updatedAt: 1,
        items: [investmentBrief("evt_1")],
        totalCount: 1,
      }),
      canonicalQuery: async () => ({
        items: [eventRecord("evt_1")],
        totalCount: 1,
      }),
    })).resolves.toMatchObject({
      status: "match",
      projectionCount: 1,
      canonicalCount: 1,
    })
  })
})
