import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts"
import { requireAuthenticatedUser } from "../_shared/require-user.ts"
import { errorResponse, handleCorsPreflight } from "../_shared/http.ts"

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

const ACTIONS = ["trigger_reminder", "build_prompt", "render_email", "integration_status"] as const

type Action = (typeof ACTIONS)[number]

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value)
}

Deno.serve(async (req) => {
  const corsPreflight = handleCorsPreflight(req)
  if (corsPreflight) return corsPreflight

  const supabaseAdmin = createSupabaseAdminClient()

  // Gate first, before parsing anything. The resolved userId is not destructured yet —
  // no action in this skeleton uses it — but every handler added from Task 3 onward
  // reads it from here rather than trusting anything in the request body.
  const authResult = await requireAuthenticatedUser(req, supabaseAdmin)
  if (authResult instanceof Response) return authResult

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

  // Handlers land in Tasks 3, 4, 5 and 7. Each will be its own module in this directory
  // rather than inlined here, so index.ts stays a readable auth-and-dispatch shell
  // instead of growing into four concerns in one file.
  return errorResponse(501, "DEV_003", `Action '${requestBody.action}' is not implemented yet.`)
})
