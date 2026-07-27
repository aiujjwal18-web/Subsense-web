import { Bot, BookOpen, Briefcase, Headphones, Layers, Tv, Wrench, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Per DEC-059: no subscription ever renders a real third-party brand logo.
// Every catalog category maps to one fixed, generic Lucide icon instead —
// see 05_Design_System's Icon System section for the source table.
const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  Entertainment: Tv,
  Music: Headphones,
  Productivity: Briefcase,
  Education: BookOpen,
  Utilities: Wrench,
  "AI Tools": Bot,
  Other: Layers,
}

interface CategoryIconProps {
  category?: string | null
  className?: string
  iconClassName?: string
}

// Unrecognized/missing category (e.g. a custom, non-catalog subscription
// with no category at all) falls back to the same Layers icon as "Other",
// rather than ever falling back to an image fetch.
export function CategoryIcon({ category, className, iconClassName }: CategoryIconProps) {
  const Icon = (category && CATEGORY_ICON_MAP[category]) || Layers

  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border",
        className
      )}
    >
      <Icon className={cn("size-5 text-muted-foreground", iconClassName)} />
    </div>
  )
}
