import { describe, expect, it } from "vitest"
import {
  assertSqlAccessDeclarations,
  declareSqlAccess,
} from "#/database/sql-ownership"

describe("sql ownership declarations", () => {
  it("accepts declared access for owner-owned tables", () => {
    const declaration = declareSqlAccess({
      name: "news_snapshot_batch_read",
      owner: "news",
      tables: ["source_snapshots", "source_items"],
      decisionRefs: ["TD-10", "TD-13"],
    })

    expect(declaration.owner).toBe("news")
    expect(declaration.tables).toEqual(["source_snapshots", "source_items"])
  })

  it("rejects unknown tables", () => {
    expect(() => declareSqlAccess({
      name: "unknown_table_access",
      owner: "news",
      tables: ["not_a_real_table"],
      decisionRefs: ["TD-10"],
    })).toThrow(/Unknown SQL table/)
  })

  it("requires a cross-owner reason when owner and table owner differ", () => {
    expect(() => declareSqlAccess({
      name: "ops_reads_shared_source_without_reason",
      owner: "ops",
      tables: ["source_fetch_runs"],
      decisionRefs: ["TD-12"],
    })).toThrow(/cross-owner/)

    expect(() => assertSqlAccessDeclarations([
      declareSqlAccess({
        name: "ops_reads_shared_source_with_reason",
        owner: "ops",
        tables: ["source_fetch_runs"],
        decisionRefs: ["TD-12"],
        crossOwnerReason: "ops diagnostics reads shared-source collection status",
      }),
    ])).not.toThrow()
  })
})
