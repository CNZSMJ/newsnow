import { useRegisterSW } from "virtual:pwa-register/react"
import { useToast } from "./useToast"

export function usePWA() {
  const toaster = useToast()
  const { updateServiceWorker, needRefresh: [needRefresh] } = useRegisterSW()
  const promptedRef = useRef(false)

  const update = useCallback(() => {
    return updateServiceWorker().then(() => localStorage.setItem("updated", "1"))
  }, [updateServiceWorker])

  useEffect(() => {
    if (localStorage.getItem("updated")) {
      localStorage.removeItem("updated")
      toaster("更新成功，赶快体验吧", {
        action: {
          label: "查看更新",
          onClick: () => {
            window.open(`${Homepage}/releases/tag/v${Version}`)
          },
        },
      })
    }
  }, [toaster])

  useEffect(() => {
    if (!needRefresh || promptedRef.current) return
    if ("onLine" in navigator && !navigator.onLine) return

    promptedRef.current = true
    toaster("前端已有新构建，5 秒后自动刷新", {
      action: {
        label: "立刻刷新",
        onClick: update,
      },
      onDismiss: update,
    })
  }, [needRefresh, toaster, update])
}
