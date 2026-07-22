import { useMemo, useState } from "react"
import { CreditCard } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
  logoUrl?: string
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

const URGENCY_LABEL: Record<RenewalUrgency, string> = {
  normal: "Normal",
  upcoming: "Upcoming",
  critical: "Critical",
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

const URGENCY_COLOR: Record<RenewalUrgency, StateColor> = {
  normal: "gray",
  upcoming: "amber",
  critical: "red",
}

export function SubscriptionCard({
  name,
  logoUrl,
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

  const [logoFailed, setLogoFailed] = useState(false)
  const showLogo = Boolean(logoUrl) && !logoFailed

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
        "flex cursor-pointer flex-col gap-4 rounded-lg border border-border bg-card p-5 outline-none transition-colors duration-[120ms] ease-out hover:border-ring hover:bg-popover focus-visible:border-ring focus-visible:bg-popover",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {showLogo ? (
            <img
              src={logoUrl}
              alt=""
              onError={() => setLogoFailed(true)}
              className="size-10 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
              <CreditCard className="size-5 text-muted-foreground" />
            </div>
          )}
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
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 transition-none",
            STATE_COLOR_CLASSES[URGENCY_COLOR[renewalUrgency]]
          )}
        >
          {URGENCY_LABEL[renewalUrgency]}
        </Badge>
      </div>
    </div>
  )
}
