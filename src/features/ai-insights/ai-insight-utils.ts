import type { Currency } from "@/features/subscriptions/subscription-utils"

// DEC-079: at most 3 subscriptions (Critical or Upcoming urgency) per Decision
// Workspace batch call.
export const TOP_URGENT_LIMIT = 3

// DEC-082: free tier sees exactly 1 AI insight (the single most urgent subscription),
// no partial teaser for the rest. Must match supabase/functions/ai-generate-insight/
// index.ts's own FREE_TIER_WORKSPACE_LIMIT — duplicated across the Deno/TS runtime
// boundary, same accepted tradeoff as TOP_URGENT_LIMIT/WORKSPACE_BATCH_LIMIT above.
export const FREE_TIER_WORKSPACE_LIMIT = 1

// DEC-079: a cached insight is stale after 24 hours.
const STALENESS_HOURS = 24

// Closes a gap in the updated_at proxy above (not part of DEC-079 itself): every
// lifecycle_status change bumps subscriptions.updated_at, including a resume from
// paused, so rapid pause/resume toggling could otherwise make the cached insight look
// stale on every visit and trigger unbounded auto-regenerate calls seconds apart. This
// floor only suppresses the AUTO-triggered call in shouldRegenerateInsight below — it
// has no effect on manual Regenerate, which calls generate("manual") directly in both
// useAiInsight.ts and useWorkspaceAiInsights.ts and never goes through this function.
const MIN_AUTO_REGENERATE_INTERVAL_MS = 5 * 60 * 1000

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

  // Cooldown floor: never auto-regenerate a row generated within the last 5 minutes,
  // regardless of what updated_at says. A row this fresh is also, by construction,
  // nowhere near the 24h-max-age threshold below, so this never suppresses a
  // genuinely stale-by-age case — it only ever short-circuits the updated_at check.
  if (Date.now() - generatedAt < MIN_AUTO_REGENERATE_INTERVAL_MS) return false

  const ageHours = (Date.now() - generatedAt) / (60 * 60 * 1000)
  if (ageHours > STALENESS_HOURS) return true

  const updatedAt = new Date(subscriptionUpdatedAt).getTime()
  return updatedAt > generatedAt
}
