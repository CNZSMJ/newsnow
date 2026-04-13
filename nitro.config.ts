import process from "node:process"
import { join, resolve } from "node:path"
import { config as loadEnv } from "dotenv"
import viteNitro from "vite-plugin-with-nitro"
import { RollopGlob } from "./tools/rollup-glob"
import { projectDir } from "./shared/dir"

loadEnv({
  path: resolve(projectDir, ".env.server"),
})

const newsnowDataDir = resolve(projectDir, process.env.DATA_DIR || ".data")
const localDatabaseConfig = {
  default: {
    connector: "better-sqlite3",
    options: {
      path: join(newsnowDataDir, "db.sqlite3"),
    },
  },
} as const
const localStorageConfig = {
  data: {
    driver: "fs",
    base: join(newsnowDataDir, "kv"),
  },
} as const

const nitroOption: Parameters<typeof viteNitro>[0] = {
  experimental: {
    database: true,
  },
  rollupConfig: {
    plugins: [RollopGlob()],
  },
  sourceMap: false,
  imports: {
    dirs: ["server/utils", "shared"],
  },
  preset: "node-server",
  alias: {
    "@shared": join(projectDir, "shared"),
    "#": join(projectDir, "server"),
  },
}

if (process.env.VERCEL) {
  nitroOption.preset = "vercel-edge"
  // You can use other online database, do it yourself. For more info: https://db0.unjs.io/connectors
  nitroOption.database = undefined
  // nitroOption.vercel = {
  //   config: {
  //     cache: []
  //   },
  // }
} else if (process.env.CF_PAGES) {
  nitroOption.preset = "cloudflare-pages"
  nitroOption.unenv = {
    alias: {
      "safer-buffer": "node:buffer",
    },
  }
  nitroOption.database = {
    default: {
      connector: "cloudflare-d1",
      options: {
        bindingName: "NEWSNOW_DB",
      },
    },
  }
} else if (process.env.BUN) {
  nitroOption.preset = "bun"
  nitroOption.database = {
    default: {
      connector: "bun-sqlite",
    },
  }
} else {
  nitroOption.database = localDatabaseConfig
  nitroOption.devDatabase = localDatabaseConfig
  nitroOption.storage = localStorageConfig
  nitroOption.devStorage = localStorageConfig
}

export default function () {
  return viteNitro(nitroOption)
}
