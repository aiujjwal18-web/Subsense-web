import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { CategoryIcon } from "@/components/subscriptions/CategoryIcon"
import { GlowingEffect } from "@/components/subscriptions/GlowingEffect"
import { RenewalUrgencyBadge } from "@/components/subscriptions/RenewalUrgencyBadge"
import { cn } from "@/lib/utils"
import {
  BILLING_FREQUENCY_LABEL,
  LIFECYCLE_LABEL,
  type BillingFrequency,
  type Currency,
  type LifecycleStatus,
  type RenewalUrgency,
} from "@/features/subscriptions/subscription-utils"

export type { BillingFrequency, LifecycleStatus, RenewalUrgency }

export interface SubscriptionCardProps {
  name: string
  category?: string
  cost: number
  currency: Currency
  billingFrequency: BillingFrequency
  customIntervalDays?: number
  nextRenewalDate: string | Date
  lifecycleStatus: LifecycleStatus
  renewalUrgency: RenewalUrgency
  onClick?: () => void
  className?: string
}

const FREQUENCY_SUFFIX: Record<Exclude<BillingFrequency, "custom">, string> = {
  monthly: "/mo",
  every_28_days: "/28d",
  yearly: "/yr",
}

type StateColor = "gray" | "amber" | "green" | "red"

// Colors reuse the existing chart-2/chart-3/destructive/muted-foreground tokens from index.css,
// which already resolve to the amber/green/red/gray values called out in the design spec.
const STATE_COLOR_CLASSES: Record<StateColor, string> = {
  gray: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20",
  amber: "bg-[var(--chart-2)]/10 text-[var(--chart-2)] border-[var(--chart-2)]/25",
  green: "bg-[var(--chart-3)]/10 text-[var(--chart-3)] border-[var(--chart-3)]/25",
  red: "bg-destructive/10 text-destructive border-destructive/25",
}

const LIFECYCLE_COLOR: Record<LifecycleStatus, StateColor> = {
  active: "green",
  review_due: "amber",
  renewal_confirmed: "green",
  paused: "gray",
  archived: "gray",
}

export function SubscriptionCard({
  name,
  category,
  cost,
  currency,
  billingFrequency,
  customIntervalDays,
  nextRenewalDate,
  lifecycleStatus,
  renewalUrgency,
  onClick,
  className,
}: SubscriptionCardProps) {
  const formattedCost = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(cost)
    } catch {
      return `${currency} ${cost.toFixed(2)}`
    }
  }, [cost, currency])

  const frequencySuffix =
    billingFrequency === "custom"
      ? customIntervalDays
        ? `/${customIntervalDays}d`
        : "/custom"
      : FREQUENCY_SUFFIX[billingFrequency]

  const formattedRenewalDate = useMemo(
    () =>
      new Date(nextRenewalDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [nextRenewalDate]
  )

  const handleActivate = () => {
    if (onClick) onClick()
    else console.log("open subscription details")
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${name}`}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          handleActivate()
        }
      }}
      className={cn(
        "relative flex cursor-pointer flex-col gap-4 rounded-lg border border-border bg-card/70 p-5 backdrop-blur-md outline-none transition-colors duration-[120ms] ease-out hover:border-primary focus-visible:border-primary",
        className
      )}
    >
      {(renewalUrgency === "critical" ||
        renewalUrgency === "upcoming" ||
        renewalUrgency === "overdue") && (
        <GlowingEffect glow disabled={false} spread={30} proximity={48} borderWidth={2} />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CategoryIcon category={category} />
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-medium text-foreground">
              {name}
            </p>
            <p className="text-xs text-muted-foreground">
              {BILLING_FREQUENCY_LABEL[billingFrequency]}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 transition-none",
            STATE_COLOR_CLASSES[LIFECYCLE_COLOR[lifecycleStatus]]
          )}
        >
          {LIFECYCLE_LABEL[lifecycleStatus]}
        </Badge>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-heading text-xl font-semibold text-foreground">
            {formattedCost}
            <span className="ml-0.5 text-sm font-normal text-muted-foreground">
              {frequencySuffix}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Renews {formattedRenewalDate}
          </p>
        </div>
        <RenewalUrgencyBadge urgency={renewalUrgency} />
      </div>
    </div>
  )
}
