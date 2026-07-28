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
      <BorderBeam duration={30} borderWidth={1} colorFrom="#FFC800" colorTo="#FFFFFF" />
      <TopBar onOpenMobileSidebar={() => setMobileOpen(true)} />
      <TopBarActions />
      <div className="flex min-h-0 flex-1">
        <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
