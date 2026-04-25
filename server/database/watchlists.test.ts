import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { WatchlistTable } from "#/database/watchlists"

const cleanupPaths: string[] = []

afterEach(() => {
  while (cleanupPaths.length) {
    const path = cleanupPaths.pop()
    if (!path) continue
    rmSync(path, { recursive: true, force: true })
  }
})

function createWatchlistTable() {
  const cwd = mkdtempSync(join(tmpdir(), "newsnow-watchlist-db-"))
  cleanupPaths.push(cwd)
  const db = createDatabase(sqliteConnector({
    cwd,
    name: "watchlists-test",
  }))
  return new WatchlistTable(db)
}

describe("watchlistTable", () => {
  it("owns watchlist metadata without reading event rows", async () => {
    const table = createWatchlistTable()
    await table.init()

    await table.upsert({
      watchlist_id: "wl_ai",
      name: "AI 产业",
      description: "跟踪 AI 产业事件",
      query_json: JSON.stringify({
        entities: ["寒武纪"],
        topics: ["ai-computing"],
      }),
      created_at: 1700000000000,
      updated_at: 1700000000000,
      last_checked_at: null,
    })

    await expect(table.get("wl_ai")).resolves.toMatchObject({
      watchlistId: "wl_ai",
      name: "AI 产业",
      query: {
        entities: ["寒武纪"],
        topics: ["ai-computing"],
      },
    })
    await expect(table.list()).resolves.toMatchObject([
      {
        watchlistId: "wl_ai",
      },
    ])

    await table.touchCheckedAt("wl_ai", 1700000005000)
    await expect(table.get("wl_ai")).resolves.toMatchObject({
      lastCheckedAt: 1700000005000,
    })
  })
})
