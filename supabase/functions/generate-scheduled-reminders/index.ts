import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts"
import { requireServiceRole, successResponse, errorResponse } from "../_shared/http.ts"

// Thin wrapper only, per DEC-068 / doc 11 5.7: auth check + one RPC call. The actual
// generation logic (post_renewal_checkin / monthly_digest / lapsed_reengagement) lives
// in a Postgres function, public.generate_scheduled_reminders(), added separately via a
// future numbered migration — not written here. Until that migration ships, this
// function will 500 with RPC_FAILED (expected, by design — see BUILD_LOG for the
// deploy-order note).
//
// IMPORTANT for whoever writes that migration: monthly_digest/lapsed_reengagement are
// user-level reminders with no natural subscription_id or payment_request_id — inserting
// them with both null is blocked by TWO independent CHECK constraints on `reminders`
// (17_SubSense_Migration_v2.sql), not one:
//   reminders_target_present:       subscription_id IS NOT NULL OR payment_request_id IS NOT NULL
//   reminders_shared_payment_target: (reminder_type = 'shared_payment' AND payment_request_id IS NOT NULL)
//                                 OR (reminder_type <> 'shared_payment' AND subscription_id IS NOT NULL)
// Loosening only reminders_target_present is not enough — reminders_shared_payment_target
// independently still requires subscription_id for every non-shared_payment type, which
// still blocks these two. Both constraints need updating to also allow both null when
// reminder_type IN ('monthly_digest', 'lapsed_reengagement').
Deno.serve(async (req) => {
  const authError = requireServiceRole(req)
  if (authError) return authError

  const supabaseAdmin = createSupabaseAdminClient()
  const invokedAt = new Date().toISOString()

  const { data, error } = await supabaseAdmin.rpc("generate_scheduled_reminders")

  if (error) {
    return errorResponse(500, "RPC_FAILED", error.message)
  }

  return successResponse(data ?? {}, { invoked_at: invokedAt, rpc: "generate_scheduled_reminders" })
})
