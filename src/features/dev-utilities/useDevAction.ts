import { useState } from "react"

import { supabase } from "@/lib/supabase"

export type DevActionState = "idle" | "running" | "done" | "failed"

interface DevActionResult<T> {
  state: DevActionState
  data: T | null
  error: string | null
  run: (body: Record<string, unknown>) => Promise<void>
  reset: () => void
}

// Shared caller for the dev-utilities Edge Function. Every panel on the page has the
// same shape -- fire one action, show either its payload or its error verbatim -- so
// the request/response handling lives here once rather than four times.
//
// Errors are surfaced with their real code and message rather than a friendly
// substitute. On a normal product surface that would be wrong, but this page exists to
// diagnose: "PAY_004: Plan not found" or a Resend 429 is the useful answer, and
// "Something went wrong" would defeat the point of the page.
export function useDevAction<T = unknown>(action: string): DevActionResult<T> {
  const [state, setState] = useState<DevActionState>("idle")
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(body: Record<string, unknown>) {
    setState("running")
    setError(null)

    const { data: result, error: invokeError } = await supabase.functions.invoke("dev-utilities", {
      body: { action, ...body },
    })

    if (invokeError) {
      // functions.invoke surfaces a non-2xx as FunctionsHttpError without the parsed
      // body, so the envelope's own code/message is read off the response when present.
      let detail = invokeError.message
      const response = (invokeError as { context?: Response }).context
      if (response instanceof Response) {
        const parsed = await response.json().catch(() => null)
        if (parsed?.error?.code) detail = `${parsed.error.code}: ${parsed.error.message}`
      }
      setError(detail)
      setState("failed")
      return
    }

    if (!result?.success) {
      setError(
        result?.error?.code
          ? `${result.error.code}: ${result.error.message}`
          : "The function returned an unsuccessful response."
      )
      setState("failed")
      return
    }

    setData(result.data as T)
    setState("done")
  }

  function reset() {
    setState("idle")
    setData(null)
    setError(null)
  }

  return { state, data, error, run, reset }
}
