import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/AuthContext"
import { isPremiumActive } from "@/features/premium/premium-utils"
import { formatMoney, type Currency } from "@/features/subscriptions/subscription-utils"
import { supabase } from "@/lib/supabase"
import { InsightsUpsellCard } from "./InsightsUpsellCard"

type LoadState = "loading" | "error" | "ready"

interface DuplicateGroup {
  type: "exact" | "category_overlap"
  category: string
  subscriptions: { id: string; name: string; cost: number; currency: string }[]
  combined_monthly: number
}

// "Worth a Second Look" (doc06 C-029) — deliberately not "Lower-Cost Alternatives,"
// which overpromised: this is a real-numbers, intra-portfolio category-average
// comparison, not a competitor/market-price lookup (no such data exists anywhere in
// this schema).
interface CostComparisonItem {
  subscription_id: string
  subscription_name: string
  category: string
  currency: string
  monthly_cost: number
  category_average_monthly: number
}

interface InsightsSummaryData {
  spend_summary: { by_currency: { currency: string; monthly: number; annual: number }[] }
  duplicates: DuplicateGroup[]
  cost_comparisons: CostComparisonItem[]
  ai_summary: string
}

// Only ever computed for items priced above their category average
// (insights-generate-summary's findCostComparisons filters this server-side) — this
// card never renders a below-average item, so "worth a second look" always means
// "costs more than your own average," never a false-positive on a genuinely cheap
// subscription.
function formatPercentAboveAverage(monthlyCost: number, categoryAverageMonthly: number): number | null {
  if (categoryAverageMonthly <= 0) return null
  return Math.round(((monthlyCost - categoryAverageMonthly) / categoryAverageMonthly) * 100)
}

// Mirrors AiDecisionCard.tsx's existing "Review Subscription"/"Remind Me Later"
// pattern exactly — reused, not reinvented. "Remind Me Later" is a session-local
// dismiss only (BR-001: AI never performs user actions), no mutation, resets on next
// visit. No "switch to X" CTA — there's no competitor data to back one.
function CostComparisonCardItem({ item }: { item: CostComparisonItem }) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const currency = item.currency as Currency
  const pct = formatPercentAboveAverage(item.monthly_cost, item.category_average_monthly)
  const pctClause = pct !== null ? ` — ${pct}% above your ${item.category} average of ${formatMoney(item.category_average_monthly, currency)}/mo` : `, above your ${item.category} average of ${formatMoney(item.category_average_monthly, currency)}/mo`

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm text-foreground">
        {item.subscription_name} costs {formatMoney(item.monthly_cost, currency)}/mo{pctClause}. Worth checking if a
        lower tier fits, or whether you're still getting enough value to justify the difference.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" size="sm" onClick={() => navigate(`/subscriptions/${item.subscription_id}`)}>
          Review Subscription
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setDismissed(true)}>
          Remind Me Later
        </Button>
      </div>
    </div>
  )
}

// Premium-tier content. No caching — compute-fresh every page load, bounded cost
// since only premium users can reach this, one call per visit.
function PremiumInsights() {
  const [state, setState] = useState<LoadState>("loading")
  const [data, setData] = useState<InsightsSummaryData | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.functions.invoke("insights-generate-summary", { body: {} }).then(({ data: result, error }) => {
      if (cancelled) return
      if (error || !result?.success) {
        setState("error")
        return
      }
      setData(result.data as InsightsSummaryData)
      setState("ready")
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (state === "loading") {
    return <p className="mt-8 text-sm text-muted-foreground">Loading your insights…</p>
  }

  if (state === "error" || !data) {
    return (
      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Couldn't load your insights right now. Please try refreshing the page.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-heading text-sm font-semibold text-foreground">Summary</h2>
        <p className="mt-2 text-sm text-muted-foreground">{data.ai_summary}</p>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-heading text-sm font-semibold text-foreground">Spend Summary</h2>
        {data.spend_summary.by_currency.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No active subscriptions yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {data.spend_summary.by_currency.map((total) => (
              <div key={`${total.currency}-monthly`}>
                <p className="text-xs text-muted-foreground">Monthly ({total.currency})</p>
                <p className="mt-0.5 font-heading text-xl font-semibold text-foreground">
                  {formatMoney(total.monthly, total.currency as Currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-heading text-sm font-semibold text-foreground">Duplicate &amp; Overlap Detection</h2>
        {data.duplicates.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No duplicate or overlapping subscriptions found.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {data.duplicates.map((group, index) => (
              <div key={`${group.type}-${group.category}-${index}`} className="rounded-lg border border-border p-3">
                <p className="text-sm text-foreground">
                  {group.type === "exact" ? "Duplicate: " : "Overlap: "}
                  {group.subscriptions.map((s) => s.name).join(", ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  Combined {formatMoney(group.combined_monthly, group.subscriptions[0].currency as Currency)}/mo
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-heading text-sm font-semibold text-foreground">Worth a Second Look</h2>
        {data.cost_comparisons.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing is priced notably above its category average right now.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {data.cost_comparisons.map((item) => (
              <CostComparisonCardItem key={item.subscription_id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function InsightsPage() {
  const { profile } = useAuth()
  const isPremium = isPremiumActive(profile)

  return (
    <div className="p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Insights</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Spend summaries, overlap detection, and AI-written observations across your portfolio.
        </p>

        {isPremium ? <PremiumInsights /> : <InsightsUpsellCard />}
      </div>
    </div>
  )
}
