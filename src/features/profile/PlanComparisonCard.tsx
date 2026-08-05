import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/features/auth/AuthContext"
import { isPremiumActive } from "@/features/premium/premium-utils"
import { formatMoney, type Currency } from "@/features/subscriptions/subscription-utils"
import { supabase } from "@/lib/supabase"
import { UpgradeButton } from "./UpgradeButton"

interface PremiumPlanRow {
  id: string
  plan_code: string
  name: string
  amount: number
  currency: Currency
  duration_days: number | null
  is_active: boolean
}

function formatPlanPrice(plan: PremiumPlanRow): string {
  if (plan.amount <= 0) return "Free"
  const price = formatMoney(plan.amount, plan.currency)
  return plan.duration_days ? `${price} / ${plan.duration_days} days` : price
}

// Renders generically from whatever active premium_plans rows exist — not hardcoded
// to today's 2 seeded rows (free, premium_demo_monthly) — future-proof if a plan is
// added or retired later.
export function PlanComparisonCard() {
  const { profile } = useAuth()
  const isPremium = isPremiumActive(profile)
  const [plans, setPlans] = useState<PremiumPlanRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from("premium_plans")
      .select("id, plan_code, name, amount, currency, duration_days, is_active")
      .eq("is_active", true)
      .order("amount")
      .then(({ data }) => {
        if (cancelled) return
        setPlans((data as PremiumPlanRow[] | null) ?? [])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6">
      <h2 className="font-heading text-sm font-semibold text-foreground">Plan</h2>
      {loading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading plans…</p>
      ) : (
        <div className="mt-4 space-y-3">
          {plans.map((plan) => {
            const isFree = plan.amount <= 0
            const isCurrentPlan = isFree ? !isPremium : isPremium
            return (
              <div
                key={plan.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">{formatPlanPrice(plan)}</p>
                </div>
                {isCurrentPlan ? (
                  <Badge variant="outline">Current Plan</Badge>
                ) : (
                  !isFree && !isPremium && <UpgradeButton planCode={plan.plan_code} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
