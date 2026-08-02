import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CategoryIcon } from "@/components/subscriptions/CategoryIcon"
import { GlowingEffect } from "@/components/subscriptions/GlowingEffect"
import { RenewalUrgencyBadge } from "@/components/subscriptions/RenewalUrgencyBadge"
import { cn } from "@/lib/utils"
import { formatMoney, formatRenewalLabel, type Currency, type RenewalUrgency } from "@/features/subscriptions/subscription-utils"
import type { AiInsight, AiInsightState } from "./useAiInsight"

export interface AiDecisionCardProps {
  subscriptionId: string
  subscriptionName: string
  category?: string
  cost: number
  currency: Currency
  nextRenewalDate: string
  renewalUrgency: RenewalUrgency
  state: AiInsightState
  insight: AiInsight | null
  onRegenerate: () => void
  className?: string
}

// C-003 AI Decision Card. Content: subscription name, context, AI Insight, financial
// impact, reason, primary action "Review Subscription", secondary action "Remind Me
// Later". Doc 06's "Resolved" state is intentionally not implemented here — no
// persistence mechanism exists for it (see Phase 7 plan). "Remind Me Later" is a
// session-local dismiss only (BR-001: AI never performs user actions) — no mutation,
// resets on next visit.
export function AiDecisionCard({
  subscriptionId,
  subscriptionName,
  category,
  cost,
  currency,
  nextRenewalDate,
  renewalUrgency,
  state,
  insight,
  onRegenerate,
  className,
}: AiDecisionCardProps) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const isUrgent = renewalUrgency === "critical" || renewalUrgency === "upcoming" || renewalUrgency === "overdue"
  const isRegenerating = state === "regenerating"
  const contextLine = `${formatMoney(cost, currency)} · ${formatRenewalLabel(nextRenewalDate, renewalUrgency)}`

  const cardClasses = cn(
    "relative rounded-lg border border-border bg-card p-5 transition-colors duration-[120ms] ease-out",
    isUrgent && "border-primary/40",
    className
  )

  // Loading (no cached content yet, whether first load or first-ever regenerate).
  if (!insight && (state === "loading" || state === "regenerating")) {
    return (
      <div className={cardClasses}>
        <div className="flex items-center gap-3">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  // Suppressed (Archived/Paused) — extends DEC-064's paused-deprioritization pattern
  // to this surface. Static, state-specific copy, no Regenerate/Try-again action:
  // there's nothing to retry until the subscription's own lifecycle status changes.
  if (state === "suppressed-archived" || state === "suppressed-paused") {
    return (
      <div className={cardClasses}>
        <div className="flex items-center gap-3">
          <CategoryIcon category={category} className="size-9" iconClassName="size-4" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-sm font-medium text-foreground">{subscriptionName}</p>
            <p className="text-xs text-muted-foreground">{contextLine}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {state === "suppressed-paused"
            ? "Insight resumes when this subscription is active again."
            : "Insight unavailable for archived subscriptions."}
        </p>
      </div>
    )
  }

  // Unavailable/Error — AI_001/AI_002/AI_003, never a blocking error, always a neutral
  // fallback with a manual retry.
  if (!insight && state === "unavailable") {
    return (
      <div className={cardClasses}>
        <div className="flex items-center gap-3">
          <CategoryIcon category={category} className="size-9" iconClassName="size-4" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-sm font-medium text-foreground">{subscriptionName}</p>
            <p className="text-xs text-muted-foreground">{contextLine}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Insight unavailable right now.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5" onClick={onRegenerate}>
          <RefreshCw />
          Try again
        </Button>
      </div>
    )
  }

  // Ready — insight is guaranteed non-null past this point.
  return (
    <div className={cardClasses}>
      {isUrgent && <GlowingEffect glow disabled={false} spread={30} proximity={48} borderWidth={2} />}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CategoryIcon category={category} className="size-9" iconClassName="size-4" />
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-medium text-foreground">{subscriptionName}</p>
            <p className="text-xs text-muted-foreground">{contextLine}</p>
          </div>
        </div>
        <RenewalUrgencyBadge urgency={renewalUrgency} />
      </div>

      <p className="mt-3 text-sm text-foreground">{insight!.recommendation}</p>

      {insight!.reason && <p className="mt-2 text-xs text-muted-foreground">{insight!.reason}</p>}

      <p className="mt-3 text-xs text-muted-foreground">
        {formatMoney(insight!.financial_impact.monthly_impact, insight!.financial_impact.currency)}/mo ·{" "}
        {formatMoney(insight!.financial_impact.annual_impact, insight!.financial_impact.currency)}/yr
      </p>

      <div className="mt-4 flex items-center gap-2">
        <Button type="button" size="sm" onClick={() => navigate(`/subscriptions/${subscriptionId}`)}>
          Review Subscription
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setDismissed(true)}>
          Remind Me Later
        </Button>
        {isRegenerating && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Updating…
          </span>
        )}
      </div>
    </div>
  )
}
