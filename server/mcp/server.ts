import { z } from "zod"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type {
  InvestmentProviderEventDetailResponse,
  InvestmentProviderEventListResponse,
  InvestmentProviderWatchlistDetailResponse,
  WatchlistRecord,
} from "@shared/types"
import packageJSON from "../../package.json"
import { description } from "./desc.js"
import {
  countInvestmentActionBuckets,
  formatInvestmentScanFocusLabel,
  type InvestmentScanFocus,
} from "./investment-tools.js"
import { getHottestLatestNews } from "./news-tools.js"
import { type McpInvestmentEventBrief, toMcpEventBrief, toMcpEventDetail, toMcpWatchlistDetail } from "./projection.js"

const eventTypeEnum = ["news", "announcement", "policy", "macro", "industry", "market_move"] as const
const eventSubTypeEnum = ["other", "analysis_signal", "rate_fixing", "earnings", "financing", "contract", "shareholding_change", "management_change", "regulation", "listing_status", "buyback", "dividend", "monetary_policy", "trade_policy", "industrial_policy", "macro_data", "industry_data", "industry_news"] as const
const eventFamilyEnum = ["rates_liquidity", "macro_print", "policy", "policy_signal", "media_interpretation", "earnings", "financing", "corporate_action", "disclosure_signal", "trading_status", "industry_data", "industry_report", "industry_news", "rumor_clarification", "market_move", "general_news"] as const
const affectedMarketEnum = ["A", "HK", "CN_rates", "CN_macro", "global_macro"] as const
const directionalViewEnum = ["positive", "negative", "neutral", "mixed", "unknown"] as const
const scanFocusEnum = ["all", "actionable", "watchable"] as const
const countSchema = z.coerce.number().int().positive().max(100).default(10)
const timeFilterSchema = z.union([z.string(), z.number()]).optional()

function formatInvestmentEventSummary(item: Pick<McpInvestmentEventBrief, "title" | "eventId" | "actionBucket" | "actionLabel" | "actionReason" | "eventFamily" | "eventFamilyLabel" | "whatHappened" | "whoIsAffected" | "affectedEntities" | "subjectSummary" | "publisherInstitution" | "latestLifecycleState" | "latestLifecycleAt" | "seriesSummary" | "signalDirection" | "signalDirectionLabel" | "signalConfidence" | "materialityScore" | "tradabilityScore" | "authorityScore" | "affectedMarkets" | "affectedMarketLabels" | "tradableNow" | "tradableNowLabel" | "relatedTopics" | "whyItMatters" | "whatToWatchNext" | "riskOfMisread" | "sourceSummary" | "canonicalUrl">) {
  return [
    item.title,
    `- event_id: ${item.eventId}`,
    `- action_bucket: ${item.actionBucket} (${item.actionLabel})`,
    `- family: ${item.eventFamily} (${item.eventFamilyLabel})`,
    `- what_happened: ${item.whatHappened}`,
    `- subject_summary: ${item.subjectSummary}`,
    item.whoIsAffected.length ? `- who_is_affected: ${item.whoIsAffected.join(", ")}` : undefined,
    item.affectedEntities.length ? `- affected_entities: ${item.affectedEntities.map(entity => entity.label).join(", ")}` : undefined,
    item.publisherInstitution ? `- publisher: ${item.publisherInstitution}` : undefined,
    `- action_reason: ${item.actionReason}`,
    item.latestLifecycleState ? `- lifecycle: ${item.latestLifecycleState}${item.latestLifecycleAt ? ` @ ${new Date(item.latestLifecycleAt).toISOString()}` : ""}` : undefined,
    item.seriesSummary ? `- series: ${item.seriesSummary}` : undefined,
    `- signal: ${item.signalDirection} (${item.signalDirectionLabel}, ${item.signalConfidence})`,
    `- materiality: ${item.materialityScore}`,
    `- tradability: ${item.tradabilityScore}`,
    `- authority: ${item.authorityScore}`,
    item.affectedMarkets.length ? `- markets: ${item.affectedMarkets.join(", ")} (${item.affectedMarketLabels.join(", ")})` : undefined,
    `- tradable_now: ${item.tradableNow} (${item.tradableNowLabel})`,
    item.relatedTopics.length ? `- topics: ${item.relatedTopics.join(", ")}` : undefined,
    `- why_it_matters: ${item.whyItMatters}`,
    item.whatToWatchNext.length ? `- what_to_watch_next: ${item.whatToWatchNext.join(" | ")}` : undefined,
    item.riskOfMisread.length ? `- risk_of_misread: ${item.riskOfMisread.join(" | ")}` : undefined,
    item.sourceSummary.primarySourceName ? `- source: ${item.sourceSummary.primarySourceName}` : undefined,
    item.canonicalUrl ? `- url: ${item.canonicalUrl}` : undefined,
  ].filter(Boolean).join("\n")
}

