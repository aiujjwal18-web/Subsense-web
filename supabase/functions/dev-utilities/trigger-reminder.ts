import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { errorResponse, successResponse } from "../_shared/http.ts"

// Send Reminder Now: synthesise a due reminder for one of the caller's own
// subscriptions, then hand it to the real send-reminder-email in its existing
// { reminder_id } single mode.
//
// Path B is forced twice over: send-reminder-email is gated by requireServiceRole() so a
// browser can never call it, and `reminders` has no client insert policy by design
// (see _shared/supabase-admin.ts). Both of DEC-031's exceptions apply.
//
// WHY updated_at IS BACK-DATED -- this is the whole trick, confirmed against the live
// schema rather than assumed:
//   reminders.updated_at DEFAULTS TO now(), and no trigger overrides it (live rows show
//   updated_at exactly equal to created_at).
//   send-reminder-email's claim query requires `updated_at <= now() - 10 minutes`, its
//   soft lease against concurrent invocations.
//   So a freshly inserted row can NEVER be claimed by the function it was created for --
//   the claim matches zero rows and single mode returns 404 NOT_FOUND.
// Back-dating updated_at past the lease threshold on insert is what makes the row
// immediately claimable. See BUILD_LOG for the same defect found in
// send-shared-payment-reminder's create-new branch, which does not do this.

const LEASE_MINUTES = 10
// Comfortably past the 10-minute lease so a little clock skew between this function and
// Postgres cannot push the row back inside the window.
const BACKDATE_MINUTES = LEASE_MINUTES + 5

// dev_test first: it exists in the reminder_type enum specifically for this purpose and
// has an active reminder_dev_test template, so it exercises the full claim/render/send/
// record pipeline without creating a row that looks like a real production reminder.
// The four subscription-linked production types are offered too, for testing the actual
// customer-facing templates. monthly_digest, lapsed_reengagement and shared_payment are
// deliberately excluded: they resolve their context from user-level or payment-request
// data rather than a subscription, so sending one this way would fail as
// CONTEXT_UNAVAILABLE and read as a bug in this utility.
const ALLOWED_TYPES = [
  "dev_test",
  "seven_day",
  "two_day",
  "renewal_day",
  "post_renewal_checkin",
] as const

type AllowedType = (typeof ALLOWED_TYPES)[number]

function isAllowedType(value: unknown): value is AllowedType {
  return typeof value === "string" && (ALLOWED_TYPES as readonly string[]).includes(value)
}

export async function handleTriggerReminder(
  supabaseAdmin: SupabaseClient,
  userId: string,
  body: { subscription_id?: unknown; reminder_type?: unknown }
): Promise<Response> {
  if (typeof body.subscription_id !== "string") {
    return errorResponse(400, "DEV_001", "subscription_id is required.")
  }

  const reminderType: AllowedType = isAllowedType(body.reminder_type) ? body.reminder_type : "dev_test"

  // Ownership check -- the security boundary for this action. Without it any
  // authenticated caller could make this project send reminder mail about someone
  // else's subscription, to someone else's address.
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id, user_id, archived_at")
    .eq("id", body.subscription_id)
    .maybeSingle()

  const typedSub = sub as { id: string; user_id: string; archived_at: string | null } | null
  if (!typedSub || typedSub.user_id !== userId) {
    return errorResponse(404, "DEV_002", "Subscription not found or not owned by this user.")
  }

  // send-reminder-email skips archived subscriptions as skipped_archived, which would
  // look like a silent no-op here. Reject up front with a reason instead.
  if (typedSub.archived_at) {
    return errorResponse(409, "DEV_002", "This subscription is archived; its reminders are skipped.")
  }

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle()

  const now = Date.now()
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("reminders")
    .insert({
      user_id: userId,
      subscription_id: typedSub.id,
      reminder_type: reminderType,
      // One second in the past, not exactly now: the claim compares
      // `scheduled_for <= now()` evaluated a moment later, and an exactly-equal
      // timestamp is a race that intermittently returns 404.
      scheduled_for: new Date(now - 1_000).toISOString(),
      status: "pending",
      timezone_snapshot: (profile?.timezone as string | undefined) ?? "Asia/Kolkata",
      updated_at: new Date(now - BACKDATE_MINUTES * 60_000).toISOString(),
    })
    .select("id")
    .single()

  if (insertError || !inserted) {
    return errorResponse(500, "DEV_004", insertError?.message ?? "Failed to create the reminder row.")
  }

  const reminderId = inserted.id as string

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse(500, "DEV_005", "Server misconfiguration: missing Supabase service credentials.")
  }

  // Delegate the send itself rather than reimplementing it: send-reminder-email owns the
  // claim, render, Resend retry, and delivery-recording logic, and already stamps
  // reminder_history.trigger_source = 'developer' for single mode. The service-role key
  // is read server-side for this internal call only and never reaches this action's
  // own caller.
  const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-reminder-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({ reminder_id: reminderId }),
  })

  const sendResult = await sendResponse.json().catch(() => null)

  if (!sendResponse.ok || !sendResult?.success) {
    const code = sendResult?.error?.code ?? "DEV_004"
    const message = sendResult?.error?.message ?? "send-reminder-email failed."
    // Surfaced verbatim so a Resend free-tier 429 reads as a rate limit rather than a
    // generic failure -- that distinction has cost real debugging time on this project.
    return errorResponse(sendResponse.status || 502, code, message)
  }

  return successResponse(
    { reminder_id: reminderId, reminder_type: reminderType, send_result: sendResult.data },
    { synthesized: true, backdated_minutes: BACKDATE_MINUTES }
  )
}
