import type { SourceID } from "@shared/types"

export function resolveRequestedSourceSeedIds(options?: {
  sourceIds?: SourceID[]
  replayRawIds?: string[]
}, defaults: SourceID[] = []) {
  if (!options?.sourceIds?.length && options?.replayRawIds?.length) {
    return []
  }

  return options?.sourceIds?.length ? options.sourceIds : defaults
}
