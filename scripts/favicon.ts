import fs from "node:fs"

import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { Buffer } from "node:buffer"
import { consola } from "consola"
import { originSources } from "../shared/pre-sources"

const projectDir = fileURLToPath(new URL("..", import.meta.url))
const iconsDir = join(projectDir, "public", "icons")
async function downloadImage(url: string, outputPath: string, id: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`${id}: could not fetch ${url}, status: ${response.status}`)
    }

    const image = await response.arrayBuffer()
    fs.writeFileSync(outputPath, Buffer.from(image))
    consola.success(`${id}: downloaded successfully.`)
    return true
  } catch (error) {
    return false
  }
}

async function downloadFavicon(hostname: string, outputPath: string, id: string) {
  const candidates = [...new Set([
    hostname,
    hostname.replace(/^www\./, ""),
    hostname.replace(/^[^.]+\./, ""),
  ])]

  for (const candidate of candidates) {
    try {
      const ok = await downloadImage(`https://icons.duckduckgo.com/ip3/${candidate}.ico`, outputPath, id)
      if (ok) {
        return
      }
    } catch { }
  }

  return
}

async function main() {
  await Promise.all(
    Object.entries(originSources).map(async ([id, source]) => {
      try {
        const icon = join(iconsDir, `${id}.png`)
        if (fs.existsSync(icon)) {
          // consola.info(`${id}: icon exists. skip.`)
          return
        }
        if (!source.home) return
        const hostname = new URL(source.home).hostname
        await downloadFavicon(hostname, icon, id)
      } catch (e) {
        // Silently skip missing favicons and fall back to default.png in the UI.
      }
    }),
  )
}

main()
