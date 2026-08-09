import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Loader2, Plus, RefreshCw } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { CategoryIcon } from "@/components/subscriptions/CategoryIcon"
import { GlowingEffect } from "@/components/subscriptions/GlowingEffect"
import { RenewalUrgencyBadge } from "@/components/subscriptions/RenewalUrgencyBadge"
import { Button } from "@/components/ui/button"
import { AiDecisionCard } from "@/features/ai-insights/AiDecisionCard"
import { useWorkspaceAiInsights } from "@/features/ai-insights/useWorkspaceAiInsights"
import { useAuth } from "@/features/auth/AuthContext"
import { isPremiumActive } from "@/features/premium/premium-utils"
import { SharedPaymentActivity } from "./SharedPaymentActivity"
import { staggerItemMotion } from "@/lib/motion"
import { supabase } from "@/lib/supabase"
import {
  SUBSCRIPTION_SELECT_COLUMNS,
  computeRenewalUrgency,
  computeTotalsByCurrency,
  formatMoney,
  formatRenewalLabel,
  getCategoryName,
  getDisplayName,
  type SubscriptionRow,
} from "@/features/subscriptions/subscription-utils"

type LoadState = "loading" | "error" | "ready"

function SubscriptionListItem({
  row,
  onClick,
}: {
  row: SubscriptionRow
  onClick: () => void
}) {
  const name = getDisplayName(row)
  const category = getCategoryName(row)
  const urgency = computeRenewalUrgency(row.next_renewal_date, row.lifecycle_status)

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 p-2.5 text-left transition-colors duration-[120ms] ease-out hover:bg-muted"
    >
      <CategoryIcon category={category} className="size-9" iconClassName="size-4" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">
          {formatMoney(row.cost, row.currency)} · {formatRenewalLabel(row.next_renewal_date, urgency)}
        </p>
      </div>
      <RenewalUrgencyBadge urgency={urgency} />
    </button>
  )
}

