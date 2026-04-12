import type { WatchlistRecord, InvestmentEventBrief } from "@shared/types"

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function collectEventEntityTokens(event: Pick<InvestmentEventBrief, "affectedEntities" | "whoIsAffected">) {
  const tokens = new Set<string>()
  for (const entity of event.affectedEntities) {
    tokens.add(normalize(entity.label))
    tokens.add(normalize(entity.entityId))
    if (entity.code) tokens.add(normalize(entity.code))
  }
  for (const label of event.whoIsAffected) {
    tokens.add(normalize(label))
  }
  return tokens
}

function scoreWatchlistForEvent(event: Pick<InvestmentEventBrief, "affectedMarkets" | "relatedTopics" | "affectedEntities" | "whoIsAffected">, watchlist: WatchlistRecord) {
  let score = 0
  const entityTokens = collectEventEntityTokens(event)
  const topicTokens = new Set(event.relatedTopics.map(topic => normalize(topic)))

  for (const topic of watchlist.query.topics ?? []) {
    if (topicTokens.has(normalize(topic))) score += 5
  }

  for (const market of watchlist.query.markets ?? []) {
    if (event.affectedMarkets.includes(market)) score += 4
  }

  for (const entity of watchlist.query.entities ?? []) {
    if (entityTokens.has(normalize(entity))) score += 6
  }

  return score
}

export function getMatchingWatchlists(event: Pick<InvestmentEventBrief, "affectedMarkets" | "relatedTopics" | "affectedEntities" | "whoIsAffected">, watchlists: WatchlistRecord[], limit = 2) {
  return watchlists
    .map(watchlist => ({
      watchlist,
      score: scoreWatchlistForEvent(event, watchlist),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.watchlist.name.localeCompare(b.watchlist.name))
    .slice(0, limit)
    .map(item => item.watchlist)
}
