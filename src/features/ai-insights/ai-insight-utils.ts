import type { Currency } from "@/features/subscriptions/subscription-utils"

// DEC-079: at most 3 subscriptions (Critical or Upcoming urgency) per Decision
// Workspace batch call.
export const TOP_URGENT_LIMIT = 3

// DEC-079: a cached insight is stale after 24 hours.
const STALENESS_HOURS = 24

export interface FinancialImpact {
  monthly_impact: number
  annual_impact: number
  currency: Currency
}

export interface CachedInsightRow {
  id: string
  subscription_id: string | null
  recommendation_text: string
  reason_text: string | null
  financial_impact: FinancialImpact
  model_version: string
  generated_at: string
  created_at: string
}

// DEC-079's staleness rule: regenerate if no cached row exists, the row is over 24
// hours old, or the subscription has changed since it was generated. ai_recommendations
// stores no snapshot of next_renewal_date/lifecycle_status to compare the current
// subscription against (and the table isn't altered to add one — out of scope) —
// subscriptions.updated_at is used as the practical proxy instead: its generic
// touch_updated_at trigger already bumps it on any column change, a superset of just
// those two fields. This makes regeneration occasionally more eager than the literal
// rule requires, never less.
export function shouldRegenerateInsight(cachedRow: CachedInsightRow | null, subscriptionUpdatedAt: string): boolean {
  if (!cachedRow) return true

  const generatedAt = new Date(cachedRow.generated_at).getTime()
  const ageHours = (Date.now() - generatedAt) / (60 * 60 * 1000)
  if (ageHours > STALENESS_HOURS) return true

  const updatedAt = new Date(subscriptionUpdatedAt).getTime()
  return updatedAt > generatedAt
}
