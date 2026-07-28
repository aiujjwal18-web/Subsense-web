import { Menu } from "lucide-react"
import { Link } from "react-router-dom"

import { LogoIcon } from "@/components/brand/LogoIcon"

interface TopBarProps {
  onOpenMobileSidebar: () => void
}

// Full-width strip above Sidebar+Main, deliberately no background/border —
// an opaque bar here would sit between BorderBeam's top trace and the
// viewport across its whole width, hiding it (this replaces the old
// Header.tsx bar, which did exactly that).
export function TopBar({ onOpenMobileSidebar }: TopBarProps) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-4">
      <button
        type="button"
        onClick={onOpenMobileSidebar}
        aria-label="Open navigation"
        className="-ml-1 flex size-8 items-center justify-center rounded-md text-foreground hover:bg-muted lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <Link to="/" aria-label="Home" className="shrink-0">
        <LogoIcon className="size-8" />
      </Link>
    </div>
  )
}
