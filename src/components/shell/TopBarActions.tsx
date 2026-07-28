import { Bell, LogOut, Plus, Search } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/features/auth/AuthContext"

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// Floats independently of the layout grid (fixed, not part of the
// TopBar/Sidebar/Main flex flow) — see AppLayout.tsx. Rendered right after
// TopBar in the DOM (not last) so keyboard/screen-reader tab order reaches
// these controls before Sidebar nav and Main's content, matching the old
// Header-based order, even though position:fixed means DOM depth doesn't
// affect where this visually paints.
export function TopBarActions() {
  const navigate = useNavigate()
  const { session, profile, signOut } = useAuth()

  const displayName =
    (typeof profile?.display_name === "string" && profile.display_name) ||
    session?.user?.email ||
    "Account"
  const avatarUrl =
    typeof profile?.avatar_url === "string" ? profile.avatar_url : undefined
  const email = session?.user?.email

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-1">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        disabled
        aria-label="Search (coming soon)"
      >
        <Search />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => navigate("/subscriptions/add")}
        className="gap-1.5"
      >
        <Plus />
        <span className="hidden sm:inline">Add Subscription</span>
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        disabled
        aria-label="Notifications (coming soon)"
      >
        <Bell />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger className="ml-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <Avatar>
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">
                {displayName}
              </span>
              {email && displayName !== email && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {email}
                </span>
              )}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => signOut()}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
