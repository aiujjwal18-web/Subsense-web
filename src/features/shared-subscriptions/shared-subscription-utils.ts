import type { Currency } from "@/features/subscriptions/subscription-utils"

export type SplitMethod = "equal" | "custom"
export type MemberStatus = "active" | "removed"
export type PaymentRequestStatus = "pending" | "paid_pending_confirmation" | "paid" | "cancelled"

// Shared column lists, mirroring subscription-utils.ts's SUBSCRIPTION_SELECT_COLUMNS
// convention — used everywhere these tables are read so callers never drift out of sync.
export const SHARED_SUBSCRIPTION_SELECT_COLUMNS =
  "id, subscription_id, owner_user_id, split_method, currency, created_at, updated_at, archived_at"

export const SHARED_MEMBER_SELECT_COLUMNS =
  "id, shared_subscription_id, user_id, display_name, email, amount_owed, currency, status, joined_at, removed_at, created_at, updated_at"

export const PAYMENT_REQUEST_SELECT_COLUMNS =
  "id, shared_subscription_id, shared_member_id, billing_cycle_date, amount, currency, status, member_marked_paid_at, owner_confirmed_at, created_at, updated_at"

export interface SharedSubscriptionRow {
  id: string
  subscription_id: string
  owner_user_id: string
  split_method: SplitMethod
  currency: Currency
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface SharedMemberRow {
  id: string
  shared_subscription_id: string
  user_id: string | null
  display_name: string | null
  email: string | null
  amount_owed: number
  currency: Currency
  status: MemberStatus
  joined_at: string
  removed_at: string | null
  created_at: string
  updated_at: string
}

export interface PaymentRequestRow {
  id: string
  shared_subscription_id: string
  shared_member_id: string
  billing_cycle_date: string
  amount: number
  currency: Currency
  status: PaymentRequestStatus
  member_marked_paid_at: string | null
  owner_confirmed_at: string | null
  created_at: string
  updated_at: string
}

export const SPLIT_METHOD_LABEL: Record<SplitMethod, string> = {
  equal: "Equal Split",
  custom: "Custom Split",
}

export const PAYMENT_REQUEST_STATUS_LABEL: Record<PaymentRequestStatus, string> = {
  pending: "Pending",
  paid_pending_confirmation: "Awaiting Confirmation",
  paid: "Paid",
  cancelled: "Cancelled",
}

// C-019: "Display name (or email, for a member with no linked SubSense account)".
export function getMemberDisplayName(member: Pick<SharedMemberRow, "display_name" | "email">): string {
  return member.display_name?.trim() || member.email?.trim() || "Member"
}

// DEC-037: only these two owner-initiated transitions and this one member-initiated
// transition exist — matches payment_requests_validate_transition (doc 10) exactly, kept
// here as a single source of truth for which action a caller may even attempt, not as a
// re-implementation of the DB-side authorization itself (that stays server-enforced).
export function canOwnerMarkPaid(status: PaymentRequestStatus): boolean {
  return status === "pending" || status === "paid_pending_confirmation"
}

export function canMemberReportPaid(status: PaymentRequestStatus): boolean {
  return status === "pending"
}

export function canSendReminder(status: PaymentRequestStatus): boolean {
  return status === "pending" || status === "paid_pending_confirmation"
}
