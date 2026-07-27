import { useState } from "react"
import { Outlet } from "react-router-dom"

import { BorderBeam } from "@/components/ui/border-beam"
import { Header } from "@/components/shell/Header"
import { Sidebar } from "@/components/shell/Sidebar"

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="relative flex h-dvh overflow-hidden bg-background text-foreground">
      <BorderBeam duration={30} borderWidth={1} colorFrom="#FFC800" colorTo="#FFFFFF" />
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMobileSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
