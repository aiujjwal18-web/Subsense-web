import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"

// Service-role client — bypasses RLS entirely, matching this project's system-only
// write pattern for reminders/notifications/reminder_history/audit_logs (no client
// insert/update policy exists for any of them; writes are backend-only by design).
export function createSupabaseAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.")
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
