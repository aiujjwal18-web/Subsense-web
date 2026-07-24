// @supabase/auth-js treats every 5xx as "retryable" and skips parsing the
// response body for those, falling back to JSON.stringify() on the raw
// fetch-error object — which renders as the literal string "{}" even though
// the server actually returned a real message. Guard against that (and a
// plain empty message) with one sensible fallback.
const FALLBACK_MESSAGE = "Something went wrong. Please try again."

export function getAuthErrorMessage(error: { message?: string } | null): string {
  const message = error?.message?.trim()
  if (!message || message.startsWith("{")) {
    return FALLBACK_MESSAGE
  }
  return message
}
