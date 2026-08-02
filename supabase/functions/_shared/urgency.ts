export type RenewalUrgency = "normal" | "upcoming" | "critical" | "overdue"

// Small Deno-side port of computeRenewalUrgency — source of truth is
// src/features/subscriptions/subscription-utils.ts (DEC-054 thresholds). Duplicated
// here only because the workspace-scope request in ai-generate-insight/index.ts
// carries no subscription_ids and must independently recompute the top-3-urgent
// selection server-side from the caller's own subscriptions. Keep thresholds in sync
// with the frontend copy by hand — same accepted duplication Phase 6 already has
// across the Deno/TS runtime boundary.
function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function daysUntil(dateStr: string): number {
  const target = parseDateOnly(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function computeRenewalUrgency(nextRenewalDate: string, lifecycleStatus?: string): RenewalUrgency {
  if (lifecycleStatus === "paused") return "normal"
  const days = daysUntil(nextRenewalDate)
  if (days < 0) return "overdue"
  if (days <= 2) return "critical"
  if (days <= 7) return "upcoming"
  return "normal"
}
