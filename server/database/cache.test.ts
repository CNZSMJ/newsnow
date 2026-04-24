import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import { Cache } from "#/database/cache"

const cleanupPaths: string[] = []

afterEach(() => {
  while (cleanupPaths.length) {
    const path = cleanupPaths.pop()
    if (!path) continue
    rmSync(path, { recursive: true, force: true })
  }
})

function createCache() {
  const cwd = mkdtempSync(join(tmpdir(), "newsnow-cache-db-"))
  cleanupPaths.push(cwd)
  const db = createDatabase(sqliteConnector({
    cwd,
    name: "cache-test",
  }))
  return new Cache(db)
}

describe("cache.getEntire", () => {
  it("returns cached rows for the requested source ids", async () => {
    const cache = createCache()
    await cache.init()
    await cache.set("source-a", [{ id: "a1", title: "A", url: "https://a.example" }])
    await cache.set("source-b", [{ id: "b1", title: "B", url: "https://b.example" }])

    const rows = await cache.getEntire(["source-a", "source-b"])

    expect(rows.map(row => row.id).sort()).toEqual(["source-a", "source-b"])
  })

  it("returns an empty result without issuing an invalid query for empty input", async () => {
    const cache = createCache()
    await cache.init()

    await expect(cache.getEntire([])).resolves.toEqual([])
  })

  it("does not treat source ids as SQL fragments", async () => {
    const cache = createCache()
    await cache.init()
    await cache.set("safe-source", [{ id: "safe", title: "Safe", url: "https://safe.example" }])

    const rows = await cache.getEntire(["missing-source' OR id = 'safe-source"])

    expect(rows).toEqual([])
  })
})
