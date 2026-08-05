import type { UserProfile } from "@/features/auth/AuthContext"

// UI-convenience check only, not a security boundary — Edge Functions call the
// live public.user_has_active_premium(uuid) DB function instead of reimplementing
// this rule (17_SubSense_Migration_v2.sql:459-473, already the project's live
// server-side entitlement check). Computing this from the already-in-memory
// `profile` avoids an extra round trip for what's purely a rendering decision.
export function isPremiumActive(profile: UserProfile | null): boolean {
  if (!profile?.is_premium) return false
  if (!profile.premium_expires_at) return true
  return new Date(profile.premium_expires_at).getTime() > Date.now()
}
