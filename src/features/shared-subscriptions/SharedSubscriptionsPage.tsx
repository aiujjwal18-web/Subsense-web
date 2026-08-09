import { useState } from "react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PaymentRequestItem } from "@/components/shared-subscriptions/PaymentRequestItem"
import { SharedMemberRow } from "@/components/shared-subscriptions/SharedMemberRow"
import { useAuth } from "@/features/auth/AuthContext"
import { useSharedSubscriptionsList } from "@/features/shared-subscriptions/useSharedSubscriptionsList"
import { SPLIT_METHOD_LABEL, getMemberDisplayName } from "@/features/shared-subscriptions/shared-subscription-utils"

// Landing page for every subscription the caller shares — as owner or as a linked member.
// This is a linked member's ONLY way to act on a payment request: SubscriptionDetailsPage
// is owner-scoped by RLS (subscriptions_select_own), so a member who isn't the owner can
// never navigate there for someone else's subscription. Member-roster management
// (add/edit/remove) stays owner-only, reached via "Manage" -> SubscriptionDetailsPage's
// "Manage sharing" section — DEC-080 names that as the single entry point for setup and
// ongoing management, not a second flow duplicated here.
export function SharedSubscriptionsPage() {
  const { appUser } = useAuth()
  const { state, items, mutating, ownerMarkPaid, reportPaid, sendReminder } = useSharedSubscriptionsList()
  // Per-card view mode, keyed by shared_subscription id. Absent key means "pending",
  // so cards start filtered without needing to be seeded when the list loads.
  const [viewMode, setViewMode] = useState<Record<string, "pending" | "all">>({})

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Shared Subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Subscriptions you share, and what everyone owes.
        </p>

        {/* Announced: this region swaps between loading, error and content with no
            focus change, so a screen-reader user otherwise gets silence (WCAG 4.1.3). */}
        {state === "loading" && (
          <p role="status" className="mt-6 text-sm text-muted-foreground">Loading…</p>
        )}

        {state === "error" && (
          <p role="alert" className="mt-6 text-sm text-muted-foreground">Couldn't load your shared subscriptions. Please try again.</p>
        )}

        {state === "ready" && items.length === 0 && (
          <div className="mt-6 rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              Nothing shared yet. Open a subscription's details and use "Share this subscription" to split its cost.
            </p>
          </div>
        )}

        {state === "ready" && items.length > 0 && (
          <div className="mt-6 space-y-4">
            {items.map((item) => {
              const paidCount = item.paymentRequests.filter((r) => r.status === "paid").length
              const mode = viewMode[item.sharedSubscription.id] ?? "pending"
              // Display filter only — the fetched list is untouched, nothing is deleted
              // or archived, and "All" restores the full set from memory.
              const visibleRequests =
                mode === "pending"
                  ? item.paymentRequests.filter((r) => r.status !== "paid")
                  : item.paymentRequests

              return (
              <section key={item.sharedSubscription.id} className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-heading text-sm font-semibold text-foreground">{item.subscriptionName}</h2>
                    <Badge variant="outline">{SPLIT_METHOD_LABEL[item.sharedSubscription.split_method]}</Badge>
                    {!item.isOwner && <Badge variant="outline">Member</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Only offered once something is actually hidden: with no paid
                        requests, both states show the same list.
                        The visible label names the CURRENT state, so the accessible name
                        spells out both that state and what clicking does — a lone word
                        like "Pending" is otherwise ambiguous between the two. */}
                    {paidCount > 0 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setViewMode((prev) => ({
                            ...prev,
                            [item.sharedSubscription.id]: mode === "pending" ? "all" : "pending",
                          }))
                        }
                        aria-label={
                          mode === "pending"
                            ? `Showing pending only. Click to show all, including ${paidCount} paid.`
                            : "Showing all. Click to show pending only."
                        }
                      >
                        {mode === "pending" ? "Pending" : "All"}
                      </Button>
                    )}
                    {item.isOwner && (
                      <Button type="button" variant="outline" size="sm" render={<Link to={`/subscriptions/${item.subscriptionId}`} />}>
                        Manage
                      </Button>
                    )}
                  </div>
                </div>

                {item.members.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {item.members.map((member) => (
                      <SharedMemberRow
                        key={member.id}
                        member={member}
                        splitMethod={item.sharedSubscription.split_method}
                        isOwner={false}
                        onEdit={() => {}}
                        onRemove={() => {}}
                      />
                    ))}
                  </div>
                )}

                {item.paymentRequests.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Payment requests
                    </h3>
                    <div className="mt-2 space-y-2">
                      {visibleRequests.map((request) => (
                        <PaymentRequestItem
                          key={request.id}
                          request={request}
                          memberName={getMemberDisplayName(
                            request.shared_members ?? { display_name: null, email: null }
                          )}
                          isOwner={item.isOwner}
                          isSelf={appUser != null && request.shared_members?.user_id === appUser.id}
                          onOwnerMarkPaid={() => ownerMarkPaid(request.id)}
                          onReportPaid={() => reportPaid(request.id)}
                          onSendReminder={() => sendReminder(request.id)}
                          mutating={mutating}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
