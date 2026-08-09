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

    // updated_at is back-dated past send-reminder-email's 10-minute claim lease.
    //
    // Without this, the create-new path could never work: reminders.updated_at defaults
    // to now() with no trigger override, while send-reminder-email's claim query
    // requires `updated_at <= now() - 10 minutes`. A row inserted here would therefore
    // fail to match the claim of the very function it is about to be handed to, and
    // single mode would return 404 NOT_FOUND. The bug was invisible because the
    // find-existing branch above usually supplies a row already older than the lease --
    // only a genuinely first-ever reminder for a payment request took this path.
    //
    // 15 minutes, not exactly 10, so clock skew between this function and Postgres
    // cannot push the row back inside the window. Same value and reasoning as
    // dev-utilities/trigger-reminder.ts.
    const LEASE_BACKDATE_MINUTES = 15

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("reminders")
      .insert({
        user_id: memberUserId,
        payment_request_id: paymentRequestId,
        reminder_type: "shared_payment",
        scheduled_for: new Date().toISOString(),
        timezone_snapshot: timezone,
        updated_at: new Date(Date.now() - LEASE_BACKDATE_MINUTES * 60_000).toISOString(),
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
