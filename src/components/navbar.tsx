import { fixedColumnIds, metadata } from "@shared/metadata"
import { Link, useRouterState } from "@tanstack/react-router"
import { currentColumnIDAtom } from "~/atoms"

export function NavBar() {
  const currentId = useAtomValue(currentColumnIDAtom)
  const pathname = useRouterState({
    select: state => state.location.pathname,
  })
  const { toggle } = useSearchBar()
  return (
    <span className={$([
      "flex p-3 rounded-2xl bg-primary/1 text-sm",
      "shadow shadow-primary/20 hover:shadow-primary/50 transition-shadow-500",
    ])}
    >
      <button
        type="button"
        onClick={() => toggle(true)}
        className={$(
          "px-2 hover:(bg-primary/10 rounded-md) op-70 dark:op-90",
          "cursor-pointer transition-all",
        )}
      >
        更多
      </button>
      <Link
        to="/events"
        className={$(
          "px-2 hover:(bg-primary/10 rounded-md) cursor-pointer transition-all",
          pathname === "/events" ? "color-primary font-bold" : "op-70 dark:op-90",
        )}
      >
        事件
      </Link>
      <Link
        to="/watchlists"
        className={$(
          "px-2 hover:(bg-primary/10 rounded-md) cursor-pointer transition-all",
          pathname.startsWith("/watchlists") ? "color-primary font-bold" : "op-70 dark:op-90",
        )}
      >
        监控
      </Link>
      {fixedColumnIds.map(columnId => (
        <Link
          key={columnId}
          to="/c/$column"
          params={{ column: columnId }}
          className={$(
            "px-2 hover:(bg-primary/10 rounded-md) cursor-pointer transition-all",
            currentId === columnId ? "color-primary font-bold" : "op-70 dark:op-90",
          )}
        >
          {metadata[columnId].name}
        </Link>
      ))}
    </span>
  )
}
