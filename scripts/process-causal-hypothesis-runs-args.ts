const DEFAULT_BATCH_SIZE = 50
const DEFAULT_COMPACT_PENDING_LIMIT = 50000
const DEFAULT_RETRY_LIMIT = 20
const MAX_LIMIT = 5000
const MAX_BATCH_SIZE = 500
const MAX_COMPACT_PENDING_LIMIT = 200000
const MAX_RETRY_LIMIT = 1000

export interface ProcessCausalHypothesisRunsArgs {
  limit: number
  batchSize: number
  compactPendingLimit: number
  retryLimit: number
  execute: boolean
  dryRun: boolean
  json: boolean
  help: boolean
  lockOwner: string
}

export interface CliError {
  errorCode: "invalid_arguments" | "generator_config_missing" | "unexpected_runtime_error"
  phase: "argument_parse" | "config_preflight" | "runtime"
  message: string
  retryable: boolean
}

export const HELP_TEXT = `
Usage:
  pnpm events:process-causal-hypothesis-runs --limit <1..5000> [--batch-size <1..500>] [--execute] [--json]

Options:
  --limit <number>                  Max model-generation runs to claim in this invocation.
  --batch-size <number>             Per service batch size. Default: 50.
  --compact-pending-limit <number>  Max stale pending runs to supersede before processing. Default: 50000.
  --no-compact                      Skip stale pending compaction.
  --retry-limit <number>            Max due failed runs to enqueue for retry first. Default: 20.
  --lock-owner <name>               Worker lock owner prefix. Default: manual-causal-hypothesis-processor.
  --execute                         Actually process runs. Default is dry-run.
  --dry-run                         Explicit dry-run; mutually exclusive with --execute.
  --json                            Emit stable machine JSON.
  --help, -h                        Show this help text.
`.trim()

export function cliError(input: Omit<CliError, "retryable"> & { retryable?: boolean }): CliError {
  return {
    errorCode: input.errorCode,
    phase: input.phase,
    message: input.message.slice(0, 200),
    retryable: input.retryable ?? false,
  }
}

function parseBoundedInteger(raw: string | undefined, min: number, max: number) {
  if (!raw || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) return null
  return value
}

export function parseArgs(argv: string[]): { parsed?: ProcessCausalHypothesisRunsArgs, errors: CliError[] } {
  const parsed: ProcessCausalHypothesisRunsArgs = {
    limit: 0,
    batchSize: DEFAULT_BATCH_SIZE,
    compactPendingLimit: DEFAULT_COMPACT_PENDING_LIMIT,
    retryLimit: DEFAULT_RETRY_LIMIT,
    execute: false,
    dryRun: true,
    json: false,
    help: false,
    lockOwner: "manual-causal-hypothesis-processor",
  }
  const errors: CliError[] = []
  const seen = new Set<string>()

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith("--") && arg !== "-h") {
      errors.push(cliError({ errorCode: "invalid_arguments", phase: "argument_parse", message: `unknown argument ${arg}` }))
      continue
    }
    if (seen.has(arg)) {
      errors.push(cliError({ errorCode: "invalid_arguments", phase: "argument_parse", message: `duplicate argument ${arg}` }))
      continue
    }
    seen.add(arg)

    if (arg === "--help" || arg === "-h") {
      parsed.help = true
      continue
    }
    if (arg === "--json") {
      parsed.json = true
      continue
    }
    if (arg === "--execute") {
      parsed.execute = true
      parsed.dryRun = false
      continue
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true
      continue
    }
    if (arg === "--no-compact") {
      parsed.compactPendingLimit = 0
      continue
    }

    if (
      arg === "--limit"
      || arg === "--batch-size"
      || arg === "--compact-pending-limit"
      || arg === "--retry-limit"
      || arg === "--lock-owner"
    ) {
      const value = argv[index + 1]?.trim()
      if (!value || value.startsWith("-")) {
        errors.push(cliError({ errorCode: "invalid_arguments", phase: "argument_parse", message: `${arg} requires a value` }))
        continue
      }

      if (arg === "--limit") {
        const limit = parseBoundedInteger(value, 1, MAX_LIMIT)
        if (!limit) errors.push(cliError({ errorCode: "invalid_arguments", phase: "argument_parse", message: `--limit must be 1..${MAX_LIMIT}` }))
        else parsed.limit = limit
      } else if (arg === "--batch-size") {
        const batchSize = parseBoundedInteger(value, 1, MAX_BATCH_SIZE)
        if (!batchSize) errors.push(cliError({ errorCode: "invalid_arguments", phase: "argument_parse", message: `--batch-size must be 1..${MAX_BATCH_SIZE}` }))
        else parsed.batchSize = batchSize
      } else if (arg === "--compact-pending-limit") {
        const compactPendingLimit = parseBoundedInteger(value, 0, MAX_COMPACT_PENDING_LIMIT)
        if (compactPendingLimit === null) {
          errors.push(cliError({ errorCode: "invalid_arguments", phase: "argument_parse", message: `--compact-pending-limit must be 0..${MAX_COMPACT_PENDING_LIMIT}` }))
        } else {
          parsed.compactPendingLimit = compactPendingLimit
        }
      } else if (arg === "--retry-limit") {
        const retryLimit = parseBoundedInteger(value, 0, MAX_RETRY_LIMIT)
        if (retryLimit === null) errors.push(cliError({ errorCode: "invalid_arguments", phase: "argument_parse", message: `--retry-limit must be 0..${MAX_RETRY_LIMIT}` }))
        else parsed.retryLimit = retryLimit
      } else {
        parsed.lockOwner = value
      }
      index += 1
      continue
    }

    errors.push(cliError({ errorCode: "invalid_arguments", phase: "argument_parse", message: `unknown argument ${arg}` }))
  }

  if (parsed.execute && seen.has("--dry-run")) {
    errors.push(cliError({ errorCode: "invalid_arguments", phase: "argument_parse", message: "--execute and --dry-run are mutually exclusive" }))
  }
  if (!parsed.help && parsed.limit === 0) {
    errors.push(cliError({ errorCode: "invalid_arguments", phase: "argument_parse", message: "--limit is required" }))
  }

  return errors.length ? { errors } : { parsed, errors }
}
