import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { RenewalUrgency } from "@/features/subscriptions/subscription-utils"

const URGENCY_LABEL: Record<RenewalUrgency, string> = {
  normal: "Normal",
  upcoming: "Upcoming",
  critical: "Critical",
}

// Reuses the same chart-2/destructive/muted-foreground tokens as SubscriptionCard's
// lifecycle badge, kept local since urgency only ever needs gray/amber/red (no green).
const URGENCY_CLASSES: Record<RenewalUrgency, string> = {
  normal: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20",
  upcoming: "bg-[var(--chart-2)]/10 text-[var(--chart-2)] border-[var(--chart-2)]/25",
  critical: "bg-destructive/10 text-destructive border-destructive/25",
}

export function RenewalUrgencyBadge({
  urgency,
  className,
}: {
  urgency: RenewalUrgency
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 transition-none", URGENCY_CLASSES[urgency], className)}
    >
      {URGENCY_LABEL[urgency]}
    </Badge>
  )
}
