import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts"
import { requireAuthenticatedUser } from "../_shared/require-user.ts"
import { errorResponse, handleCorsPreflight, successResponse } from "../_shared/http.ts"
import { verifyRazorpaySignature } from "../_shared/razorpay-client.ts"

const TRANSACTION_SELECT = "id, razorpay_payment_id, status, verified_at, premium_plans(duration_days)"

interface TransactionRow {
  id: string
  razorpay_payment_id: string | null
  status: "created" | "verified" | "failed"
  verified_at: string | null
  premium_plans: { duration_days: number | null } | null
}

function computeExpiresAt(verifiedAt: string, durationDays: number | null): string | null {
  if (durationDays === null) return null
  const expiry = new Date(verifiedAt)
  expiry.setDate(expiry.getDate() + durationDays)
  return expiry.toISOString()
}

// Sets user_profiles.is_premium/premium_expires_at/premium_source from the
// transaction's own immutable verified_at — never wall-clock now() — so every call
// (original grant, idempotent replay, or the benign-race fallback) converges on the
// exact same premium_expires_at. Recomputing from now() on a replay would let
// resending the same successful callback push the expiry out indefinitely.
async function grantPremium(
  supabaseAdmin: SupabaseClient,
  userId: string,
  transactionId: string,
  verifiedAt: string,
  durationDays: number | null,
  logGrant: boolean
): Promise<Response> {
  const premiumExpiresAt = computeExpiresAt(verifiedAt, durationDays)

  await supabaseAdmin
    .from("user_profiles")
    .update({ is_premium: true, premium_expires_at: premiumExpiresAt, premium_source: "razorpay_test_mode" })
    .eq("user_id", userId)

  if (logGrant) {
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: userId,
      actor_type: "user",
      action: "premium_granted",
      entity_table: "payment_transactions",
      entity_id: transactionId,
      metadata: { premium_source: "razorpay_test_mode", premium_expires_at: premiumExpiresAt },
    })
  }

  return successResponse(
    { is_premium: true, premium_expires_at: premiumExpiresAt, premium_source: "razorpay_test_mode" },
    {}
  )
}

// A different razorpay_payment_id already verified against this order — a real
// tamper/replay signal, not a normal error path. Logged before returning the error.
async function logAnomaly(
  supabaseAdmin: SupabaseClient,
  userId: string,
  transactionId: string,
  existingPaymentId: string | null,
  conflictingPaymentId: string
): Promise<void> {
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: userId,
    actor_type: "user",
    action: "payment_verification_anomaly",
    entity_table: "payment_transactions",
    entity_id: transactionId,
    metadata: { existing_payment_id: existingPaymentId, conflicting_payment_id: conflictingPaymentId },
  })
}

Deno.serve(async (req) => {
  const corsPreflight = handleCorsPreflight(req)
  if (corsPreflight) return corsPreflight

  const supabaseAdmin = createSupabaseAdminClient()

  const authResult = await requireAuthenticatedUser(req, supabaseAdmin)
  if (authResult instanceof Response) return authResult
  const { userId } = authResult

  let requestBody: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string } = {}
  try {
    const text = await req.text()
    if (text) requestBody = JSON.parse(text)
  } catch {
    return errorResponse(400, "INVALID_BODY", "Request body must be valid JSON.")
  }

  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = requestBody
  if (!orderId || !paymentId || !signature) {
    return errorResponse(400, "INVALID_BODY", "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.")
  }

  const { data: txn } = await supabaseAdmin
    .from("payment_transactions")
    .select(TRANSACTION_SELECT)
    .eq("razorpay_order_id", orderId)
    .eq("user_id", userId)
    .maybeSingle()

  // Missing or not owned by this user — same generic message either way, don't leak existence.
  if (!txn) {
    return errorResponse(404, "PAY_002", "Order not found.")
  }
  const transaction = txn as unknown as TransactionRow

  // Idempotency: this order was already verified by a prior call.
  if (transaction.status === "verified") {
    if (transaction.razorpay_payment_id === paymentId) {
      // Genuine duplicate callback — idempotent success per doc 11, not an error.
      return grantPremium(
        supabaseAdmin,
        userId,
        transaction.id,
        transaction.verified_at!,
        transaction.premium_plans?.duration_days ?? null,
        false
      )
    }
    // A different payment_id against an already-verified order — tamper/replay signal.
    await logAnomaly(supabaseAdmin, userId, transaction.id, transaction.razorpay_payment_id, paymentId)
    return errorResponse(409, "PAY_002", "This order has already been verified.")
  }

  const signatureValid = await verifyRazorpaySignature(orderId, paymentId, signature)
  if (!signatureValid) {
    // The payment_transactions_scrub_signature trigger (17_SubSense_Migration_v2.sql:844-845)
    // nulls razorpay_signature on any insert/update touching it or status — intentional,
    // the raw signature is never persisted at rest. Passing it here is traceability-in-transit
    // only; it never actually lands in the row.
    await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "failed", failure_reason: "signature_mismatch", razorpay_payment_id: paymentId, razorpay_signature: signature })
      .eq("razorpay_order_id", orderId)
      .eq("status", "created")
    return errorResponse(400, "PAY_001", "Payment signature verification failed.")
  }

  // CAS: only wins if status is still 'created' — a concurrent duplicate call loses
  // the race safely and falls through to the re-select branch below.
  const { data: updated } = await supabaseAdmin
    .from("payment_transactions")
    .update({ status: "verified", razorpay_payment_id: paymentId, razorpay_signature: signature, verified_at: new Date().toISOString() })
    .eq("razorpay_order_id", orderId)
    .eq("status", "created")
    .select(TRANSACTION_SELECT)

  const wonRow = (updated as unknown as TransactionRow[] | null)?.[0]
  if (wonRow) {
    return grantPremium(supabaseAdmin, userId, wonRow.id, wonRow.verified_at!, wonRow.premium_plans?.duration_days ?? null, true)
  }

  // CAS lost — a true concurrent race. Re-select and branch on the actual committed
  // state rather than blindly granting: a concurrent request with a mismatched/forged
  // signature could have flipped this to 'failed' first, or a different payment_id
  // could have already been verified against this order (the same tamper case above).
  const { data: raceRow } = await supabaseAdmin
    .from("payment_transactions")
    .select(TRANSACTION_SELECT)
    .eq("razorpay_order_id", orderId)
    .eq("user_id", userId)
    .maybeSingle()
  const raceTransaction = raceRow as unknown as TransactionRow | null

  if (raceTransaction?.status === "verified" && raceTransaction.razorpay_payment_id === paymentId) {
    // Benign race — a legitimate concurrent call for the same payment won first.
    return grantPremium(
      supabaseAdmin,
      userId,
      raceTransaction.id,
      raceTransaction.verified_at!,
      raceTransaction.premium_plans?.duration_days ?? null,
      false
    )
  }
  if (raceTransaction?.status === "failed") {
    return errorResponse(400, "PAY_001", "Payment signature verification failed.")
  }
  if (raceTransaction?.status === "verified") {
    await logAnomaly(supabaseAdmin, userId, raceTransaction.id, raceTransaction.razorpay_payment_id, paymentId)
    return errorResponse(409, "PAY_002", "This order has already been verified.")
  }

  return errorResponse(500, "PAY_005", "Unexpected payment state.")
})
