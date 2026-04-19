import { describe, expect, it } from "vitest"
import type { InvestmentEntityRef } from "@shared/types"
import {
  deriveWatchTargetCandidates,
  resolveWatchTargetCandidates,
} from "#/services/event-engine/watch-target-candidates"

describe("watch target candidates", () => {
  it("derives curated security candidates from investable industry clues when no issuer is explicit", () => {
    const entities: InvestmentEntityRef[] = [{
      entityId: "光纤",
      label: "光纤",
      entityType: "industry",
      entityTypeLabel: "产业赛道",
    }]

    const candidates = deriveWatchTargetCandidates({
      title: "国产光纤全球爆单 部分产品价格暴涨650%",
      summary: "行业价格与订单同时走强，但未点名具体上市公司。",
      affectedEntities: entities,
      relatedTopics: [],
    })

    expect(candidates.map(item => item.entity.label)).toEqual([
      "长飞光纤",
      "亨通光电",
      "中天科技",
      "烽火通信",
    ])
    expect(candidates[0]).toEqual(expect.objectContaining({
      source: "industry-watch-registry",
      matchedBy: "industry_entity",
      entity: expect.objectContaining({
        entityType: "security",
        code: "601869",
        market: "A",
      }),
    }))
  })

  it("stays quiet when the event already has explicit company or security subjects", () => {
    const candidates = deriveWatchTargetCandidates({
      title: "长飞光纤发布一季度业绩预告",
      summary: "公司已明确点名",
      affectedEntities: [{
        entityId: "sh601869",
        label: "长飞光纤",
        entityType: "security",
        entityTypeLabel: "交易标的",
        code: "601869",
        market: "A",
      }],
      relatedTopics: [],
    })

    expect(candidates).toEqual([])
  })

  it("prefers llm-suggested watch targets after registry validation", async () => {
    const entities: InvestmentEntityRef[] = [{
      entityId: "光纤",
      label: "光纤",
      entityType: "industry",
      entityTypeLabel: "产业赛道",
    }]

    const candidates = await resolveWatchTargetCandidates({
      eventId: "evt_fiber_watch_targets",
      title: "国产光纤全球爆单 部分产品价格暴涨650%",
      summary: "行业价格与订单同时走强，但未点名具体上市公司。",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "media_fast_feed",
      topicTags: [],
      affectedMarkets: ["A"],
      affectedEntities: entities,
      impactSummary: ["光纤价格和订单同步走强，优先找产业链直接受益的上市公司。"],
    }, {
      extractor: {
        extract: async () => ({
          provider: "llm",
          confidence: 0.87,
          candidates: [
            {
              label: "长飞光纤",
              reason: "光纤光缆环节最直接受益于价格和订单上行。",
              confidence: 0.94,
            },
            {
              label: "亨通光电",
              reason: "光纤光缆与通信网络业务暴露较高，可验证景气扩散。",
              confidence: 0.91,
            },
          ],
        }),
      },
      registryResolver: {
        resolveByName: async (value) => {
          if (value === "长飞光纤") {
            return {
              code: "601869",
              fullCode: "sh601869",
              name: "长飞光纤",
              exchange: "SH",
              assetType: "stock",
            }
          }
          if (value === "亨通光电") {
            return {
              code: "600487",
              fullCode: "sh600487",
              name: "亨通光电",
              exchange: "SH",
              assetType: "stock",
            }
          }
          return null
        },
      },
    })

    expect(candidates).toEqual([
      expect.objectContaining({
        source: "llm-registry",
        matchedBy: "llm_hypothesis",
        reason: "光纤光缆环节最直接受益于价格和订单上行。",
        entity: expect.objectContaining({
          label: "长飞光纤",
          code: "601869",
          market: "A",
        }),
      }),
      expect.objectContaining({
        source: "llm-registry",
        matchedBy: "llm_hypothesis",
        reason: "光纤光缆与通信网络业务暴露较高，可验证景气扩散。",
        entity: expect.objectContaining({
          label: "亨通光电",
          code: "600487",
          market: "A",
        }),
      }),
    ])
  })

  it("retries registry resolution with normalized legal-company variants", async () => {
    const entities: InvestmentEntityRef[] = [{
      entityId: "光纤",
      label: "光纤",
      entityType: "industry",
      entityTypeLabel: "产业赛道",
    }]

    const candidates = await resolveWatchTargetCandidates({
      eventId: "evt_fiber_watch_targets_variants",
      title: "国产光纤全球爆单 部分产品价格暴涨650%",
      summary: "行业价格与订单同时走强，但未点名具体上市公司。",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "media_fast_feed",
      topicTags: [],
      affectedMarkets: ["A"],
      affectedEntities: entities,
      impactSummary: ["光纤价格和订单同步走强，优先找产业链直接受益的上市公司。"],
    }, {
      extractor: {
        extract: async () => ({
          provider: "llm",
          confidence: 0.85,
          candidates: [
            {
              label: "长飞光纤光缆股份有限公司",
              reason: "国内头部光纤制造商，直接受益于光纤产品量价齐升的订单爆发。",
              confidence: 0.9,
            },
            {
              label: "江苏亨通光电股份有限公司",
              reason: "主营光纤光缆业务，产能规模居行业前列，订单增长直接驱动收入增长。",
              confidence: 0.88,
            },
          ],
        }),
      },
      registryResolver: {
        resolveByName: async (value) => {
          if (value === "长飞光纤光缆") {
            return {
              code: "601869",
              fullCode: "sh601869",
              name: "长飞光纤",
              exchange: "SH",
              assetType: "stock",
            }
          }
          if (value === "亨通光电") {
            return {
              code: "600487",
              fullCode: "sh600487",
              name: "亨通光电",
              exchange: "SH",
              assetType: "stock",
            }
          }
          return null
        },
      },
    })

    expect(candidates.map(item => item.entity.label)).toEqual([
      "长飞光纤",
      "亨通光电",
    ])
    expect(candidates.every(item => item.source === "llm-registry")).toBe(true)
  })
})
