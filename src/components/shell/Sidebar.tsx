import { useState } from "react"
import {
  BarChart3,
  CircleUser,
  CreditCard,
  LayoutDashboard,
  Share2,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { NavLink } from "react-router-dom"

import { cn } from "@/lib/utils"

// Sidebar width in its expanded/collapsed states — animated via motion
// (see the `motion.aside` below) instead of an instant Tailwind class jump.
// Values match the old w-16/w-56 classes exactly (4rem/14rem).
const EXPANDED_WIDTH = 224
const COLLAPSED_WIDTH = 64

interface SidebarProps {
  mobileOpen: boolean
  onCloseMobile: () => void
}

const NAV_ITEMS = [
  { label: "Decision Workspace", to: "/", icon: LayoutDashboard, end: true },
  { label: "My Subscriptions", to: "/subscriptions", icon: CreditCard, end: false },
  { label: "Shared Subscriptions", to: "/shared", icon: Share2, end: false },
  { label: "Insights", to: "/insights", icon: BarChart3, end: false },
  { label: "Profile", to: "/profile", icon: CircleUser, end: false },
]

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  // Collapsed (icon-only) by default; hovering the desktop sidebar expands
  // it. `|| mobileOpen` keeps the mobile drawer's own behavior untouched —
  // touch devices have no real hover, so without this clause the drawer
  // would default to permanently icon-only instead of showing full labels
  // whenever it's opened via the hamburger button, as it always has.
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const expanded = hoverExpanded || mobileOpen

  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            aria-hidden="true"
            onClick={onCloseMobile}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-40 bg-background/80 lg:hidden"
          />
        )}
      </AnimatePresence>
      <motion.aside
        animate={{ width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onMouseEnter={() => setHoverExpanded(true)}
        onMouseLeave={() => setHoverExpanded(false)}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {NAV_ITEMS.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onCloseMobile}
              title={!expanded ? label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  !expanded && "justify-center px-0",
                  isActive &&
                    "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                )
              }
            >
              <Icon className="size-5 shrink-0" />
              {expanded && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>
      </motion.aside>
    </>
  )
}
