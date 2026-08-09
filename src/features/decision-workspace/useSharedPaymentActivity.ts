import { useEffect, useRef, useState } from "react"

import { supabase } from "@/lib/supabase"
import { useAuth } from "@/features/auth/AuthContext"
import {
  PAYMENT_REQUEST_SELECT_COLUMNS,
  SHARED_SUBSCRIPTION_SELECT_COLUMNS,
  type PaymentRequestRow,
  type SharedSubscriptionRow,
} from "@/features/shared-subscriptions/shared-subscription-utils"

export type SharedPaymentActivityState = "loading" | "ready" | "error"

// Direction is resolved per row rather than per subscription: on a shared subscription
// you own, requests are money owed TO you; on one you're a member of, the request against
// your own membership is money YOU owe. A user can be in both positions at once across
// different subscriptions, so a single "am I the owner" flag would mislabel half the list.
export type PaymentDirection = "owed_to_me" | "i_owe"

export interface SharedPaymentActivityItem {
  id: string
  subscriptionName: string
  amount: number
  currency: PaymentRequestRow["currency"]
  status: PaymentRequestRow["status"]
  billingCycleDate: string
  direction: PaymentDirection
  counterpartyName: string
}

interface SharedSubscriptionWithSubscription extends SharedSubscriptionRow {
  subscriptions: {
    custom_name: string | null
    subscription_catalog: { name: string } | null
  } | null
}

interface PaymentRequestWithMember extends PaymentRequestRow {
  shared_members: { display_name: string | null; email: string | null; user_id: string | null } | null
}

// Only unsettled requests reach the workspace. `paid` and `cancelled` are closed business
// and would turn an at-a-glance decision surface into an audit log — the full history
// stays on /shared, which is unchanged.
const OPEN_STATUSES: PaymentRequestRow["status"][] = ["pending", "paid_pending_confirmation"]

/**
 * Data for Decision Workspace's Shared Payment Activity widget.
 *
 * That widget previously rendered a hardcoded "No shared payment activity yet" with no
 * query behind it at all — so a member with a genuinely pending request saw an empty
 * state that was structurally incapable of ever showing anything.
 *
 * Deliberately mirrors useSharedSubscriptionsList's proven two-step shape rather than
 * inventing a query: read shared_subscriptions (RLS policy
 * shared_subscriptions_select_owner_or_member already scopes these to shares the caller
 * owns OR is a member of — which is why no explicit owner/member filter appears here, and
 * why adding one would be the bug this widget is fixing), then read the payment_requests
 * belonging to those shares.
 *
 * `subscriptions!left` matches that hook's comment too: shared_subscriptions.subscription_id
 * is NOT NULL, so PostgREST's default embed behaves like an inner join and would silently
 * drop the entire parent row if the embedded subscription were ever invisible to the
 * caller's RLS — exactly the class of disappearance this widget is being fixed for.
 */
export function useSharedPaymentActivity() {
  const { appUser } = useAuth()
  const [state, setState] = useState<SharedPaymentActivityState>("loading")
  const [items, setItems] = useState<SharedPaymentActivityItem[]>([])
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!appUser) return
    const requestId = ++requestIdRef.current

    async function load() {
      const { data: sharedSubs, error: sharedSubsError } = await supabase
        .from("shared_subscriptions")
        .select(
          `${SHARED_SUBSCRIPTION_SELECT_COLUMNS}, subscriptions!left(custom_name, subscription_catalog(name))`
        )
        .is("archived_at", null)

      if (requestIdRef.current !== requestId) return

      if (sharedSubsError) {
        setState("error")
        return
      }

      const shares = (sharedSubs ?? []) as unknown as SharedSubscriptionWithSubscription[]
      if (shares.length === 0) {
        setItems([])
        setState("ready")
        return
      }

      const { data: prData, error: prError } = await supabase
        .from("payment_requests")
        .select(`${PAYMENT_REQUEST_SELECT_COLUMNS}, shared_members(display_name, email, user_id)`)
        .in(
          "shared_subscription_id",
          shares.map((s) => s.id)
        )
        .in("status", OPEN_STATUSES)
        .order("billing_cycle_date", { ascending: false })

      if (requestIdRef.current !== requestId) return

      if (prError) {
        setState("error")
        return
      }

      const shareById = new Map(shares.map((s) => [s.id, s]))
      const requests = (prData ?? []) as unknown as PaymentRequestWithMember[]

      const mapped: SharedPaymentActivityItem[] = []
      for (const request of requests) {
        const share = shareById.get(request.shared_subscription_id)
        if (!share) continue

        const subscriptionName =
          share.subscriptions?.subscription_catalog?.name ??
          share.subscriptions?.custom_name ??
          "Untitled subscription"

        // The debtor is the member the request is against. Comparing that member's
        // user_id to the viewer is what makes a request the viewer owes visible to them —
        // filtering on the share's owner_user_id instead would have shown owners their
        // incoming requests while hiding every member's own debt, which is precisely the
        // reported symptom.
        const isMine = request.shared_members?.user_id != null && request.shared_members.user_id === appUser!.id

        mapped.push({
          id: request.id,
          subscriptionName,
          amount: request.amount,
          currency: request.currency,
          status: request.status,
          billingCycleDate: request.billing_cycle_date,
          direction: isMine ? "i_owe" : "owed_to_me",
          counterpartyName:
            request.shared_members?.display_name ?? request.shared_members?.email ?? "A member",
        })
      }

      // Money the viewer owes first: it is the only half they can act on themselves.
      mapped.sort((a, b) => {
        if (a.direction !== b.direction) return a.direction === "i_owe" ? -1 : 1
        return b.billingCycleDate.localeCompare(a.billingCycleDate)
      })

      setItems(mapped)
      setState("ready")
    }

    void load()
  }, [appUser])

  return { state, items }
}
