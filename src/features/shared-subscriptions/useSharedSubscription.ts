import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { supabase } from "@/lib/supabase"
import { useAuth } from "@/features/auth/AuthContext"
import type { Currency } from "@/features/subscriptions/subscription-utils"
import {
  PAYMENT_REQUEST_SELECT_COLUMNS,
  SHARED_MEMBER_SELECT_COLUMNS,
  SHARED_SUBSCRIPTION_SELECT_COLUMNS,
  type PaymentRequestRow,
  type SharedMemberRow,
  type SharedSubscriptionRow,
  type SplitMethod,
} from "./shared-subscription-utils"

export type SharedSubscriptionState = "loading" | "notShared" | "ready" | "error"

// payment_requests history includes requests for members who have since been soft-removed
// (DEC-080's no-cascade rule preserves it), so the active-only `members` list below can't
// always resolve a request's member name — this embeds it directly instead.
export interface PaymentRequestWithMember extends PaymentRequestRow {
  shared_members: { display_name: string | null; email: string | null } | null
}

export interface AddEditMemberInput {
  displayName: string
  email: string
  amountOwed: number
}

export interface UseSharedSubscriptionResult {
  state: SharedSubscriptionState
  isOwner: boolean
  sharedSubscription: SharedSubscriptionRow | null
  // Active members only, per C-019 — a removed member's row drops out of this list
  // (their payment_requests history stays visible via `paymentRequests` below).
  members: SharedMemberRow[]
  paymentRequests: PaymentRequestWithMember[]
  mutating: boolean
  createShare: (splitMethod: SplitMethod) => Promise<boolean>
  addMember: (input: AddEditMemberInput) => Promise<boolean>
  editMember: (memberId: string, input: AddEditMemberInput) => Promise<boolean>
  removeMember: (memberId: string) => Promise<boolean>
  ownerMarkPaid: (paymentRequestId: string) => Promise<boolean>
  reportPaid: (paymentRequestId: string) => Promise<boolean>
  sendReminder: (paymentRequestId: string) => Promise<boolean>
}

// Manages one subscription's sharing state — used by "Manage sharing" on
// SubscriptionDetailsPage. `subscriptionCurrency` is passed in rather than re-fetched:
// the caller already has the parent subscription loaded, and shared_subscriptions.currency
// must match it exactly (validate_shared_currency trigger) at creation time.
export function useSharedSubscription(
  subscriptionId: string,
  subscriptionCurrency: Currency
): UseSharedSubscriptionResult {
  const { appUser } = useAuth()
  const [state, setState] = useState<SharedSubscriptionState>("loading")
  const [sharedSubscription, setSharedSubscription] = useState<SharedSubscriptionRow | null>(null)
  const [members, setMembers] = useState<SharedMemberRow[]>([])
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestWithMember[]>([])
  const [mutating, setMutating] = useState(false)
  // Bumped after a successful mutation to trigger a refetch — deliberately not a direct
  // load() call from the mutation handler, and load() is declared inside the effect
  // itself (not at hook scope), matching useAiInsight.ts's pattern: the
  // react-hooks/set-state-in-effect lint rule flags a useEffect body invoking any
  // externally-declared function it can't statically trace as setState-safe, even when
  // that function's own setState calls all happen after an await.
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestIdRef.current

    async function load() {
      const { data: ssData, error: ssError } = await supabase
        .from("shared_subscriptions")
        .select(SHARED_SUBSCRIPTION_SELECT_COLUMNS)
        .eq("subscription_id", subscriptionId)
        .maybeSingle()

      if (requestIdRef.current !== requestId) return

      if (ssError) {
        setState("error")
        return
      }

      if (!ssData) {
        setSharedSubscription(null)
        setMembers([])
        setPaymentRequests([])
        setState("notShared")
        return
      }

      const ss = ssData as unknown as SharedSubscriptionRow

      const [{ data: memberData, error: memberError }, { data: prData, error: prError }] = await Promise.all([
        supabase
          .from("shared_members")
          .select(SHARED_MEMBER_SELECT_COLUMNS)
          .eq("shared_subscription_id", ss.id)
          .eq("status", "active")
          .order("joined_at", { ascending: true }),
        supabase
          .from("payment_requests")
          .select(`${PAYMENT_REQUEST_SELECT_COLUMNS}, shared_members(display_name, email)`)
          .eq("shared_subscription_id", ss.id)
          .order("billing_cycle_date", { ascending: false }),
      ])

      if (requestIdRef.current !== requestId) return

      if (memberError || prError) {
        setState("error")
        return
      }

      setSharedSubscription(ss)
      setMembers((memberData ?? []) as unknown as SharedMemberRow[])
      setPaymentRequests((prData ?? []) as unknown as PaymentRequestWithMember[])
      setState("ready")
    }

    load()
  }, [subscriptionId, reloadTrigger])

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

  async function createShare(splitMethod: SplitMethod): Promise<boolean> {
    if (!appUser) return false
    return runMutation(
      () =>
        supabase.from("shared_subscriptions").insert({
          subscription_id: subscriptionId,
          owner_user_id: appUser?.id,
          split_method: splitMethod,
          currency: subscriptionCurrency,
        }),
      "Couldn't set up sharing for this subscription. Please try again."
    )
  }

  async function addMember(input: AddEditMemberInput): Promise<boolean> {
    if (!sharedSubscription) return false
    return runMutation(
      () =>
        supabase.from("shared_members").insert({
          shared_subscription_id: sharedSubscription.id,
          display_name: input.displayName.trim() || null,
          email: input.email.trim() || null,
          // For an 'equal' split this is a placeholder — the shared_members insert
          // trigger recomputes every active member's amount_owed right after this insert
          // commits (31_SubSense_Shared_Payment_Requests_v1.0.sql), so the value here is
          // never what's actually shown once `load()` refetches below.
          amount_owed: input.amountOwed,
          currency: sharedSubscription.currency,
        }),
      "Couldn't add this member. Please try again."
    )
  }

  async function editMember(memberId: string, input: AddEditMemberInput): Promise<boolean> {
    return runMutation(
      () =>
        supabase
          .from("shared_members")
          .update({
            display_name: input.displayName.trim() || null,
            email: input.email.trim() || null,
            // Ignored server-side-equivalent for 'equal' split in the sense that any
            // owner-supplied value here is only meaningful under 'custom' split — the
            // component only renders this field editable in that case (doc 06 C-020).
            amount_owed: input.amountOwed,
          })
          .eq("id", memberId),
      "Couldn't save this member's details. Please try again."
    )
  }

  async function removeMember(memberId: string): Promise<boolean> {
    return runMutation(
      () =>
        supabase
          .from("shared_members")
          .update({ status: "removed", removed_at: new Date().toISOString() })
          .eq("id", memberId),
      "Couldn't remove this member. Please try again."
    )
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

  return {
    state,
    isOwner: sharedSubscription != null && appUser != null && sharedSubscription.owner_user_id === appUser.id,
    sharedSubscription,
    members,
    paymentRequests,
    mutating,
    createShare,
    addMember,
    editMember,
    removeMember,
    ownerMarkPaid,
    reportPaid,
    sendReminder,
  }
}
