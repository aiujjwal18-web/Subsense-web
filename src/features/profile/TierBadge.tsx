import { Badge } from "@/components/ui/badge"

export function TierBadge({ isPremium }: { isPremium: boolean }) {
  return (
    <Badge variant={isPremium ? "default" : "secondary"}>{isPremium ? "Premium" : "Free"}</Badge>
  )
}
