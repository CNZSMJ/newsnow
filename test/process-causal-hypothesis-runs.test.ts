import { describe, expect, it } from "vitest"
import { parseArgs } from "../scripts/process-causal-hypothesis-runs-args"

describe("process causal hypothesis runs script arguments", () => {
  it("requires an explicit processing limit", () => {
    const result = parseArgs(["--execute"])

    expect(result.errors).toEqual([
      expect.objectContaining({
        errorCode: "invalid_arguments",
        message: "--limit is required",
      }),
    ])
  })

  it("parses bounded execute options", () => {
    const result = parseArgs([
      "--limit",
      "500",
      "--batch-size",
      "100",
      "--compact-pending-limit",
      "50000",
      "--retry-limit",
      "25",
      "--lock-owner",
      "manual-test",
      "--execute",
      "--json",
    ])

    expect(result.errors).toEqual([])
    expect(result.parsed).toMatchObject({
      limit: 500,
      batchSize: 100,
      compactPendingLimit: 50000,
      retryLimit: 25,
      lockOwner: "manual-test",
      execute: true,
      dryRun: false,
      json: true,
    })
  })

  it("rejects unsafe oversized batches", () => {
    const result = parseArgs(["--limit", "500", "--batch-size", "501"])

    expect(result.errors).toEqual([
      expect.objectContaining({
        errorCode: "invalid_arguments",
        message: "--batch-size must be 1..500",
      }),
    ])
  })

  it("allows compaction to be disabled", () => {
    const result = parseArgs(["--limit", "20", "--no-compact"])

    expect(result.errors).toEqual([])
    expect(result.parsed).toMatchObject({
      limit: 20,
      compactPendingLimit: 0,
      execute: false,
      dryRun: true,
    })
  })
})
