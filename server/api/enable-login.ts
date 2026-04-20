import process from "node:process"
import { getMissingLoginConfigKeys, isLoginConfigured } from "#/utils/login-config"

export default defineEventHandler(async () => {
  if (!isLoginConfigured(process.env)) {
    return {
      enable: false,
      message: "Server not configured, disable login",
      missingConfig: getMissingLoginConfigKeys(process.env),
    }
  }

  return {
    enable: true,
    url: `https://github.com/login/oauth/authorize?client_id=${process.env.G_CLIENT_ID}`,
  }
})
