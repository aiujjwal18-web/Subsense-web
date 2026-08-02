export interface InsightPrompt {
  system: string
  user: string
}

export interface GeneratedInsight {
  recommendation: string
  reason: string
}

export type GenerateInsightResult =
  | ({ ok: true } & GeneratedInsight)
  | { ok: false; code: "AI_001" | "AI_003"; message: string }

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions"
const MODEL = "gpt-4o-mini"
const TIMEOUT_MS = 20_000
const MAX_ATTEMPTS = 2
const BACKOFF_MS = 500

// Interactive call — the user is waiting synchronously in-browser for this, unlike
// Phase 6's cron-invoked sendWithRetry (3 attempts, multi-second backoff). Shorter
// budget here: 2 attempts, ~500ms backoff, ~20s per-attempt timeout.
export async function generateInsightText(prompt: InsightPrompt): Promise<GenerateInsightResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY")
  if (!apiKey) {
    return { ok: false, code: "AI_003", message: "OPENAI_API_KEY is not set." }
  }

  let lastFailure: { code: "AI_001" | "AI_003"; message: string } | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          response_format: { type: "json_object" },
          // Encourages the "vary sentence opening/structure across cards" copy-tone
          // rule rather than the model settling on one repeated skeleton.
          temperature: 0.8,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const bodyText = await response.text()
        lastFailure = { code: "AI_003", message: `OpenAI HTTP ${response.status}: ${bodyText}` }
      } else {
        const json = await response.json()
        const content: string | undefined = json?.choices?.[0]?.message?.content
        if (!content) {
          lastFailure = { code: "AI_003", message: "OpenAI response had no message content." }
        } else {
          try {
            const parsed = JSON.parse(content)
            if (typeof parsed.recommendation === "string" && typeof parsed.reason === "string") {
              return { ok: true, recommendation: parsed.recommendation, reason: parsed.reason }
            }
            lastFailure = { code: "AI_003", message: "OpenAI response JSON missing recommendation/reason." }
          } catch {
            lastFailure = { code: "AI_003", message: "OpenAI response was not valid JSON." }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        lastFailure = { code: "AI_001", message: "OpenAI request timed out." }
      } else {
        lastFailure = { code: "AI_003", message: err instanceof Error ? err.message : String(err) }
      }
    } finally {
      clearTimeout(timeout)
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS))
    }
  }

  return { ok: false, ...lastFailure! }
}
