import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts"
import { requireAuthenticatedUser } from "../_shared/require-user.ts"
import { errorResponse, handleCorsPreflight, successResponse } from "../_shared/http.ts"

interface PaymentRequestRow {
  id: string
  status: string
  shared_subscriptions: { owner_user_id: string } | null
  shared_members: { user_id: string | null } | null
}

// doc 11 §5.3: user-triggered variant of 5.2 (send-reminder-email) for one
// payment_requests row (C-021's "Send Reminder" action). Auth is the owner's own
// session JWT (requireAuthenticatedUser, same model as ai-generate-insight) — not
// requireServiceRole, since this is called directly from the browser, not Cron.
Deno.serve(async (req) => {
  const corsPreflight = handleCorsPreflight(req)
  if (corsPreflight) return corsPreflight

  const supabaseAdmin = createSupabaseAdminClient()

  const authResult = await requireAuthenticatedUser(req, supabaseAdmin)
  if (authResult instanceof Response) return authResult
  const { userId } = authResult

  let requestBody: { payment_request_id?: string } = {}
  try {
    const text = await req.text()
    if (text) requestBody = JSON.parse(text)
  } catch {
    return errorResponse(400, "SHR_001", "Request body must be valid JSON.")
  }

  const paymentRequestId = requestBody.payment_request_id
  if (!paymentRequestId) {
    return errorResponse(400, "SHR_001", "payment_request_id is required.")
  }

  const { data: pr, error: prError } = await supabaseAdmin
    .from("payment_requests")
    .select("id, status, shared_subscriptions(owner_user_id), shared_members(user_id)")
    .eq("id", paymentRequestId)
    .maybeSingle()

  const typedPr = pr as unknown as PaymentRequestRow | null

  if (prError || !typedPr || typedPr.shared_subscriptions?.owner_user_id !== userId) {
    return errorResponse(404, "SHR_002", "Payment request not found or not owned by this user.")
  }

  if (typedPr.status !== "pending" && typedPr.status !== "paid_pending_confirmation") {
    return errorResponse(409, "SHR_003", "Cannot send a reminder for a request that is already resolved.")
  }

  // Find-or-create the underlying reminders row — same shape the DB generation trigger
  // itself creates (31_SubSense_Shared_Payment_Requests_v1.0.sql), so a manual "Send
  // Reminder" and the automatic on-generation reminder are indistinguishable to
  // send-reminder-email once a reminder_id exists.
  const { data: existingReminder } = await supabaseAdmin
    .from("reminders")
    .select("id")
    .eq("payment_request_id", paymentRequestId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let reminderId = existingReminder?.id as string | undefined

  if (!reminderId) {
    const memberUserId = typedPr.shared_members?.user_id ?? null
    let timezone = "Asia/Kolkata"
    if (memberUserId) {
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("timezone")
        .eq("user_id", memberUserId)
        .maybeSingle()
      timezone = profile?.timezone ?? timezone
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("reminders")
      .insert({
        user_id: memberUserId,
        payment_request_id: paymentRequestId,
        reminder_type: "shared_payment",
        scheduled_for: new Date().toISOString(),
        timezone_snapshot: timezone,
      })
      .select("id")
      .single()

    if (insertError || !inserted) {
      return errorResponse(500, "SHR_004", insertError?.message ?? "Failed to create reminder.")
    }
    reminderId = inserted.id as string
  }

  // Delegate the actual send to send-reminder-email's single mode — reuses 100% of its
  // claim/render/send/record logic (including retry and delivery tracking) rather than
  // duplicating it. Never exposes the service-role key to this function's own caller;
  // it's read server-side only, for this internal function-to-function call alone.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse(500, "SHR_005", "Server misconfiguration: missing Supabase service credentials.")
  }

  const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-reminder-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ reminder_id: reminderId }),
  })

  const sendResult = await sendResponse.json().catch(() => null)

  if (!sendResponse.ok || !sendResult?.success) {
    const code = sendResult?.error?.code ?? "SHR_006"
    const message = sendResult?.error?.message ?? "Failed to send reminder."
    return errorResponse(sendResponse.status || 502, code, message)
  }

  return successResponse(sendResult.data, sendResult.meta ?? {})
})
