import type { NeutralRefreshIntent, SharedSourceRuntime, SourceBusinessLine } from "./runtime"

export interface SourceRuntimeDrainResult {
  processed: number
  succeeded: number
  failed: number
}

export interface SourceRefreshExecutionResult {
  fetchedAt?: number
  itemCount: number
}

export interface SourceRuntimeDrainOptions {
  businessLine?: SourceBusinessLine
  maxBatches?: number
  execute: (intent: NeutralRefreshIntent) => Promise<SourceRefreshExecutionResult>
}

export async function drainSourceRuntime(
  runtime: Pick<SharedSourceRuntime, "takeNextBatch" | "recordFetchSuccess" | "recordFetchFailure">,
  options: SourceRuntimeDrainOptions,
): Promise<SourceRuntimeDrainResult> {
  const maxBatches = Math.max(1, Math.floor(options.maxBatches ?? 20))
  const result: SourceRuntimeDrainResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
  }

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    const batch = runtime.takeNextBatch(Date.now(), { businessLine: options.businessLine })
    if (!batch.length) break

    await Promise.all(batch.map(async (intent) => {
      result.processed += 1
      try {
        const execution = await options.execute(intent)
        runtime.recordFetchSuccess({
          sourceId: intent.sourceId,
          fetchedAt: execution.fetchedAt,
          itemCount: execution.itemCount,
        })
        result.succeeded += 1
      } catch (error) {
        runtime.recordFetchFailure({
          sourceId: intent.sourceId,
          fetchedAt: Date.now(),
          error: error instanceof Error ? error.message : String(error),
        })
        result.failed += 1
      }
    }))
  }

  return result
}
