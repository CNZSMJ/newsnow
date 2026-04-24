import { describe, expect, it } from "vitest"
import * as investmentView from "./investment-view"
import {
  INVESTMENT_VIEW_FUNCTION_CLASSIFICATION,
  assertInvestmentViewClassificationCoverage,
} from "./investment-view-classification"

describe("investment view function classification", () => {
  it("classifies every exported investment-view function before Sprint 3 projection work", () => {
    const exportedFunctionNames = Object.entries(investmentView)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort()

    expect(() => assertInvestmentViewClassificationCoverage(exportedFunctionNames)).not.toThrow()
    expect(Object.keys(INVESTMENT_VIEW_FUNCTION_CLASSIFICATION).sort()).toEqual(exportedFunctionNames)
  })

  it("marks projection builders as write-time semantics for the target query model", () => {
    expect(INVESTMENT_VIEW_FUNCTION_CLASSIFICATION.projectInvestmentEventBrief.phase).toBe("write-time")
    expect(INVESTMENT_VIEW_FUNCTION_CLASSIFICATION.projectInvestmentEventDetail.phase).toBe("write-time")
    expect(INVESTMENT_VIEW_FUNCTION_CLASSIFICATION.getInvestmentEventFamily.phase).toBe("write-time")
  })
})
