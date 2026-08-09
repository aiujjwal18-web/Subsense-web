import { useEffect, useState } from "react"

import { useAuth } from "@/features/auth/AuthContext"
import { isPremiumActive } from "@/features/premium/premium-utils"
import { UpgradeButton } from "@/features/profile/UpgradeButton"
import { formatMoney, type Currency } from "@/features/subscriptions/subscription-utils"
import { supabase } from "@/lib/supabase"

interface PremiumPlanRow {
  plan_code: string
  name: string
  amount: number
  currency: Currency
  duration_days: number | null
}

// Reuses the Profile page's UpgradeButton verbatim rather than reimplementing checkout:
// same razorpay-create-order -> widget -> razorpay-verify-payment -> refreshProfile
// sequence, same BR-001 posture (the payment is always behind an explicit click, never
// auto-executed), and the same setCheckoutOpen() handshake that suspends the idle timer
// while Razorpay's iframe is open. Nothing about the payment path is duplicated here.
//
// plan_code is read from premium_plans the same way PlanComparisonCard reads it, rather
// than hardcoding "premium_demo_monthly" — a hardcoded code would silently 404 as
// PAY_004 if the seeded plans are ever renamed or retired.
export function RazorpayTestPanel() {
  const { profile } = useAuth()
  const isPremium = isPremiumActive(profile)
  const [plan, setPlan] = useState<PremiumPlanRow | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    let cancelled = false
    supabase
      .from("premium_plans")
      .select("plan_code, name, amount, currency, duration_days")
      .eq("is_active", true)
      .gt("amount", 0)
      .order("amount")
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setState("error")
          return
        }
        setPlan(data as PremiumPlanRow)
        setState("ready")
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state === "loading") {
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Loading plan…
      </p>
    )
  }

  if (state === "error" || !plan) {
    return (
      <p className="text-sm text-muted-foreground" role="alert">
        No active paid plan found in premium_plans. Seed one before testing checkout.
      </p>
    )
  }

  const price = plan.duration_days
    ? `${formatMoney(plan.amount, plan.currency)} / ${plan.duration_days} days`
    : formatMoney(plan.amount, plan.currency)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm text-foreground">
          {plan.name} — {price}
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{plan.plan_code}</p>
      </div>
      {isPremium ? (
        // Mirrors the Profile page rather than working around it: the real flow hides
        // Upgrade for an account that already has active premium, so this one does too.
        // Re-enabling it here would make this utility test a path the product doesn't
        // actually expose, and would charge the Test Mode account a second time.
        <p className="text-sm text-muted-foreground">
          Already on Premium — checkout is hidden here exactly as it is on Profile. Expire
          or reset this account's premium to test the flow again.
        </p>
      ) : (
        <UpgradeButton planCode={plan.plan_code} />
      )}
    </div>
  )
}
