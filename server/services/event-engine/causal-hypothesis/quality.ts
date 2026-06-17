import { z } from "zod"
import type {
  CausalHypothesisModelHypothesis,
  CausalHypothesisModelOutput,
  CausalHypothesisValidationContext,
  CausalHypothesisValidationResult,
} from "#/services/event-engine/causal-hypothesis/types"

const modelHypothesisSchema = z.object({
  statement: z.string().trim().min(1),
  causeType: z.enum([
    "policy_or_regulation",
    "macro_or_liquidity",
    "industry_supply_demand",
    "company_action",
    "market_flow_or_sentiment",
    "external_event",
  ]),
  basis: z.enum(["stated", "inferred"]),
  confidence: z.number().finite().min(0).max(1),
  rationale: z.string().trim().min(1),
  evidenceIds: z.array(z.string().trim().min(1)).min(1),
  factIds: z.array(z.string().trim().min(1)),
  evidenceSpans: z.array(z.object({
    evidenceId: z.string().trim().min(1),
    field: z.enum(["title", "summary", "payload"]),
    snippet: z.string().optional(),
    offset: z.number().int().min(0).optional(),
  })),
})

const modelOutputSchema = z.object({
  status: z.enum(["available", "unknown"]),
  confidence: z.number().finite().min(0).max(1),
  hypotheses: z.array(modelHypothesisSchema).max(3),
  unknownReason: z.string().trim().min(1).nullable(),
}).superRefine((output, context) => {
  if (output.status === "available" && output.hypotheses.length < 1) {
    context.addIssue({
      code: "custom",
      path: ["hypotheses"],
      message: "available output requires at least one hypothesis",
    })
  }

  if (output.status === "unknown") {
    if (output.hypotheses.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["hypotheses"],
        message: "unknown output requires empty hypotheses",
      })
    }
    if (!output.unknownReason) {
      context.addIssue({
        code: "custom",
        path: ["unknownReason"],
        message: "unknown output requires unknownReason",
      })
    }
  }
})

function summarizeZodError(error: z.ZodError) {
  return error.issues
    .slice(0, 4)
    .map(issue => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ")
}

function hasInvalidReferences(
  hypothesis: CausalHypothesisModelHypothesis,
  context: CausalHypothesisValidationContext,
) {
  const evidenceIds = new Set(context.selectedEvidenceIds)
  const factIds = new Set(context.selectedFactIds)

  if (!hypothesis.evidenceIds.length) return true
  if (hypothesis.evidenceIds.some(evidenceId => !evidenceIds.has(evidenceId))) return true
  if (hypothesis.factIds.some(factId => !factIds.has(factId))) return true
  if (hypothesis.evidenceSpans.some(span => !hypothesis.evidenceIds.includes(span.evidenceId))) return true

  return false
}

export function validateCausalHypothesisModelOutput(
  payload: unknown,
  context: CausalHypothesisValidationContext,
): CausalHypothesisValidationResult {
  const parsed = modelOutputSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      valid: false,
      runStatus: "failed",
      output: null,
      acceptedHypotheses: [],
      invalidHypothesisCount: 0,
      errorCode: "causal_hypothesis_schema_invalid",
      validationSummary: summarizeZodError(parsed.error),
    }
  }

  const output = parsed.data satisfies CausalHypothesisModelOutput
  if (output.status === "unknown") {
    return {
      valid: true,
      runStatus: "unknown",
      output,
      acceptedHypotheses: [],
      invalidHypothesisCount: 0,
      errorCode: null,
      validationSummary: null,
    }
  }

  const acceptedHypotheses = output.hypotheses.filter(hypothesis => !hasInvalidReferences(hypothesis, context))
  const invalidHypothesisCount = output.hypotheses.length - acceptedHypotheses.length

  if (!acceptedHypotheses.length) {
    return {
      valid: false,
      runStatus: "failed",
      output: null,
      acceptedHypotheses: [],
      invalidHypothesisCount,
      errorCode: "causal_hypothesis_invalid_references",
      validationSummary: "all hypotheses reference missing evidence or facts",
    }
  }

  return {
    valid: true,
    runStatus: "succeeded",
    output: {
      ...output,
      hypotheses: acceptedHypotheses,
    },
    acceptedHypotheses,
    invalidHypothesisCount,
    errorCode: null,
    validationSummary: null,
  }
}
