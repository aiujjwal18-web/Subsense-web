import { Bell, LogOut, Menu, Plus, Search } from "lucide-react"
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

interface HeaderProps {
  onOpenMobileSidebar: () => void
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

export function Header({ onOpenMobileSidebar }: HeaderProps) {
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
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <button
        type="button"
        onClick={onOpenMobileSidebar}
        aria-label="Open navigation"
        className="-ml-1 flex size-8 items-center justify-center rounded-md text-foreground hover:bg-muted lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <span className="font-heading text-lg font-semibold text-foreground">
        SubSense
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
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
          variant="ghost"
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
    </header>
  )
}
