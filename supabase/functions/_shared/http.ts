import { timingSafeEqual } from "jsr:@std/crypto/timing-safe-equal"

const encoder = new TextEncoder()

// Constant-time string comparison — avoids a timing side-channel on the service-role key check below.
// Exported for reuse by _shared/razorpay-client.ts's signature verification (same timing-safety need).
export function safeCompare(a: string, b: string): boolean {
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  if (aBytes.byteLength !== bBytes.byteLength) return false
  return timingSafeEqual(aBytes, bBytes)
}

export interface ErrorEnvelope {
  success: false
  error: { code: string; message: string }
}

export interface SuccessEnvelope<TData, TMeta> {
  success: true
  data: TData
  meta: TMeta
}

// ai-generate-insight is the first Edge Function actually called from the browser
// (Phase 6's two functions are Cron/service-role-invoked, never sent a preflight) —
// without these, the browser's OPTIONS preflight has no Access-Control-Allow-Origin
// header to approve, so the real request never goes out. "*" is deliberate: this app
// authenticates via a Bearer token, not cookies, so there's no CORS-credentials
// concern that would require echoing a specific origin instead.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Call at the top of a browser-callable function's Deno.serve handler, before any
// other logic, and return its result immediately if non-null. Harmless to add to a
// service-role-only function too (no browser ever sends it a preflight to answer).
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  })
}

export function successResponse<TData, TMeta>(data: TData, meta: TMeta, status = 200): Response {
  const envelope: SuccessEnvelope<TData, TMeta> = { success: true, data, meta }
  return jsonResponse(status, envelope)
}

export function errorResponse(status: number, code: string, message: string): Response {
  const envelope: ErrorEnvelope = { success: false, error: { code, message } }
  return jsonResponse(status, envelope)
}

// Both send-reminder-email and generate-scheduled-reminders are service-role-only —
// never callable from the frontend. Requires an exact match against
// SUPABASE_SERVICE_ROLE_KEY (auto-injected into every Edge Function's runtime env),
// not just any valid platform JWT (which would also accept a normal user token).
export function requireServiceRole(req: Request): Response | null {
  const authHeader = req.headers.get("Authorization") ?? ""
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  if (!serviceRoleKey || !token || !safeCompare(token, serviceRoleKey)) {
    return errorResponse(401, "UNAUTHORIZED", "Service-role authorization required.")
  }
  return null
}
