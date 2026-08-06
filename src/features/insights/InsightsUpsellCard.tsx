import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"

const INCLUDED_ITEMS = [
  "Spend summary across all your subscriptions",
  "Duplicate and category-overlap detection",
  "Flags for subscriptions priced above your own category average",
  "An AI-written summary tying it all together",
]

// Free tier sees only this — no partial content, and no Edge Function call is ever
// made to get here (InsightsPage checks the tier client-side before rendering this).
export function InsightsUpsellCard() {
  return (
    <div className="mt-8 rounded-lg border border-border bg-card p-6">
      <h2 className="font-heading text-sm font-semibold text-foreground">
        Insights are a Premium feature
      </h2>
      <ul className="mt-3 space-y-1.5">
        {INCLUDED_ITEMS.map((item) => (
          <li key={item} className="text-sm text-muted-foreground">
            · {item}
          </li>
        ))}
      </ul>
      <Button type="button" size="sm" className="mt-4" render={<Link to="/profile" />}>
        Upgrade to Premium
      </Button>
    </div>
  )
}