export function DecisionWorkspacePage() {
  const navigate = useNavigate()
  const { appUser, profile } = useAuth()
  const [rows, setRows] = useState<SubscriptionRow[]>([])
  const [state, setState] = useState<LoadState>("loading")
  const isPremium = isPremiumActive(profile)

  // Called unconditionally (before the loading/error early returns below) — hooks
  // can't be called after a conditional return. Runs fine against the initial empty
  // `rows` and re-derives its top-3-urgent selection once the fetch below populates it.
  // `rows` is always caller-owned (see the explicit .eq("user_id", ...) filter below), so
  // useWorkspaceAiInsights never has to worry about a shared (non-owned) subscription id.
  const workspaceInsights = useWorkspaceAiInsights(rows, isPremium)

  useEffect(() => {
    // Same rationale as SubscriptionsListPage.tsx: appUser can briefly be null even after
    // this page mounts, so wait for it. Re-runs once it resolves.
    if (!appUser) return
    let cancelled = false

    supabase
      .from("subscriptions")
      .select(SUBSCRIPTION_SELECT_COLUMNS)
      // Explicit .eq("user_id", ...) — subscriptions_select_shared_member (file 34) is a
      // second, additive RLS policy, so RLS alone no longer means "this is mine": without
      // this filter, a subscription the caller merely shares in (not owns) would be pulled
      // into their own AI decision review, financial totals, and Upcoming Renewals.
      .eq("user_id", appUser.id)
      .neq("lifecycle_status", "archived")
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setState("error")
          return
        }
        setRows((data ?? []) as unknown as SubscriptionRow[])
        setState("ready")
      })

    return () => {
      cancelled = true
    }
  }, [appUser])

  if (state === "loading") {
    return (
      <div className="px-6 py-12">
        <div className="mx-auto max-w-3xl">
          {/* Announced: the page swaps from loading to content with no focus change,
              so a screen-reader user otherwise hears nothing either way (WCAG 4.1.3). */}
          <p role="status" className="text-sm text-muted-foreground">
            Loading your decision workspace…
          </p>
        </div>
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="px-6 py-12">
        <div className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-6">
          <p role="alert" className="text-sm text-muted-foreground">
            Couldn't load your decision workspace. Please try refreshing the page.
          </p>
        </div>
      </div>
    )
  }

  const totals = computeTotalsByCurrency(rows)

  const upcomingRenewals = [...rows]
    .filter((row) => row.lifecycle_status !== "paused") // DEC-064: paused excluded here as before
    .filter((row) => computeRenewalUrgency(row.next_renewal_date, row.lifecycle_status) !== "normal") // DEC-054/DEC-039: overdue/critical/upcoming only, drop >7-day normal tier
    .sort((a, b) => a.next_renewal_date.localeCompare(b.next_renewal_date))
    .slice(0, 5)

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Decision Workspace
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your subscriptions at a glance.
        </p>

        {/* Today's Financial Context */}
        <section className="relative mt-8 rounded-lg border border-border bg-card p-6">
          <GlowingEffect glow disabled={false} spread={30} proximity={48} borderWidth={2} />
          <h2 className="font-heading text-sm font-semibold text-foreground">
            Today's Financial Context
          </h2>
          {rows.length === 0 ? (
            <div className="mt-4 flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                You don't have any active subscriptions yet.
              </p>
              <Button
                type="button"
                variant="gradient"
                size="sm"
                onClick={() => navigate("/subscriptions/add")}
                className="gap-1.5"
              >
                <Plus />
                Add your first subscription
              </Button>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Active subscriptions</p>
                <p className="mt-0.5 font-heading text-xl font-semibold text-foreground">
                  {rows.length}
                </p>
              </div>
              {totals.map((total) => (
                <div key={`${total.currency}-monthly`}>
                  <p className="text-xs text-muted-foreground">
                    Monthly spend{totals.length > 1 ? ` (${total.currency})` : ""}
                  </p>
                  <p className="mt-0.5 font-heading text-xl font-semibold text-foreground">
                    {formatMoney(total.monthly, total.currency)}
                  </p>
                </div>
              ))}
              {totals.map((total) => (
                <div key={`${total.currency}-annual`}>
                  <p className="text-xs text-muted-foreground">
                    Annual spend{totals.length > 1 ? ` (${total.currency})` : ""}
                  </p>
                  <p className="mt-0.5 font-heading text-xl font-semibold text-foreground">
                    {formatMoney(total.annual, total.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* AI Insights — merged concept per DEC-067, replaces the former separate
            "AI Insights"/"Recommended Reviews" placeholders */}
        <section className="mt-6">
          <div className="flex items-center justify-between gap-3 px-1 pb-2">
            <h2 className="font-heading text-sm font-semibold text-foreground">AI Insights</h2>
            {workspaceInsights.candidates.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="gap-1"
                onClick={workspaceInsights.regenerate}
              >
                {[...workspaceInsights.entries.values()].some((entry) => entry.state === "regenerating") ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                Regenerate
              </Button>
            )}
          </div>
          {/* DEC-082: free tier's cap is explained in text, not a locked-teaser card —
              only shown when the cap actually clipped something, never to premium users
              or to a free user whose full urgent set was already ≤1. */}
          {!isPremium && workspaceInsights.allCandidateCount > workspaceInsights.candidates.length && (
            <p className="px-1 pb-2 text-xs text-muted-foreground">
              Free plan shows your single most urgent insight. Upgrade to see up to 3.
            </p>
          )}
          {workspaceInsights.candidates.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="text-sm text-muted-foreground">Nothing urgent to review right now.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workspaceInsights.candidates.map((row) => {
                const entry = workspaceInsights.entries.get(row.id)
                return (
                  <AiDecisionCard
                    key={row.id}
                    subscriptionId={row.id}
                    subscriptionName={getDisplayName(row)}
                    category={getCategoryName(row)}
                    cost={row.cost}
                    currency={row.currency}
                    nextRenewalDate={row.next_renewal_date}
                    renewalUrgency={computeRenewalUrgency(row.next_renewal_date, row.lifecycle_status)}
                    state={entry?.state ?? "loading"}
                    insight={entry?.insight ?? null}
                    onRegenerate={workspaceInsights.regenerate}
                  />
                )
              })}
            </div>
          )}
        </section>

        {/* Upcoming Renewals */}
        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-sm font-semibold text-foreground">
              Upcoming Renewals
            </h2>
            {rows.length > 0 && (
              <Link to="/subscriptions" className="text-xs text-primary hover:underline">
                View all
              </Link>
            )}
          </div>
          {upcomingRenewals.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No upcoming renewals.</p>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {upcomingRenewals.map((row, index) => (
                <motion.div key={row.id} {...staggerItemMotion(index)}>
                  <SubscriptionListItem
                    row={row}
                    onClick={() => navigate(`/subscriptions/${row.id}`)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Shared Payment Activity — see SharedPaymentActivity.tsx. Until now this
            section was a hardcoded empty state with no query behind it, so a member with
            a real pending request was shown "no activity" that could never have been
            anything else. */}
        <SharedPaymentActivity />

        {/* "Potential Savings" was rendered here as an empty placeholder card until it
            was removed for demo readiness. It is deferred scope, not a deleted feature
            (doc 16 v1.23, doc 06 C-007) — nothing was built behind it, so nothing was
            lost. When it is built, the deterministic cost-comparison engine already
            powering Insights' "Worth a Second Look" (findCostComparisons in
            supabase/functions/insights-generate-summary) is the intended source rather
            than a new calculation. */}
      </div>
    </div>
  )
}
