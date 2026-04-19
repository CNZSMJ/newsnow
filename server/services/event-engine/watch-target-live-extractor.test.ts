import { afterEach, describe, expect, it, vi } from "vitest"
import {
  WATCH_TARGET_CANDIDATE_PROMPT_ID,
  WATCH_TARGET_CANDIDATE_PROMPT_VERSION,
  WATCH_TARGET_CANDIDATE_SCHEMA_NAME,
  WATCH_TARGET_CANDIDATE_SYSTEM_PROMPT,
  buildWatchTargetCandidateInput,
} from "#/services/event-engine/watch-target-prompt"
import { getLiveWatchTargetCandidateExtractor } from "#/services/event-engine/watch-target-live-extractor"

const originalFetch = globalThis.fetch

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  if (originalFetch) {
    globalThis.fetch = originalFetch
  } else {
    delete (globalThis as Partial<typeof globalThis>).fetch
  }
})

describe("watch target live extractor", () => {
  it("builds a MiniMax structured-output request with the watch-target prompt", async () => {
    vi.stubEnv("LLM_PROVIDER", "minimax")
    vi.stubEnv("MINIMAX_API_KEY", "shared-minimax-key")
    vi.stubEnv("MINIMAX_BASE_URL", "http://127.0.0.1:4320/v1")

    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            provider: "llm",
            confidence: 0.88,
            candidates: [{
              label: "长飞光纤",
              reason: "光纤价格和订单上行时，光纤光缆龙头最值得优先跟踪。",
              confidence: 0.93,
            }],
          }),
        },
      }],
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }))
    globalThis.fetch = fetchSpy as typeof fetch

    const extractor = getLiveWatchTargetCandidateExtractor()
    expect(extractor).toBeTruthy()

    const result = await extractor!.extract({
      eventId: "evt_fiber_watch_targets",
      title: "国产光纤全球爆单 部分产品价格暴涨650%",
      summary: "行业价格与订单同时走强，但未点名具体上市公司。",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "media_fast_feed",
      topicTags: [],
      affectedMarkets: ["A"],
      impactSummary: ["优先找产业链直接受益的上市公司"],
      affectedEntities: [{
        entityId: "光纤",
        label: "光纤",
        entityType: "industry",
        entityTypeLabel: "产业赛道",
      }],
    })

    expect(result.candidates[0]?.label).toBe("长飞光纤")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [unknown, RequestInit | undefined]
    expect(String(url)).toBe("http://127.0.0.1:4320/v1/chat/completions")

    const body = JSON.parse(String(init?.body ?? "{}"))
    expect(body.model).toBe("MiniMax-M2.7")
    expect(body.messages[0].content).toContain("Suggest investable public-market watch targets")
    expect(body.messages[0].content).toContain("Never emit canonical ticker truth")
    expect(body.messages[0].content).toContain("光纤")
    expect(WATCH_TARGET_CANDIDATE_SCHEMA_NAME).toBe("newsnow_watch_target_candidates")
    expect(WATCH_TARGET_CANDIDATE_PROMPT_ID).toBe("watch-target-candidate-extractor")
    expect(WATCH_TARGET_CANDIDATE_PROMPT_VERSION).toBeTruthy()
    expect(WATCH_TARGET_CANDIDATE_SYSTEM_PROMPT).toContain("Return JSON only")

    const renderedInput = JSON.parse(buildWatchTargetCandidateInput({
      eventId: "evt_fiber_watch_targets",
      title: "国产光纤全球爆单 部分产品价格暴涨650%",
      summary: "行业价格与订单同时走强，但未点名具体上市公司。",
      eventType: "industry",
      eventSubType: "industry_news",
      sourceKind: "media_fast_feed",
      topicTags: [],
      affectedMarkets: ["A"],
      impactSummary: ["优先找产业链直接受益的上市公司"],
      affectedEntities: [{
        entityId: "光纤",
        label: "光纤",
        entityType: "industry",
        entityTypeLabel: "产业赛道",
      }],
    }))
    expect(renderedInput.currentSemantics.affectedEntities).toEqual([
      {
        label: "光纤",
        entityType: "industry",
      },
    ])
  })
})
