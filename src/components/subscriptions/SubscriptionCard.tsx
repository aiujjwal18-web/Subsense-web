import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CategoryIcon } from "@/components/subscriptions/CategoryIcon"
import { GlowingEffect } from "@/components/subscriptions/GlowingEffect"
import { MarkPaidDialog } from "@/components/subscriptions/MarkPaidDialog"
import { RenewalUrgencyBadge } from "@/components/subscriptions/RenewalUrgencyBadge"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
  BILLING_FREQUENCY_LABEL,
  LIFECYCLE_LABEL,
  formatRenewalLabel,
  type BillingFrequency,
  type Currency,
  type LifecycleStatus,
  type RenewalUrgency,
} from "@/features/subscriptions/subscription-utils"

export type { BillingFrequency, LifecycleStatus, RenewalUrgency }

export interface SubscriptionCardProps {
  id: string
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
  onUpdated?: () => void
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
  id,
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
  onUpdated,
  className,
}: SubscriptionCardProps) {
  const [mutating, setMutating] = useState(false)
  const [markPaidOpen, setMarkPaidOpen] = useState(false)

  const nextRenewalDateStr =
    typeof nextRenewalDate === "string" ? nextRenewalDate : nextRenewalDate.toISOString().slice(0, 10)

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

  const renewalLabel = useMemo(
    () => formatRenewalLabel(nextRenewalDateStr, renewalUrgency),
    [nextRenewalDateStr, renewalUrgency]
  )

  const handleActivate = () => {
    if (onClick) onClick()
    else console.log("open subscription details")
  }

  async function handleTogglePause() {
    const nextStatus = lifecycleStatus === "paused" ? "active" : "paused"
    setMutating(true)
    // .select().maybeSingle(), not a bare .update() — RLS silently matches zero rows on a
    // blocked write rather than throwing, so {error} alone can't tell a real success from
    // one that never touched the row (see BUILD_LOG's Phase 8 write-verification pass).
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ lifecycle_status: nextStatus })
      .eq("id", id)
      .select("id")
      .maybeSingle()
    setMutating(false)

    if (error || !data) {
      toast.error(
        nextStatus === "paused"
          ? "Couldn't pause this subscription. Please try again."
          : "Couldn't resume this subscription. Please try again."
      )
      return
    }
    toast.success(nextStatus === "paused" ? "Subscription paused" : "Subscription resumed")
    onUpdated?.()
  }

  return (
    // Plain container, deliberately NOT role="button" + tabIndex. It contains real
    // buttons (Paid/Paused/Resume) and a dialog, and nested interactive controls inside
    // an interactive ancestor are invalid — a screen reader announces one button
    // containing others, and the activation target is ambiguous (WCAG 4.1.2). The
    // whole-card click target is preserved by the stretched overlay on the title button
    // below instead, which gives exactly one unambiguous "open" control.
    <div
      className={cn(
        "relative flex cursor-pointer flex-col gap-4 rounded-lg border border-border bg-card/70 p-5 backdrop-blur-md transition-colors duration-[120ms] ease-out hover:border-primary",
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
            {/* The card's single "open" control. Its ::after is stretched over the whole
                card (absolute inset-0 resolves against the card, which is the nearest
                positioned ancestor — so this button must NOT be position:relative), which
                keeps the familiar click-anywhere-on-the-card behaviour while leaving
                exactly one focusable activation target.
                `truncate` lives on the inner span, not here: it implies overflow-hidden,
                which would clip the stretched ::after down to the text box.
                The focus ring is drawn on that same ::after so focusing the title still
                outlines the entire card, preserving the indicator added in Task 10.
                aria-label repeats the visible name, so it satisfies Label in Name
                (WCAG 2.5.3) rather than replacing the accessible name with unrelated text. */}
            <button
              type="button"
              onClick={handleActivate}
              aria-label={`Open details for ${name}`}
              className="block max-w-full text-left outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              <span className="block truncate font-heading text-sm font-medium text-foreground">
                {name}
              </span>
            </button>
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
          <p className="text-xs text-muted-foreground">{renewalLabel}</p>
        </div>
        <RenewalUrgencyBadge urgency={renewalUrgency} />
      </div>

      {lifecycleStatus !== "archived" && (
        // relative z-10 lifts the action row above the title button's stretched ::after,
        // so these buttons receive their own clicks. This replaces the previous
        // stopPropagation handlers, which were a mouse-only workaround for the card's
        // own click handler and did nothing for keyboard users. Behaviour is otherwise
        // identical: empty space within this row still does not open the card.
        <div className="relative z-10 flex items-center gap-2">
          {lifecycleStatus === "paused" ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={mutating}
              onClick={handleTogglePause}
            >
              Resume
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={mutating}
                onClick={() => setMarkPaidOpen(true)}
              >
                Paid
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={mutating}
                onClick={handleTogglePause}
              >
                Paused
              </Button>
            </>
          )}

          <MarkPaidDialog
            key={markPaidOpen ? "open" : "closed"}
            open={markPaidOpen}
            onOpenChange={setMarkPaidOpen}
            id={id}
            name={name}
            nextRenewalDate={nextRenewalDateStr}
            billingFrequency={billingFrequency}
            customIntervalDays={customIntervalDays}
            onUpdated={onUpdated}
          />
        </div>
      )}
    </div>
  )
}
