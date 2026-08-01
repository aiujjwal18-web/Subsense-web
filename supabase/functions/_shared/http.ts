import { timingSafeEqual } from "jsr:@std/crypto/timing-safe-equal"

const encoder = new TextEncoder()

// Constant-time string comparison — avoids a timing side-channel on the service-role key check below.
function safeCompare(a: string, b: string): boolean {
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

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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
