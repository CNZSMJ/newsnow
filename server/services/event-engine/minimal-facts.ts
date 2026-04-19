import type { EventFact, EventSubType, EventType } from "@shared/types"

export interface MinimalFactTemplateEvaluation {
  templateId: "announcement" | "policy" | "macro" | "market_move" | "generic"
  requiredFields: string[]
  populatedFields: string[]
  missingFields: string[]
  completenessPct: number
  complete: boolean
}

function evaluateFields(requiredFields: string[], present: Record<string, boolean>): MinimalFactTemplateEvaluation {
  const populatedFields = requiredFields.filter(field => present[field])
  const missingFields = requiredFields.filter(field => !present[field])
  return {
    templateId: "generic",
    requiredFields,
    populatedFields,
    missingFields,
    completenessPct: requiredFields.length ? Number(((populatedFields.length / requiredFields.length) * 100).toFixed(2)) : 100,
    complete: missingFields.length === 0,
  }
}

function findFact(facts: EventFact[], factType: string) {
  return facts.find(fact => fact.factType === factType)
}

export function evaluateMinimalFactTemplate(input: {
  eventType: EventType
  eventSubType: EventSubType
  facts: EventFact[]
}): MinimalFactTemplateEvaluation {
  if (input.eventType === "announcement") {
    const fact = findFact(input.facts, "exchange_announcement")
    const payload = fact?.payload ?? {}
    const evaluation = evaluateFields(
      ["subject", "action", "timing"],
      {
        subject: Boolean(payload.securityName || fact?.entityId),
        action: Boolean(payload.actionKind || payload.announcementTypeName || fact?.metricName),
        timing: Boolean(fact?.effectiveAt || payload.announcementStage),
      },
    )
    return {
      ...evaluation,
      templateId: "announcement",
    }
  }

  if (input.eventType === "policy") {
    const fact = findFact(input.facts, "policy_notice")
    const payload = fact?.payload ?? {}
    const evaluation = evaluateFields(
      ["issuerInstitution", "policyAction", "targetScope", "timing"],
      {
        issuerInstitution: Boolean(payload.issuerInstitution),
        policyAction: Boolean(payload.policyAction || fact?.metricName),
        targetScope: Boolean(payload.targetScope || fact?.entityId),
        timing: Boolean(payload.executionWindow || fact?.effectiveAt),
      },
    )
    return {
      ...evaluation,
      templateId: "policy",
    }
  }

  if (input.eventType === "macro") {
    const fact = input.facts.find(item => item.factType === "macro_rate" || item.factType === "central_bank_operation")
    const evaluation = evaluateFields(
      ["metricName", "currentValue", "comparison", "timing"],
      {
        metricName: Boolean(fact?.metricName),
        currentValue: Boolean(fact?.value),
        comparison: Boolean(fact?.previousValue || fact?.delta || fact?.direction),
        timing: Boolean(fact?.effectiveAt),
      },
    )
    return {
      ...evaluation,
      templateId: "macro",
    }
  }

  if (input.eventType === "market_move") {
    const fact = findFact(input.facts, "media_fast_signal")
    const payload = fact?.payload ?? {}
    const evaluation = evaluateFields(
      ["subject", "movement", "timing"],
      {
        subject: Boolean(payload.subjectText || payload.market),
        movement: Boolean(payload.magnitudeText || fact?.direction || fact?.value),
        timing: Boolean(fact?.effectiveAt),
      },
    )
    return {
      ...evaluation,
      templateId: "market_move",
    }
  }

  return {
    templateId: "generic",
    requiredFields: [],
    populatedFields: [],
    missingFields: [],
    completenessPct: 100,
    complete: true,
  }
}
