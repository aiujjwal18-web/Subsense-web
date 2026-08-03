import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { supabase } from "@/lib/supabase"
import { useAuth } from "@/features/auth/AuthContext"
import { getDisplayName } from "@/features/subscriptions/subscription-utils"
import {
  PAYMENT_REQUEST_SELECT_COLUMNS,
  SHARED_MEMBER_SELECT_COLUMNS,
  SHARED_SUBSCRIPTION_SELECT_COLUMNS,
  type PaymentRequestRow,
  type SharedMemberRow,
  type SharedSubscriptionRow,
} from "./shared-subscription-utils"

export type SharedSubscriptionsListState = "loading" | "ready" | "error"

// Embeds the requesting member's identity directly — needed both to display a name for a
// since-removed member (history preserved, DEC-080) and to determine `isSelf` for the
// current viewer, since a linked member's own membership row may not appear in the
// active-only `members` list below if they've since been removed.
export interface PaymentRequestWithMember extends PaymentRequestRow {
  shared_members: { display_name: string | null; email: string | null; user_id: string | null } | null
}

export interface SharedSubscriptionListItem {
  sharedSubscription: SharedSubscriptionRow
  subscriptionId: string
  subscriptionName: string
  isOwner: boolean
  members: SharedMemberRow[]
  paymentRequests: PaymentRequestWithMember[]
}

interface SharedSubscriptionWithSubscription extends SharedSubscriptionRow {
  subscriptions: {
    custom_name: string | null
    subscription_catalog: { name: string } | null
  } | null
}

export interface UseSharedSubscriptionsListResult {
  state: SharedSubscriptionsListState
  items: SharedSubscriptionListItem[]
  mutating: boolean
  // A linked member has no RLS access to SubscriptionDetailsPage (owner-scoped) — this
  // landing page is their only surface for these three actions, so the list hook carries
  // them directly rather than leaving payment actions to useSharedSubscription alone.
  ownerMarkPaid: (paymentRequestId: string) => Promise<boolean>
  reportPaid: (paymentRequestId: string) => Promise<boolean>
  sendReminder: (paymentRequestId: string) => Promise<boolean>
}

// Landing-page data for SharedSubscriptionsPage.tsx: every shared_subscriptions row where
// the caller is owner or member — RLS (shared_subscriptions_select_owner_or_member)
// already scopes this, no explicit owner/member filter needed in the query itself. Only
// non-archived shares are shown, matching this app's existing "archived means hidden from
// primary views, history preserved" convention elsewhere (e.g. SubscriptionsListPage).
export function useSharedSubscriptionsList(): UseSharedSubscriptionsListResult {
  const { appUser } = useAuth()
  const [state, setState] = useState<SharedSubscriptionsListState>("loading")
  const [items, setItems] = useState<SharedSubscriptionListItem[]>([])
  const [mutating, setMutating] = useState(false)
  // Same pattern as useSharedSubscription.ts: load() is declared inside the effect
  // (react-hooks/set-state-in-effect flags a call to an externally-declared function from
  // an effect body), and mutations bump this to trigger a refetch rather than calling
  // load() directly.
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestIdRef.current

    async function load() {
      const { data: sharedSubs, error: sharedSubsError } = await supabase
        .from("shared_subscriptions")
        .select(`${SHARED_SUBSCRIPTION_SELECT_COLUMNS}, subscriptions(custom_name, subscription_catalog(name))`)
        .is("archived_at", null)
        .order("created_at", { ascending: false })

      if (requestIdRef.current !== requestId) return

      if (sharedSubsError) {
        setState("error")
        return
      }

      const rows = (sharedSubs ?? []) as unknown as SharedSubscriptionWithSubscription[]

      if (rows.length === 0) {
        setItems([])
        setState("ready")
        return
      }

      const sharedSubIds = rows.map((r) => r.id)

      const [{ data: memberData, error: memberError }, { data: prData, error: prError }] = await Promise.all([
        supabase
          .from("shared_members")
          .select(SHARED_MEMBER_SELECT_COLUMNS)
          .in("shared_subscription_id", sharedSubIds)
          .eq("status", "active")
          .order("joined_at", { ascending: true }),
        supabase
          .from("payment_requests")
          .select(`${PAYMENT_REQUEST_SELECT_COLUMNS}, shared_members(display_name, email, user_id)`)
          .in("shared_subscription_id", sharedSubIds)
          .order("billing_cycle_date", { ascending: false }),
      ])

      if (requestIdRef.current !== requestId) return

      if (memberError || prError) {
        setState("error")
        return
      }

      const members = (memberData ?? []) as unknown as SharedMemberRow[]
      const paymentRequests = (prData ?? []) as unknown as PaymentRequestWithMember[]

      const membersBySharedSubId = new Map<string, SharedMemberRow[]>()
      for (const m of members) {
        const list = membersBySharedSubId.get(m.shared_subscription_id) ?? []
        list.push(m)
        membersBySharedSubId.set(m.shared_subscription_id, list)
      }

      const requestsBySharedSubId = new Map<string, PaymentRequestWithMember[]>()
      for (const pr of paymentRequests) {
        const list = requestsBySharedSubId.get(pr.shared_subscription_id) ?? []
        list.push(pr)
        requestsBySharedSubId.set(pr.shared_subscription_id, list)
      }

      setItems(
        rows.map((row) => ({
          sharedSubscription: row,
          subscriptionId: row.subscription_id,
          subscriptionName: getDisplayName({
            custom_name: row.subscriptions?.custom_name ?? null,
            subscription_catalog: row.subscriptions?.subscription_catalog
              ? { name: row.subscriptions.subscription_catalog.name, category: null }
              : null,
          }),
          isOwner: appUser != null && row.owner_user_id === appUser.id,
          members: membersBySharedSubId.get(row.id) ?? [],
          paymentRequests: requestsBySharedSubId.get(row.id) ?? [],
        }))
      )
      setState("ready")
    }

    load()
  }, [appUser, reloadTrigger])

  async function runMutation(action: () => PromiseLike<{ error: unknown }>, failureMessage: string): Promise<boolean> {
    setMutating(true)
    const { error } = await action()
    setMutating(false)

    if (error) {
      toast.error(failureMessage)
      return false
    }

    setReloadTrigger((n) => n + 1)
    return true
  }

  async function ownerMarkPaid(paymentRequestId: string): Promise<boolean> {
    return runMutation(
      () => supabase.from("payment_requests").update({ status: "paid" }).eq("id", paymentRequestId),
      "Couldn't mark this payment as received. Please try again."
    )
  }

  async function reportPaid(paymentRequestId: string): Promise<boolean> {
    return runMutation(
      () =>
        supabase
          .from("payment_requests")
          .update({ status: "paid_pending_confirmation", member_marked_paid_at: new Date().toISOString() })
          .eq("id", paymentRequestId),
      "Couldn't report this payment. Please try again."
    )
  }

  async function sendReminder(paymentRequestId: string): Promise<boolean> {
    setMutating(true)
    const { data, error } = await supabase.functions.invoke("send-shared-payment-reminder", {
      body: { payment_request_id: paymentRequestId },
    })
    setMutating(false)

    if (error || !data?.success) {
      toast.error("Couldn't send a reminder right now. Please try again.")
      return false
    }

    toast.success("Reminder sent")
    return true
  }

  return { state, items, mutating, ownerMarkPaid, reportPaid, sendReminder }
}
