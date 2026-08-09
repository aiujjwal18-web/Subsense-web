import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/features/subscriptions/subscription-utils"
import { PAYMENT_REQUEST_STATUS_LABEL } from "@/features/shared-subscriptions/shared-subscription-utils"
import { useSharedPaymentActivity } from "./useSharedPaymentActivity"

function formatCycleDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// Read-only by design. Mark-paid / report-paid / send-reminder all live on
// SharedSubscriptionsPage, which already owns them and is proven working — duplicating
// those mutations here would mean two code paths for the same state transition. This
// widget answers "is anything outstanding?" and hands off for the doing.
export function SharedPaymentActivity() {
  const { state, items } = useSharedPaymentActivity()

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">
          Shared Payment Activity
        </h2>
        {items.length > 0 && (
          <Link to="/shared" className="text-xs text-primary hover:underline">
            Manage
          </Link>
        )}
      </div>

      {state === "loading" && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          Loading shared payments…
        </p>
      )}

      {state === "error" && (
        <p role="alert" className="mt-2 text-sm text-muted-foreground">
          Couldn't load shared payment activity. Please try again.
        </p>
      )}

      {state === "ready" && items.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No shared payment activity yet.</p>
      )}

      {state === "ready" && items.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {/* Direction is stated in words, never by colour or position alone —
                      "you owe" versus "owed to you" is the single most consequential
                      thing on this row and must survive being read aloud. */}
                  <span className="text-muted-foreground">
                    {item.direction === "i_owe" ? "You owe · " : "Owed to you · "}
                  </span>
                  {item.subscriptionName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.direction === "i_owe" ? "to" : "from"} {item.counterpartyName} ·{" "}
                  {formatCycleDate(item.billingCycleDate)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-foreground">
                  {formatMoney(item.amount, item.currency)}
                </p>
                <Badge variant="outline" className="mt-1">
                  {PAYMENT_REQUEST_STATUS_LABEL[item.status]}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
