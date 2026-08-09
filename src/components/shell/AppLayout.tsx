import { useState } from "react"
import { Outlet } from "react-router-dom"

import { BorderBeam } from "@/components/ui/border-beam"
import { Sidebar } from "@/components/shell/Sidebar"
import { TopBar } from "@/components/shell/TopBar"
import { TopBarActions } from "@/components/shell/TopBarActions"

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* WCAG 2.4.1 Bypass Blocks: every route repeats the sidebar's nav items before
          its own content, so a keyboard or screen-reader user otherwise tabs through
          the whole nav on every navigation. Hidden until focused, then rendered as a
          normal focusable control — never display:none, which would remove it from the
          tab order and defeat the purpose. */}
      <a
        href="#main-content"
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60]"
      >
        Skip to main content
      </a>
      <BorderBeam size={320} duration={10} borderWidth={2} colorFrom="#A3E635" colorTo="#F1F5F9" />
      <TopBar onOpenMobileSidebar={() => setMobileOpen(true)} />
      <TopBarActions />
      <div className="flex min-h-0 flex-1">
        <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
        {/* tabIndex={-1} makes <main> a valid target for the skip link above: without it
            the browser moves the viewport but not focus, so the next Tab would resume
            from the nav the user just skipped. */}
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
