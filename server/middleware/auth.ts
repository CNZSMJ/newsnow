import process from "node:process"
import { jwtVerify } from "jose"
import { isLoginConfigured } from "#/utils/login-config"

function isPublicApi(pathname: string, method: string) {
  if ([
    "/api/health",
    "/api/enable-login",
    "/api/s",
    "/api/proxy",
    "/api/latest",
    "/api/mcp",
    "/api/watchlists",
    "/api/investment-watchlists",
    "/api/ops/events/status",
    "/api/investment-events/latest",
    "/api/investment-events/search",
    "/api/investment-events/entity",
  ].some(prefix => pathname.startsWith(prefix))) {
    return true
  }

  if (method === "GET" && pathname.startsWith("/api/investment-events/")) {
    return true
  }

  if (method === "GET" && pathname.startsWith("/api/investment-watchlists/")) {
    return true
  }

  return false
}

function shouldResolveJwt(pathname: string) {
  return [
    "/api/s",
    "/api/me",
    "/api/ops/events/refresh",
  ].some(prefix => pathname.startsWith(prefix))
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith("/api")) return
  const publicApi = isPublicApi(url.pathname, event.node.req.method ?? "GET")
  if (!isLoginConfigured(process.env)) {
    event.context.disabledLogin = true
    if (!publicApi)
      throw createError({ statusCode: 506, message: "Server not configured, disable login" })
  } else {
    if (shouldResolveJwt(url.pathname)) {
      const token = getHeader(event, "Authorization")?.replace(/Bearer\s*/, "")?.trim()
      if (token) {
        try {
          const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET)) as { payload?: { id: string, type: string } }
          if (payload?.id) {
            event.context.user = {
              id: payload.id,
              type: payload.type,
            }
          }
        } catch {
          if (url.pathname.startsWith("/api/me") || url.pathname.startsWith("/api/ops/events/refresh"))
            throw createError({ statusCode: 401, message: "JWT verification failed" })
          else logger.warn("JWT verification failed")
        }
      } else if (url.pathname.startsWith("/api/me") || url.pathname.startsWith("/api/ops/events/refresh")) {
        throw createError({ statusCode: 401, message: "JWT verification failed" })
      }
    }
  }
})
