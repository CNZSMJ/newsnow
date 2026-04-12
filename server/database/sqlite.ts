export function getRows<T>(res: { results?: unknown[] } | unknown[] | null | undefined): T[] {
  if (Array.isArray(res))
    return res as T[]

  if (res && Array.isArray(res.results))
    return res.results as T[]

  return []
}

export function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
