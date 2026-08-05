import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts"
import { requireAuthenticatedUser } from "../_shared/require-user.ts"
import { errorResponse, handleCorsPreflight, successResponse } from "../_shared/http.ts"
import { createRazorpayOrder } from "../_shared/razorpay-client.ts"

interface PremiumPlanRow {
  id: string
  plan_code: string
  amount: number
  currency: string
  duration_days: number | null
  is_active: boolean
}

Deno.serve(async (req) => {
  const corsPreflight = handleCorsPreflight(req)
  if (corsPreflight) return corsPreflight

  const supabaseAdmin = createSupabaseAdminClient()

  const authResult = await requireAuthenticatedUser(req, supabaseAdmin)
  if (authResult instanceof Response) return authResult
  const { userId } = authResult

  let requestBody: { plan_code?: string } = {}
  try {
    const text = await req.text()
    if (text) requestBody = JSON.parse(text)
  } catch {
    return errorResponse(400, "INVALID_BODY", "Request body must be valid JSON.")
  }

  if (!requestBody.plan_code) {
    return errorResponse(400, "INVALID_BODY", "plan_code is required.")
  }

  const { data: plan } = await supabaseAdmin
    .from("premium_plans")
    .select("id, plan_code, amount, currency, duration_days, is_active")
    .eq("plan_code", requestBody.plan_code)
    .eq("is_active", true)
    .maybeSingle()

  const typedPlan = plan as PremiumPlanRow | null

  // Distinct from PAY_002 ("order not found", razorpay-verify-payment) — a plan
  // lookup miss here is a different failure mode from a payment-transaction lookup
  // miss there, so it gets its own code rather than overloading PAY_002's meaning.
  if (!typedPlan) {
    return errorResponse(404, "PAY_004", "Plan not found.")
  }

  // Defense-in-depth against checking out the free plan (amount 0) — the Upgrade
  // button should never be reachable for it client-side either.
  if (typedPlan.amount <= 0) {
    return errorResponse(400, "PAY_004", "This plan cannot be purchased.")
  }

  const amountInPaise = Math.round(typedPlan.amount * 100)

  // Razorpay caps receipts at 40 characters — "sub_" + timestamp + last 8 chars of
  // the user's UUID stays well under that while remaining traceable and unique-enough
  // per request. A full UUID would push this over the limit.
  const receipt = `sub_${Date.now()}_${userId.slice(-8)}`

  const orderResult = await createRazorpayOrder(amountInPaise, typedPlan.currency, receipt)
  if (!orderResult.ok) {
    return errorResponse(502, orderResult.code, orderResult.message)
  }

  // Must succeed before responding — an order with no local transaction row would be
  // unverifiable and non-idempotent when razorpay-verify-payment is later called.
  const { error: insertError } = await supabaseAdmin.from("payment_transactions").insert({
    user_id: userId,
    premium_plan_id: typedPlan.id,
    razorpay_order_id: orderResult.orderId,
    amount: typedPlan.amount,
    currency: typedPlan.currency,
    status: "created",
  })

  if (insertError) {
    return errorResponse(502, "PAY_005", "Failed to record the payment transaction.")
  }

  return successResponse(
    {
      order_id: orderResult.orderId,
      amount: amountInPaise,
      currency: typedPlan.currency,
      key_id: Deno.env.get("RAZORPAY_KEY_ID"),
    },
    {}
  )
})
