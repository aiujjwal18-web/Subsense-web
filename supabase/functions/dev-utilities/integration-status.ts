import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { successResponse } from "../_shared/http.ts"

// Health check across the four services this project depends on.
//
// This is Path B (Edge Function) because three of the four checks need secrets the
// browser cannot hold -- OPENAI_API_KEY, RESEND_API_KEY, RAZORPAY_KEY_SECRET. That is
// DEC-031's secrets exception, not a preference.
//
// SECURITY: the response carries status and latency only. Never a key, never a key
// prefix or suffix, and never a raw provider response body -- provider errors routinely
// echo back request details, and this endpoint is reachable by any authenticated user.
// The `reason` values below are a fixed vocabulary for exactly that reason.
//
// Every check is READ-ONLY and free:
//   - OpenAI    GET /v1/models          costs no tokens
//   - Resend    GET /domains            sends no email, so no free-tier rate-limit risk
//   - Razorpay  GET /v1/payments?count=1 never creates an order
// A check that created an order or sent a mail would make "is it healthy?" an action
// with side effects, which is precisely what this panel must not be.

const TIMEOUT_MS = 5_000

type FailureReason =
  | "missing_key"
  | "auth_failed"
  | "timeout"
  | "network_error"
  | "restricted_key"
  | `http_${number}`

interface ServiceStatus {
  ok: boolean
  latency_ms: number
  reason?: FailureReason
}

function classify(status: number): FailureReason {
  if (status === 401 || status === 403) return "auth_failed"
  return `http_${status}`
}

// Optional per-service reinterpretation of a non-2xx response. Runs server-side over the
// provider's body and may only return values from the fixed FailureReason vocabulary --
// the body itself never escapes this function, preserving the rule that provider
// responses (which echo request details) are never forwarded to a caller.
type ErrorInterpreter = (status: number, body: string) => ServiceStatus | null

async function timedFetch(
  url: string,
  headers: Record<string, string>,
  interpretError?: ErrorInterpreter
): Promise<ServiceStatus> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(url, { method: "GET", headers, signal: controller.signal })
    const latency = Date.now() - startedAt
    if (!response.ok) {
      if (interpretError) {
        const body = await response.text().catch(() => "")
        const reinterpreted = interpretError(response.status, body)
        if (reinterpreted) return { ...reinterpreted, latency_ms: latency }
      }
      return { ok: false, latency_ms: latency, reason: classify(response.status) }
    }
    return { ok: true, latency_ms: latency }
  } catch (error) {
    const latency = Date.now() - startedAt
    const aborted = error instanceof DOMException && error.name === "AbortError"
    return { ok: false, latency_ms: latency, reason: aborted ? "timeout" : "network_error" }
  } finally {
    clearTimeout(timer)
  }
}

async function checkSupabase(supabaseAdmin: SupabaseClient): Promise<ServiceStatus> {
  const startedAt = Date.now()
  // head + count: proves the connection and credentials without transferring any rows.
  const { error } = await supabaseAdmin
    .from("premium_plans")
    .select("id", { count: "exact", head: true })
  const latency = Date.now() - startedAt
  return error ? { ok: false, latency_ms: latency, reason: "network_error" } : { ok: true, latency_ms: latency }
}

function checkOpenAi(): Promise<ServiceStatus> {
  const apiKey = Deno.env.get("OPENAI_API_KEY")
  if (!apiKey) return Promise.resolve({ ok: false, latency_ms: 0, reason: "missing_key" })
  return timedFetch("https://api.openai.com/v1/models", { Authorization: `Bearer ${apiKey}` })
}

// A Resend API key carries a permission level: "Sending access" or "Full access". A
// sending-access key can POST /emails but is rejected on GET /domains, which needs
// domain-read permission.
//
// The first version of this check reported that rejection as auth_failed, which was
// wrong and actively misleading: it claimed the Resend integration was broken seconds
// after send-reminder-email had delivered a real email with the same key. The request
// itself was never at fault -- env var, host and Authorization header are byte-identical
// to _shared/resend-client.ts's working send. Only the endpoint differs, and the key is
// simply not scoped to read it.
//
// Resend answers a restricted key with `name: "restricted_api_key"` and a message saying
// the key may only send emails. That response still proves the credential is real and
// recognised -- Resend authenticated it before refusing the scope -- so it is reported as
// healthy, with the reason noting the check could not be a full read.
// An unrecognised key returns a different error and still falls through to auth_failed.
function interpretResendError(status: number, body: string): ServiceStatus | null {
  if (status !== 401 && status !== 403) return null
  const restricted = /restricted_api_key|restricted to only send/i.test(body)
  return restricted ? { ok: true, latency_ms: 0, reason: "restricted_key" } : null
}

function checkResend(): Promise<ServiceStatus> {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  if (!apiKey) return Promise.resolve({ ok: false, latency_ms: 0, reason: "missing_key" })
  return timedFetch(
    "https://api.resend.com/domains",
    { Authorization: `Bearer ${apiKey}` },
    interpretResendError
  )
}

function checkRazorpay(): Promise<ServiceStatus> {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID")
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")
  if (!keyId || !keySecret) return Promise.resolve({ ok: false, latency_ms: 0, reason: "missing_key" })
  return timedFetch("https://api.razorpay.com/v1/payments?count=1", {
    Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
  })
}

export async function handleIntegrationStatus(supabaseAdmin: SupabaseClient): Promise<Response> {
  // allSettled, not all: one dead provider must not blank the whole panel. Every check
  // already resolves rather than rejects, but allSettled makes that guarantee structural
  // instead of dependent on each helper's internal discipline.
  const [supabase, openai, resend, razorpay] = await Promise.allSettled([
    checkSupabase(supabaseAdmin),
    checkOpenAi(),
    checkResend(),
    checkRazorpay(),
  ])

  const unwrap = (result: PromiseSettledResult<ServiceStatus>): ServiceStatus =>
    result.status === "fulfilled"
      ? result.value
      : { ok: false, latency_ms: 0, reason: "network_error" }

  return successResponse(
    {
      supabase: unwrap(supabase),
      openai: unwrap(openai),
      resend: unwrap(resend),
      razorpay: unwrap(razorpay),
    },
    { checked_at: new Date().toISOString(), timeout_ms: TIMEOUT_MS }
  )
}