function buildInvestmentScanStructuredContent(contract: InvestmentProviderEventListResponse["contract"], items: McpInvestmentEventBrief[], focus: InvestmentScanFocus) {
  return {
    contract,
    focus,
    focusLabel: formatInvestmentScanFocusLabel(focus),
    summary: countInvestmentActionBuckets(items),
    items,
  }
}

export function getServer() {
  const server = new McpServer(
    {
      name: "NewsNow",
      version: packageJSON.version,
    },
    { capabilities: { logging: {} } },
  )

  server.tool(
    "get_hotest_latest_news",
    `get hotest or latest news from source by {id}, return {count: 10} news.`,
    {
      id: z.string().describe(`source id. e.g. ${description}`),
      count: countSchema.describe("count of news to return."),
    },
    async ({ id, count }): Promise<CallToolResult> => {
      return await getHottestLatestNews({ id, count })
    },
  )

  server.tool(
    "event_scan",
    "scan investment events for discretionary decision-making, with optional focus on actionable or watch-worthy events.",
    {
      count: countSchema.describe("count of events to return."),
      focus: z.enum(scanFocusEnum).default("all").optional(),
      event_family: z.enum(eventFamilyEnum).optional(),
      market: z.enum(affectedMarketEnum).optional(),
      topic: z.string().optional(),
      directional_view: z.enum(directionalViewEnum).optional(),
      min_materiality_score: z.number().optional(),
      min_authority_score: z.number().optional(),
      changed_since: timeFilterSchema.describe("only return events whose latest lifecycle change is at or after this timestamp"),
      lifecycle_after: timeFilterSchema.describe("alias of changed_since"),
      series_key: z.string().optional(),
      period_key: z.string().optional(),
      latest: z.boolean().default(true).optional(),
      sort: z.enum(["investment", "latest", "changed"]).default("investment").optional(),
    },
    async ({ count, focus, event_family, market, topic, directional_view, min_materiality_score, min_authority_score, changed_since, lifecycle_after, series_key, period_key, latest, sort }): Promise<CallToolResult> => {
      let n = Number(count)
      if (Number.isNaN(n) || n < 1) n = 10
      const focusMode = focus ?? "all"

      const query = new URLSearchParams({
        limit: String(n),
        latest: String(latest ?? true),
        sort: sort ?? "investment",
        focus: focusMode,
      })
      if (event_family) query.set("event_family", event_family)
      if (market) query.set("market", market)
      if (topic) query.set("topic", topic)
      if (directional_view) query.set("directional_view", directional_view)
      if (min_materiality_score !== undefined) query.set("min_materiality_score", String(min_materiality_score))
      if (min_authority_score !== undefined) query.set("min_authority_score", String(min_authority_score))
      if (changed_since !== undefined) query.set("changed_since", String(changed_since))
      if (lifecycle_after !== undefined) query.set("lifecycle_after", String(lifecycle_after))
      if (series_key) query.set("series_key", series_key)
      if (period_key) query.set("period_key", period_key)

      const res: InvestmentProviderEventListResponse = await $fetch(`/api/investment-events/latest?${query.toString()}`)
      const items = res.items.map(item => toMcpEventBrief(item)).slice(0, n)
      const summary = countInvestmentActionBuckets(items)
      return {
        structuredContent: buildInvestmentScanStructuredContent(res.contract, items, focusMode),
        content: [
          {
            type: "text",
            text: `事件扫描 · ${formatInvestmentScanFocusLabel(focusMode)}\n- count: ${items.length}\n- actionable: ${summary.actionable}\n- watch: ${summary.watch}\n- noise: ${summary.noise}`,
          },
          ...items.map(item => ({
            type: "text" as const,
            text: formatInvestmentEventSummary(item),
          })),
        ],
      }
    },
  )

  server.tool(
    "event_get_latest_events",
    "get latest normalized events, optionally filtered by event type, source, or topic.",
    {
      count: countSchema.describe("count of events to return."),
      event_type: z.enum(eventTypeEnum).optional(),
      event_subtype: z.enum(eventSubTypeEnum).optional(),
      event_family: z.enum(eventFamilyEnum).optional(),
      source_id: z.string().optional(),
      topic: z.string().optional(),
      market: z.enum(affectedMarketEnum).optional(),
      directional_view: z.enum(directionalViewEnum).optional(),
      focus: z.enum(scanFocusEnum).default("all").optional(),
      min_materiality_score: z.number().optional(),
      min_authority_score: z.number().optional(),
      changed_since: timeFilterSchema.describe("only return events whose latest lifecycle change is at or after this timestamp"),
      lifecycle_after: timeFilterSchema.describe("alias of changed_since"),
      series_key: z.string().optional(),
      period_key: z.string().optional(),
      latest: z.boolean().default(true).optional(),
      sort: z.enum(["investment", "latest", "changed"]).default("latest").optional(),
    },
    async ({ count, event_type, event_subtype, event_family, source_id, topic, market, directional_view, focus, min_materiality_score, min_authority_score, changed_since, lifecycle_after, series_key, period_key, latest, sort }): Promise<CallToolResult> => {
      let n = Number(count)
      if (Number.isNaN(n) || n < 1) n = 10

      const query = new URLSearchParams({
        limit: String(n),
        latest: String(latest ?? true),
        sort: sort ?? "latest",
      })
      if (event_type) query.set("event_type", event_type)
      if (event_subtype) query.set("event_subtype", event_subtype)
      if (event_family) query.set("event_family", event_family)
      if (source_id) query.set("source_id", source_id)
      if (topic) query.set("topic", topic)
      if (market) query.set("market", market)
      if (directional_view) query.set("directional_view", directional_view)
      if (focus) query.set("focus", focus)
      if (min_materiality_score !== undefined) query.set("min_materiality_score", String(min_materiality_score))
      if (min_authority_score !== undefined) query.set("min_authority_score", String(min_authority_score))
      if (changed_since !== undefined) query.set("changed_since", String(changed_since))
      if (lifecycle_after !== undefined) query.set("lifecycle_after", String(lifecycle_after))
      if (series_key) query.set("series_key", series_key)
      if (period_key) query.set("period_key", period_key)

      const res: InvestmentProviderEventListResponse = await $fetch(`/api/investment-events/latest?${query.toString()}`)
      const items = res.items.map(item => toMcpEventBrief(item))
      return {
        structuredContent: buildInvestmentScanStructuredContent(res.contract, items, "all"),
        content: items.map(item => ({
          type: "text",
          text: formatInvestmentEventSummary(item),
        })),
      }
    },
  )

  server.tool(
    "event_search_events",
    "search normalized events by keyword.",
    {
      q: z.string().describe("keyword to search in title/summary"),
      count: countSchema.describe("count of events to return."),
      event_family: z.enum(eventFamilyEnum).optional(),
      market: z.enum(affectedMarketEnum).optional(),
      directional_view: z.enum(directionalViewEnum).optional(),
      min_materiality_score: z.number().optional(),
      min_authority_score: z.number().optional(),
      changed_since: timeFilterSchema.describe("only return events whose latest lifecycle change is at or after this timestamp"),
      lifecycle_after: timeFilterSchema.describe("alias of changed_since"),
      series_key: z.string().optional(),
      period_key: z.string().optional(),
      latest: z.boolean().default(false).optional(),
      sort: z.enum(["investment", "latest", "changed"]).default("investment").optional(),
    },
    async ({ q, count, event_family, market, directional_view, min_materiality_score, min_authority_score, changed_since, lifecycle_after, series_key, period_key, latest, sort }): Promise<CallToolResult> => {
      let n = Number(count)
      if (Number.isNaN(n) || n < 1) n = 10

      const query = new URLSearchParams({
        q,
        limit: String(n),
        latest: String(latest ?? false),
        sort: sort ?? "investment",
      })
      if (event_family) query.set("event_family", event_family)
      if (market) query.set("market", market)
      if (directional_view) query.set("directional_view", directional_view)
      if (min_materiality_score !== undefined) query.set("min_materiality_score", String(min_materiality_score))
      if (min_authority_score !== undefined) query.set("min_authority_score", String(min_authority_score))
      if (changed_since !== undefined) query.set("changed_since", String(changed_since))
      if (lifecycle_after !== undefined) query.set("lifecycle_after", String(lifecycle_after))
      if (series_key) query.set("series_key", series_key)
      if (period_key) query.set("period_key", period_key)
      const res: InvestmentProviderEventListResponse = await $fetch(`/api/investment-events/search?${query.toString()}`)
      const items = res.items.map(item => toMcpEventBrief(item))
      return {
        structuredContent: {
          contract: res.contract,
          items,
        },
        content: items.map(item => ({
          type: "text",
          text: formatInvestmentEventSummary(item),
        })),
      }
    },
  )

  server.tool(
    "event_get_entity_events",
    "get normalized events linked to an entity, such as a stock code, full code, or topic tag.",
    {
      entity: z.string().describe("entity value, e.g. 600519, sh600519, photovoltaic"),
      count: countSchema.describe("count of events to return."),
      event_family: z.enum(eventFamilyEnum).optional(),
      market: z.enum(affectedMarketEnum).optional(),
      directional_view: z.enum(directionalViewEnum).optional(),
      min_materiality_score: z.number().optional(),
      min_authority_score: z.number().optional(),
      changed_since: timeFilterSchema.describe("only return events whose latest lifecycle change is at or after this timestamp"),
      lifecycle_after: timeFilterSchema.describe("alias of changed_since"),
      series_key: z.string().optional(),
      period_key: z.string().optional(),
      latest: z.boolean().default(true).optional(),
      sort: z.enum(["investment", "latest", "changed"]).default("latest").optional(),
    },
    async ({ entity, count, event_family, market, directional_view, min_materiality_score, min_authority_score, changed_since, lifecycle_after, series_key, period_key, latest, sort }): Promise<CallToolResult> => {
      let n = Number(count)
      if (Number.isNaN(n) || n < 1) n = 10

      const query = new URLSearchParams({
        entity,
        limit: String(n),
        latest: String(latest ?? true),
        sort: sort ?? "latest",
      })
      if (event_family) query.set("event_family", event_family)
      if (market) query.set("market", market)
      if (directional_view) query.set("directional_view", directional_view)
      if (min_materiality_score !== undefined) query.set("min_materiality_score", String(min_materiality_score))
      if (min_authority_score !== undefined) query.set("min_authority_score", String(min_authority_score))
      if (changed_since !== undefined) query.set("changed_since", String(changed_since))
      if (lifecycle_after !== undefined) query.set("lifecycle_after", String(lifecycle_after))
      if (series_key) query.set("series_key", series_key)
      if (period_key) query.set("period_key", period_key)
      const res: InvestmentProviderEventListResponse = await $fetch(`/api/investment-events/entity?${query.toString()}`)
      const items = res.items.map(item => toMcpEventBrief(item))
      return {
        structuredContent: {
          contract: res.contract,
          items,
        },
        content: items.map(item => ({
          type: "text",
          text: formatInvestmentEventSummary(item),
        })),
      }
    },
  )

  server.tool(
    "event_get_detail",
    "get an investment-oriented event detail by event_id, including facts, evidence, and follow-up checks.",
    {
      event_id: z.string().describe("normalized event id"),
      debug: z.boolean().default(false).optional(),
    },
    async ({ event_id, debug }): Promise<CallToolResult> => {
      const detailRes: InvestmentProviderEventDetailResponse = await $fetch(`/api/investment-events/${event_id}`)
      const projected = toMcpEventDetail(detailRes.item, debug ?? false)
      return {
        structuredContent: {
          contract: detailRes.contract,
          item: projected,
        },
        content: [{
          type: "text",
          text: [
            formatInvestmentEventSummary(projected),
            projected.keyFacts.length ? `- facts: ${projected.keyFacts.map(item => `${item.label}${item.value !== undefined && item.value !== null ? `=${item.value}${item.unit ?? ""}` : ""}`).join("; ")}` : undefined,
            projected.timelineSummary.length ? `- timeline: ${projected.timelineSummary.slice(0, 5).map(item => `${item.label}${item.note ? `(${item.note})` : ""}`).join(" -> ")}` : undefined,
            projected.evidence.length ? `- evidences: ${projected.evidence.map(item => `${item.sourceName} -> ${item.url ?? ""}`).join("; ")}` : undefined,
          ].filter(Boolean).join("\n"),
        }],
      }
    },
  )

  server.tool(
    "event_get_event",
    "get a normalized event detail by event_id.",
    {
      event_id: z.string().describe("normalized event id"),
      debug: z.boolean().default(false).optional(),
    },
    async ({ event_id, debug }): Promise<CallToolResult> => {
      const detailRes: InvestmentProviderEventDetailResponse = await $fetch(`/api/investment-events/${event_id}`)
      const projected = toMcpEventDetail(detailRes.item, debug ?? false)
      return {
        structuredContent: {
          contract: detailRes.contract,
          item: projected,
        },
        content: [{
          type: "text",
          text: [
            formatInvestmentEventSummary(projected),
            projected.keyFacts.length ? `- facts: ${projected.keyFacts.map(item => `${item.label}${item.value !== undefined && item.value !== null ? `=${item.value}${item.unit ?? ""}` : ""}`).join("; ")}` : undefined,
            projected.timelineSummary.length ? `- timeline: ${projected.timelineSummary.slice(0, 5).map(item => `${item.label}${item.note ? `(${item.note})` : ""}`).join(" -> ")}` : undefined,
            projected.evidence.length ? `- evidences: ${projected.evidence.map(item => `${item.sourceName} -> ${item.url ?? ""}`).join("; ")}` : undefined,
          ].filter(Boolean).join("\n"),
        }],
      }
    },
  )

  server.tool(
    "watchlist_list",
    "list saved watchlists for event monitoring.",
    {},
    async (): Promise<CallToolResult> => {
      const res = await $fetch<{ status: "success", updatedTime: number, items?: WatchlistRecord[] }>("/api/watchlists")
      return {
        content: (res.items ?? []).map(item => ({
          type: "text",
          text: `${item.name}\n- watchlist_id: ${item.watchlistId}${item.description ? `\n- description: ${item.description}` : ""}`,
        })),
      }
    },
  )

  server.tool(
    "watchlist_upsert",
    "create or update a watchlist for event monitoring.",
    {
      watchlist_id: z.string().optional(),
      name: z.string().describe("watchlist name"),
      description: z.string().optional(),
      entities: z.array(z.string()).optional(),
      topics: z.array(z.string()).optional(),
      event_types: z.array(z.enum(["news", "announcement", "policy", "macro", "industry", "market_move"])).optional(),
      event_subtypes: z.array(z.enum(["other", "rate_fixing", "earnings", "financing", "contract", "shareholding_change", "management_change", "regulation", "listing_status", "buyback", "dividend", "monetary_policy", "trade_policy", "industrial_policy", "macro_data", "industry_data", "industry_news"])).optional(),
      source_ids: z.array(z.string()).optional(),
      markets: z.array(z.enum(affectedMarketEnum)).optional(),
      directional_views: z.array(z.enum(directionalViewEnum)).optional(),
      min_materiality_score: z.number().optional(),
      min_authority_score: z.number().optional(),
    },
    async ({ watchlist_id, name, description, entities, topics, event_types, event_subtypes, source_ids, markets, directional_views, min_materiality_score, min_authority_score }): Promise<CallToolResult> => {
      const res = await $fetch<{ status: "success", item?: WatchlistRecord }>("/api/watchlists", {
        method: "POST",
        body: {
          watchlistId: watchlist_id,
          name,
          description,
          query: {
            entities,
            topics,
            eventTypes: event_types,
            eventSubTypes: event_subtypes,
            sourceIds: source_ids,
            markets,
            directionalViews: directional_views,
            minMaterialityScore: min_materiality_score,
            minAuthorityScore: min_authority_score,
          },
        },
      })
      const item = res.item
      return {
        content: item
          ? [{
              type: "text",
              text: `${item.name}\n- watchlist_id: ${item.watchlistId}${item.description ? `\n- description: ${item.description}` : ""}`,
            }]
          : [],
      }
    },
  )

  server.tool(
    "watchlist_scan",
    "scan recent watchlist hits using investment priority semantics, with optional focus on actionable or watch-worthy events.",
    {
      watchlist_id: z.string().describe("watchlist id"),
      count: countSchema.describe("count of events to return."),
      focus: z.enum(scanFocusEnum).default("all").optional(),
      latest: z.boolean().default(true).optional(),
      sort: z.enum(["investment", "latest"]).default("investment").optional(),
      event_family: z.enum(eventFamilyEnum).optional(),
    },
    async ({ watchlist_id, count, focus, latest, sort, event_family }): Promise<CallToolResult> => {
      let n = Number(count)
      if (Number.isNaN(n) || n < 1) n = 10
      const focusMode = focus ?? "all"
      const query = new URLSearchParams({
        limit: String(n),
        latest: String(latest ?? true),
        sort: sort ?? "investment",
        focus: focusMode,
      })
      if (event_family) query.set("event_family", event_family)
      const res: InvestmentProviderEventListResponse = await $fetch(`/api/investment-watchlists/${watchlist_id}/events?${query.toString()}`)
      const items = res.items.map(item => toMcpEventBrief(item)).slice(0, n)
      const summary = countInvestmentActionBuckets(items)
      return {
        structuredContent: buildInvestmentScanStructuredContent(res.contract, items, focusMode),
        content: [
          {
            type: "text",
            text: `监控扫描 · ${formatInvestmentScanFocusLabel(focusMode)}\n- count: ${items.length}\n- actionable: ${summary.actionable}\n- watch: ${summary.watch}\n- noise: ${summary.noise}`,
          },
          ...items.map(item => ({
            type: "text" as const,
            text: formatInvestmentEventSummary(item),
          })),
        ],
      }
    },
  )

  server.tool(
    "watchlist_get_events",
    "get recent events matched by a watchlist.",
    {
      watchlist_id: z.string().describe("watchlist id"),
      count: countSchema.describe("count of events to return."),
      latest: z.boolean().default(true).optional(),
      sort: z.enum(["investment", "latest"]).default("investment").optional(),
      event_family: z.enum(eventFamilyEnum).optional(),
      focus: z.enum(scanFocusEnum).default("all").optional(),
    },
    async ({ watchlist_id, count, latest, sort, event_family, focus }): Promise<CallToolResult> => {
      let n = Number(count)
      if (Number.isNaN(n) || n < 1) n = 10
      const query = new URLSearchParams({
        limit: String(n),
        latest: String(latest ?? true),
        sort: sort ?? "investment",
      })
      if (event_family) query.set("event_family", event_family)
      if (focus) query.set("focus", focus)
      const res: InvestmentProviderEventListResponse = await $fetch(`/api/investment-watchlists/${watchlist_id}/events?${query.toString()}`)
      const items = res.items.map(item => toMcpEventBrief(item))
      return {
        structuredContent: buildInvestmentScanStructuredContent(res.contract, items, "all"),
        content: items.map(item => ({
          type: "text",
          text: formatInvestmentEventSummary(item),
        })),
      }
    },
  )

  server.tool(
    "watchlist_get_detail",
    "get watchlist detail and recent matched events.",
    {
      watchlist_id: z.string().describe("watchlist id"),
      count: countSchema.describe("count of recent events to include."),
      sort: z.enum(["investment", "latest"]).default("investment").optional(),
      debug: z.boolean().default(false).optional(),
    },
    async ({ watchlist_id, count, sort, debug }): Promise<CallToolResult> => {
      let n = Number(count)
      if (Number.isNaN(n) || n < 1) n = 10
      const detailRes: InvestmentProviderWatchlistDetailResponse = await $fetch(`/api/investment-watchlists/${watchlist_id}?limit=${n}&sort=${sort ?? "investment"}`)
      const projected = toMcpWatchlistDetail(detailRes.item, debug ?? false)
      return {
        structuredContent: {
          contract: detailRes.contract,
          item: projected,
        },
        content: [{
          type: "text",
          text: [
            projected.name,
            `- watchlist_id: ${projected.watchlistId}`,
            `- sort: ${sort ?? "investment"}`,
            projected.description ? `- description: ${projected.description}` : undefined,
            projected.query.entities?.length ? `- entities: ${projected.query.entities.join(", ")}` : undefined,
            projected.query.topics?.length ? `- topics: ${projected.query.topics.join(", ")}` : undefined,
            projected.query.markets?.length ? `- markets: ${projected.query.markets.join(", ")}` : undefined,
            projected.query.directionalViews?.length ? `- directional_views: ${projected.query.directionalViews.join(", ")}` : undefined,
            projected.query.minMaterialityScore !== undefined ? `- min_materiality_score: ${projected.query.minMaterialityScore}` : undefined,
            projected.query.minAuthorityScore !== undefined ? `- min_authority_score: ${projected.query.minAuthorityScore}` : undefined,
            projected.recentEvents.length ? `- recent_events: ${projected.recentEvents.map(item => item.eventId).join(", ")}` : undefined,
          ].filter(Boolean).join("\n"),
        }],
      }
    },
  )

  server.server.onerror = console.error.bind(console)

  return server
}
