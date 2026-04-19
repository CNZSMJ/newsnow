import { SUBJECT_ROLE_EXTRACTION_PROMPT_DEFINITION } from "#/services/event-engine/prompts/subject-role-extractor"
import { WATCH_TARGET_CANDIDATE_PROMPT_DEFINITION } from "#/services/event-engine/prompts/watch-target-candidate-extractor"

export const EVENT_ENGINE_PROMPTS = {
  subjectRoleExtractor: SUBJECT_ROLE_EXTRACTION_PROMPT_DEFINITION,
  watchTargetCandidateExtractor: WATCH_TARGET_CANDIDATE_PROMPT_DEFINITION,
} as const

export function getSubjectRoleExtractionPromptDefinition() {
  return EVENT_ENGINE_PROMPTS.subjectRoleExtractor
}

export function getWatchTargetCandidatePromptDefinition() {
  return EVENT_ENGINE_PROMPTS.watchTargetCandidateExtractor
}
