import { describe, expect, it } from "vitest"
import { getMissingLoginConfigKeys, isLoginConfigured } from "#/utils/login-config"

describe("login config helpers", () => {
  it("reports missing login config keys", () => {
    expect(getMissingLoginConfigKeys({
      JWT_SECRET: "",
      G_CLIENT_ID: "client",
    })).toEqual([
      "JWT_SECRET",
      "G_CLIENT_SECRET",
    ])
  })

  it("recognizes complete login config", () => {
    expect(isLoginConfigured({
      JWT_SECRET: "secret",
      G_CLIENT_ID: "client",
      G_CLIENT_SECRET: "secret",
    })).toBe(true)
  })
})
