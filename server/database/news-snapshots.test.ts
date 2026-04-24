import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createDatabase } from "db0"
import sqliteConnector from "db0/connectors/better-sqlite3"
import type { NewsItem } from "@shared/types"
import { NEWS_SNAPSHOT_SQL_DECLARATIONS, NewsSnapshotTable } from "#/database/news-snapshots"
import { assertSqlAccessDeclarations } from "#/database/sql-ownership"

const cleanupPaths: string[] = []

afterEach(() => {
  while (cleanupPaths.length) {
    const path = cleanupPaths.pop()
    if (!path) continue
    rmSync(path, { recursive: true, force: true })
  }
})

function createSnapshotTable() {
  const cwd = mkdtempSync(join(tmpdir(), "newsnow-news-snapshot-db-"))
  cleanupPaths.push(cwd)
  const db = createDatabase(sqliteConnector({
    cwd,
    name: "news-snapshot-test",
  }))
  return new NewsSnapshotTable(db)
}

function item(id: string, title = id): NewsItem {
  return {
    id,
    title,
    url: `https://example.com/${id}`,
  }
}

describe("newsSnapshotTable", () => {
  it("declares news ownership for snapshot SQL access", () => {
    expect(() => assertSqlAccessDeclarations(NEWS_SNAPSHOT_SQL_DECLARATIONS)).not.toThrow()
    expect(NEWS_SNAPSHOT_SQL_DECLARATIONS.every(declaration => declaration.owner === "news")).toBe(true)
  })

  it("stores and reads a source snapshot with ordered items", async () => {
    const table = createSnapshotTable()
    await table.init()

    await table.upsertSnapshot({
      sourceId: "wallstreetcn-quick",
      fetchedAt: 1000,
      items: [item("b"), item("a")],
    })

    const snapshot = await table.readSnapshot("wallstreetcn-quick", {
      now: 1200,
      maxAgeMs: 1000,
    })

    expect(snapshot).toMatchObject({
      sourceId: "wallstreetcn-quick",
      state: "fresh",
      updatedAt: 1000,
      itemCount: 2,
    })
    expect(snapshot.items.map(row => row.id)).toEqual(["b", "a"])
  })

  it("classifies missing, fresh, and stale snapshots", async () => {
    const table = createSnapshotTable()
    await table.init()

    expect(await table.readSnapshot("missing-source", {
      now: 2000,
      maxAgeMs: 1000,
    })).toMatchObject({
      sourceId: "missing-source",
      state: "missing",
      items: [],
    })

    await table.upsertSnapshot({
      sourceId: "fresh-source",
      fetchedAt: 1500,
      items: [item("fresh")],
    })
    await table.upsertSnapshot({
      sourceId: "stale-source",
      fetchedAt: 500,
      items: [item("stale")],
    })

    expect(await table.readSnapshot("fresh-source", {
      now: 2000,
      maxAgeMs: 1000,
    })).toMatchObject({ state: "fresh" })
    expect(await table.readSnapshot("stale-source", {
      now: 2000,
      maxAgeMs: 1000,
    })).toMatchObject({ state: "stale" })
  })

  it("batch reads snapshots without depending on cache JSON blobs", async () => {
    const table = createSnapshotTable()
    await table.init()
    await table.upsertSnapshot({
      sourceId: "source-a",
      fetchedAt: 1000,
      items: [item("a1")],
    })
    await table.upsertSnapshot({
      sourceId: "source-b",
      fetchedAt: 900,
      items: [item("b1"), item("b2")],
    })

    const snapshots = await table.readSnapshots(["source-b", "missing", "source-a"], {
      now: 1200,
      maxAgeMs: 500,
    })

    expect(snapshots.map(snapshot => snapshot.sourceId)).toEqual(["source-b", "missing", "source-a"])
    expect(snapshots.map(snapshot => snapshot.state)).toEqual(["fresh", "missing", "fresh"])
    expect(snapshots[0]?.items.map(row => row.id)).toEqual(["b1", "b2"])
  })

  it("records fetch failures while preserving stale fallback items", async () => {
    const table = createSnapshotTable()
    await table.init()
    await table.upsertSnapshot({
      sourceId: "source-a",
      fetchedAt: 1000,
      items: [item("a1")],
    })

    await table.recordFetchFailure({
      sourceId: "source-a",
      failedAt: 1800,
      error: "upstream timeout",
    })

    const snapshot = await table.readSnapshot("source-a", {
      now: 2000,
      maxAgeMs: 500,
    })

    expect(snapshot).toMatchObject({
      sourceId: "source-a",
      state: "failed",
      lastError: "upstream timeout",
      updatedAt: 1000,
      lastFailedAt: 1800,
      itemCount: 1,
    })
    expect(snapshot.items.map(row => row.id)).toEqual(["a1"])
  })
})
