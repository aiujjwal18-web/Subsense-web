export interface ResendEmailPayload {
  from: string
  to: string
  subject: string
  html: string
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; classification: "retryable" | "terminal"; errorCode: string; errorMessage: string }

const RESEND_ENDPOINT = "https://api.resend.com/emails"
const BACKOFF_MS = [1000, 2000, 4000]
const MAX_ATTEMPTS = 3

// 5xx/429/network/timeout are transient — worth retrying, and if still failing after
// 3 attempts the reminder stays 'pending' for the next hourly tick to pick up.
// 401/403 are ALSO bucketed as retryable, not terminal: they indicate something is
// wrong with our own Resend integration (e.g. a revoked/misconfigured RESEND_API_KEY),
// not with this specific recipient — every other reminder in the batch would fail the
// same way. Marking them terminal would let one bad API key permanently status='failed'
// an entire hour's worth of due reminders, which nothing but a manual DB fix recovers
// from — worse than the alternative of retrying forever, since a wrongly-'pending' row
// self-heals for free the moment the key is fixed.
// Only request/recipient-specific 4xx (400 malformed payload, 404, 422 invalid email,
// etc.) are terminal — retrying those can never succeed.
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 401 || status === 403
}

export async function sendWithRetry(payload: ResendEmailPayload): Promise<SendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  if (!apiKey) {
    // Missing key is an integration-config problem, not a per-recipient one — retryable,
    // same reasoning as 401/403 above (it'll self-heal once the secret is set correctly).
    return {
      ok: false,
      classification: "retryable",
      errorCode: "RESEND_API_KEY_MISSING",
      errorMessage: "RESEND_API_KEY is not set.",
    }
  }

  let lastFailure: { classification: "retryable" | "terminal"; errorCode: string; errorMessage: string } | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const json = (await response.json()) as { id: string }
        return { ok: true, providerMessageId: json.id }
      }

      const bodyText = await response.text()
      const retryable = isRetryableStatus(response.status)
      lastFailure = {
        classification: retryable ? "retryable" : "terminal",
        errorCode: `RESEND_HTTP_${response.status}`,
        errorMessage: bodyText,
      }

      if (!retryable) break // terminal failure — retrying can't help, stop early
    } catch (err) {
      lastFailure = {
        classification: "retryable",
        errorCode: "RESEND_NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : String(err),
      }
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt]))
    }
  }

  return { ok: false, ...lastFailure! }
}
