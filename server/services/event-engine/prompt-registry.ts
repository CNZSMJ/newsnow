import { SUBJECT_ROLE_EXTRACTION_PROMPT_DEFINITION } from "#/services/event-engine/prompts/subject-role-extractor"
import { CAUSAL_HYPOTHESIS_PROMPT_DEFINITION } from "#/services/event-engine/prompts/causal-hypothesis-generator"
import { WATCH_TARGET_CANDIDATE_PROMPT_DEFINITION } from "#/services/event-engine/prompts/watch-target-candidate-extractor"

export const EVENT_ENGINE_PROMPTS = {
  causalHypothesisGenerator: CAUSAL_HYPOTHESIS_PROMPT_DEFINITION,
  subjectRoleExtractor: SUBJECT_ROLE_EXTRACTION_PROMPT_DEFINITION,
  watchTargetCandidateExtractor: WATCH_TARGET_CANDIDATE_PROMPT_DEFINITION,
} as const

export function getCausalHypothesisPromptDefinition() {
  return EVENT_ENGINE_PROMPTS.causalHypothesisGenerator
}

export function getSubjectRoleExtractionPromptDefinition() {
  return EVENT_ENGINE_PROMPTS.subjectRoleExtractor
}

export function getWatchTargetCandidatePromptDefinition() {
  return EVENT_ENGINE_PROMPTS.watchTargetCandidateExtractor
}
