import { SharedSourceRuntime } from "./runtime"

const sharedSourceRuntime = new SharedSourceRuntime()

export function getSharedSourceRuntime() {
  return sharedSourceRuntime
}
