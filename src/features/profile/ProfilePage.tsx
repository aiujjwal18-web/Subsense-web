import { useAuth } from "@/features/auth/AuthContext"
import { isPremiumActive } from "@/features/premium/premium-utils"
import { PlanComparisonCard } from "./PlanComparisonCard"
import { TierBadge } from "./TierBadge"

export function ProfilePage() {
  const { profile } = useAuth()
  const isPremium = isPremiumActive(profile)

  return (
    <div className="p-8">
      <div className="flex items-center gap-2">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Profile</h1>
        <TierBadge isPremium={isPremium} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Manage your SubSense plan.</p>

      <PlanComparisonCard />
    </div>
  )
}
