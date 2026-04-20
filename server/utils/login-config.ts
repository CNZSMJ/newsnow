import process from "node:process"

export const REQUIRED_LOGIN_CONFIG_KEYS = [
  "JWT_SECRET",
  "G_CLIENT_ID",
  "G_CLIENT_SECRET",
] as const

export function getMissingLoginConfigKeys(env: NodeJS.ProcessEnv = process.env) {
  return REQUIRED_LOGIN_CONFIG_KEYS.filter(key => !env[key])
}

export function isLoginConfigured(env: NodeJS.ProcessEnv = process.env) {
  return getMissingLoginConfigKeys(env).length === 0
}
