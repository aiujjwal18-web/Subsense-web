import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { errorResponse } from "./http.ts"

export interface AuthenticatedUser {
  userId: string
}

// ai-generate-insight is called directly by a logged-in user's browser, not by
// Supabase Cron — a fundamentally different auth model from requireServiceRole()
// (send-reminder-email/generate-scheduled-reminders), which gates on the service-role
// key. Here the caller's own Supabase session JWT must be validated, then resolved to
// this project's app-level users.id (via users.auth_user_id) for ownership checks
// against subscriptions.user_id / ai_recommendations.user_id.
export async function requireAuthenticatedUser(
  req: Request,
  supabaseAdmin: SupabaseClient
): Promise<AuthenticatedUser | Response> {
  const authHeader = req.headers.get("Authorization") ?? ""
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim()

  if (!jwt) {
    return errorResponse(401, "UNAUTHORIZED", "Missing bearer token.")
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(jwt)
  if (authError || !authData?.user) {
    return errorResponse(401, "UNAUTHORIZED", "Invalid or expired session.")
  }

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle()

  if (userError || !userRow) {
    return errorResponse(401, "UNAUTHORIZED", "No SubSense profile for this session.")
  }

  return { userId: userRow.id as string }
}
