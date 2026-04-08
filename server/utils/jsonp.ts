export function parseJSONP<T>(raw: string): T {
  const text = raw.trim()
  const start = text.indexOf("(")
  const end = text.lastIndexOf(")")

  if (start < 0 || end <= start) {
    throw new Error("Invalid JSONP response")
  }

  return JSON.parse(text.slice(start + 1, end)) as T
}
