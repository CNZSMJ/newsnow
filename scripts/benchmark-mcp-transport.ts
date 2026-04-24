import process from "node:process"
import { performance } from "node:perf_hooks"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"

const DEFAULT_BASE_URL = process.env.SURFACE_BASE_URL || "http://127.0.0.1:3000"

const HELP_TEXT = `
Usage:
  pnpm perf:mcp-smoke [--base-url <url>] [--news-source <id>]

Options:
  --base-url <url>    Local service base URL. Default: ${DEFAULT_BASE_URL}
  --news-source <id>  Source id for get_hotest_latest_news. Default: wallstreetcn-quick
  --help, -h          Show this help text.
`.trim()

function parseArgs(argv: string[]) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    newsSource: "wallstreetcn-quick",
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") {
      args.help = true
      continue
    }
    if (arg === "--base-url") {
      args.baseUrl = String(argv[index + 1] || DEFAULT_BASE_URL).replace(/\/$/, "")
      index += 1
      continue
    }
    if (arg === "--news-source") {
      args.newsSource = String(argv[index + 1] || args.newsSource)
      index += 1
    }
  }

  return args
}

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const startedAt = performance.now()
  try {
    const result = await client.request({
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    }, CallToolResultSchema)
    return {
      name,
      ok: true,
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      contentCount: result.content?.length ?? 0,
      hasStructuredContent: Boolean(result.structuredContent),
    }
  } catch (error) {
    return {
      name,
      ok: false,
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP_TEXT)
    return
  }

  const client = new Client({
    name: "newsnow-surface-benchmark",
    version: "0.0.1",
  })
  const transport = new StreamableHTTPClientTransport(new URL(`${args.baseUrl}/api/mcp`))

  await client.connect(transport)
  const samples = [
    await callTool(client, "get_hotest_latest_news", {
      id: args.newsSource,
      count: 3,
    }),
    await callTool(client, "event_get_latest_events", {
      count: 3,
      sort: "latest",
    }),
  ]
  await client.close()

  console.log(JSON.stringify({
    status: samples.every(sample => sample.ok) ? "success" : "failed",
    updatedTime: Date.now(),
    command: "pnpm perf:mcp-smoke",
    baseUrl: args.baseUrl,
    samples,
  }, null, 2))

  if (samples.some(sample => !sample.ok)) {
    process.exitCode = 1
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
