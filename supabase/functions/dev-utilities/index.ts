import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts"
import { requireAuthenticatedUser } from "../_shared/require-user.ts"
import { errorResponse, handleCorsPreflight } from "../_shared/http.ts"
import { isDevUtilitiesAllowed } from "./allowlist.ts"
import { handleBuildPrompt } from "./build-prompt.ts"
import { handleIntegrationStatus } from "./integration-status.ts"
import { handleRenderEmail } from "./render-email.ts"
import { handleTriggerReminder } from "./trigger-reminder.ts"

// Phase 11 developer utilities, backing src/features/dev-utilities/DevUtilitiesPage.tsx.
//
// Deliberately ONE function with an action discriminator rather than one function per
// utility, departing from this project's existing one-function-per-purpose convention
// (the other 7 functions each do one thing). Three reasons: every action needs the same
// auth gate and the same caller-scoping rule, and duplicating that across three
// functions is three places to get it wrong; it deploys once; and it is a single
// deletion point when these utilities are removed after the capstone.
//
// Auth model is requireAuthenticatedUser (the caller's own session JWT), same as
// ai-generate-insight and send-shared-payment-reminder — NOT requireServiceRole. So no
// config.toml entry is needed; the platform's default verify_jwt = true is correct here,
// unlike the two Cron functions which set it false.
//
// SECURITY: the route that calls this is hidden, but a hidden route is not an access
// control. Any authenticated user who finds this function can call it, so every action
// MUST scope its work to the caller's own userId — their own subscriptions, their own
// reminders, their own email address. A curious user must gain nothing they do not
// already have. Actions that touch third-party providers return status only, never key
// material, key prefixes, or raw provider response bodies (those can echo back request
// details).
//
// Error codes are a distinct DEV_* family, not overloaded onto AI_*/PAY_*/SHR_*:
//   DEV_001  malformed request or unknown action
//   DEV_002  requested resource not found, or not owned by the caller
//   DEV_003  action recognised but not implemented yet
//   DEV_004  downstream failure (delegated function, provider, or DB write)
//   DEV_005  server misconfiguration (missing env)
//   DEV_006  authenticated, but not on the developer allowlist

const ACTIONS = ["trigger_reminder", "build_prompt", "render_email", "integration_status"] as const

type Action = (typeof ACTIONS)[number]

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value)
}

Deno.serve(async (req) => {
  const corsPreflight = handleCorsPreflight(req)
  if (corsPreflight) return corsPreflight

  const supabaseAdmin = createSupabaseAdminClient()

  // Gate first, before parsing anything. Every handler below receives this resolved
  // userId and scopes its work to it — no handler ever trusts a user id from the body.
  const authResult = await requireAuthenticatedUser(req, supabaseAdmin)
  if (authResult instanceof Response) return authResult
  const { userId } = authResult

  // Authorization gate — THE real boundary for this whole surface. The /dev-utilities
  // route is hidden and client-side guarded, but neither stops anyone holding a valid
  // session JWT from POSTing here directly. Being signed in is not sufficient; being one
  // of three named people is.
  //
  // The email is read from the users table rather than from requireAuthenticatedUser,
  // which returns only userId. Widening that shared helper would touch five other
  // functions (ai-generate-insight, insights-generate-summary, both razorpay functions,
  // send-shared-payment-reminder) for a dev-only need — one extra query on a dev
  // endpoint is the cheaper trade. It is also read server-side from the DB, never taken
  // from the request body, so a caller cannot assert someone else's address.
  const { data: callerRow } = await supabaseAdmin
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle()

  if (!isDevUtilitiesAllowed(callerRow?.email as string | undefined)) {
    // 403, not 404: the caller is authenticated and this endpoint's existence is already
    // evident from the client bundle, so pretending it is absent buys nothing and makes
    // a legitimate operator's misconfiguration harder to diagnose.
    return errorResponse(403, "DEV_006", "This account is not authorized to use developer utilities.")
  }

  let requestBody: { action?: unknown } = {}
  try {
    const text = await req.text()
    if (text) requestBody = JSON.parse(text)
  } catch {
    return errorResponse(400, "DEV_001", "Request body must be valid JSON.")
  }

  if (!isAction(requestBody.action)) {
    // Lists the valid actions rather than just rejecting: the only callers are this
    // project's own developer page and whoever is debugging it, so naming them costs
    // nothing and saves a trip to the source.
    return errorResponse(
      400,
      "DEV_001",
      `Unknown action. Expected one of: ${ACTIONS.join(", ")}.`
    )
  }

  // Each handler is its own module in this directory rather than inlined here, so
  // index.ts stays a readable auth-and-dispatch shell instead of four concerns in one
  // file. Handlers receive the resolved userId; none reads an identity from the body.
  const params = requestBody as Record<string, unknown>

  switch (requestBody.action) {
    case "build_prompt":
      return await handleBuildPrompt(supabaseAdmin, userId, params)
    case "render_email":
      return await handleRenderEmail(supabaseAdmin, userId, params)
    case "integration_status":
      return await handleIntegrationStatus(supabaseAdmin)
    case "trigger_reminder":
      return await handleTriggerReminder(supabaseAdmin, userId, params)
  }
})
