import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useDevAction } from "./useDevAction"
import { useOwnSubscriptions } from "./useOwnSubscriptions"

// Shared bits ---------------------------------------------------------------

// Monospace here is genuine data -- JSON payloads and prompt text -- not a costume for
// "technical". Everything else on the page stays in the app's normal type stack.
function Output({ children }: { children: string }) {
  return (
    <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
      {children}
    </pre>
  )
}

function ErrorLine({ message }: { message: string }) {
  // Verbatim, with its real error code: this page exists to diagnose, so a friendly
  // substitute would destroy the only useful information.
  return (
    <p role="alert" className="mt-3 font-mono text-xs text-destructive">
      {message}
    </p>
  )
}

function SubscriptionPicker({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  const { options, loading } = useOwnSubscriptions()

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your subscriptions…
      </p>
    )
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No active subscriptions — add one before using this.
      </p>
    )
  }

  return (
    <div>
      <Label htmlFor={id}>Subscription</Label>
      {/* Native <select>: this is a developer surface, and the app's styled Select
          brings a portal and popup positioning for no benefit here. */}
      <select
        id={id}
        value={value || options[0].id}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-8 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  )
}

// 1. Send Reminder Now ------------------------------------------------------

const REMINDER_TYPES = [
  { value: "dev_test", label: "dev_test — internal test template" },
  { value: "seven_day", label: "seven_day — 7 days before renewal" },
  { value: "two_day", label: "two_day — 2 days before renewal" },
  { value: "renewal_day", label: "renewal_day — on the renewal date" },
  { value: "post_renewal_checkin", label: "post_renewal_checkin — after renewal" },
]

export function SendReminderPanel() {
  const [subscriptionId, setSubscriptionId] = useState("")
  const [reminderType, setReminderType] = useState("dev_test")
  const { state, data, error, run } = useDevAction("trigger_reminder")
  const { options } = useOwnSubscriptions()

  const effectiveId = subscriptionId || options[0]?.id

  return (
    <div className="space-y-4">
      <SubscriptionPicker id="reminder-subscription" value={subscriptionId} onChange={setSubscriptionId} />

      <div>
        <Label htmlFor="reminder-type">Reminder type</Label>
        <select
          id="reminder-type"
          value={reminderType}
          onChange={(event) => setReminderType(event.target.value)}
          className="mt-1.5 h-8 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
        >
          {REMINDER_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <Button
        type="button"
        size="sm"
        disabled={state === "running" || !effectiveId}
        onClick={() => run({ subscription_id: effectiveId, reminder_type: reminderType })}
      >
        {state === "running" ? "Sending…" : "Send reminder now"}
      </Button>

      {error && <ErrorLine message={error} />}
      {state === "done" && data != null && <Output>{JSON.stringify(data, null, 2)}</Output>}
    </div>
  )
}

// 2. Test AI Response -------------------------------------------------------

interface PromptPayload {
  target: string
  prompt: { system: string; user: string }
  context: unknown
}

export function TestAiPanel() {
  const [subscriptionId, setSubscriptionId] = useState("")
  const [target, setTarget] = useState<"insight" | "summary">("insight")
  const dryRun = useDevAction<PromptPayload>("build_prompt")
  const { options } = useOwnSubscriptions()
  const [realState, setRealState] = useState<"idle" | "running" | "done" | "failed">("idle")
  const [realResult, setRealResult] = useState<string | null>(null)

  const effectiveId = subscriptionId || options[0]?.id

  // Real mode calls the PRODUCTION functions directly and unmodified -- the same
  // invocation the Insights UI makes. Nothing about ai-generate-insight or
  // insights-generate-summary was changed to support this page (Fork E), so this is a
  // genuine end-to-end exercise of the live path rather than a simulation of it.
  async function runReal() {
    setRealState("running")
    setRealResult(null)
    const { supabase } = await import("@/lib/supabase")
    const { data, error } = await supabase.functions.invoke(
      target === "insight" ? "ai-generate-insight" : "insights-generate-summary",
      { body: target === "insight" ? { subscription_id: effectiveId } : {} }
    )
    if (error) {
      setRealResult(error.message)
      setRealState("failed")
      return
    }
    setRealResult(JSON.stringify(data, null, 2))
    setRealState("done")
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="ai-target">Target</Label>
        <select
          id="ai-target"
          value={target}
          onChange={(event) => setTarget(event.target.value as "insight" | "summary")}
          className="mt-1.5 h-8 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="insight">Single-subscription insight</option>
          <option value="summary">Portfolio summary (Insights page)</option>
        </select>
      </div>

      {target === "insight" && (
        <SubscriptionPicker id="ai-subscription" value={subscriptionId} onChange={setSubscriptionId} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={dryRun.state === "running"}
          onClick={() =>
            dryRun.run(target === "insight" ? { target, subscription_id: effectiveId } : { target })
          }
        >
          {dryRun.state === "running" ? "Building…" : "Show prompt (free)"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={realState === "running"}
          onClick={runReal}
        >
          {realState === "running" ? "Calling…" : "Call model for real"}
        </Button>
        <span className="text-xs text-muted-foreground">
          A real call spends OpenAI quota and writes a row your Insights page will show.
        </span>
      </div>

      {dryRun.error && <ErrorLine message={dryRun.error} />}
      {dryRun.state === "done" && dryRun.data && (
        <Output>
          {`--- system ---\n${dryRun.data.prompt.system}\n\n--- user ---\n${dryRun.data.prompt.user}\n\n--- context ---\n${JSON.stringify(dryRun.data.context, null, 2)}`}
        </Output>
      )}

      {realState === "failed" && realResult && <ErrorLine message={realResult} />}
      {realState === "done" && realResult && <Output>{realResult}</Output>}
    </div>
  )
}

// 3. Test Email Payload -----------------------------------------------------

const TEMPLATE_CODES = [
  "reminder_dev_test",
  "reminder_seven_day",
  "reminder_two_day",
  "reminder_renewal_day",
  "reminder_post_renewal_checkin",
  "reminder_shared_payment",
  "reminder_monthly_digest",
  "reminder_lapsed_reengagement",
]

interface EmailPayload {
  subject: string
  html: string
  used_real_subscription: boolean
}

export function TestEmailPanel() {
  const [templateCode, setTemplateCode] = useState(TEMPLATE_CODES[0])
  const { state, data, error, run } = useDevAction<EmailPayload>("render_email")

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="template-code">Template</Label>
        <select
          id="template-code"
          value={templateCode}
          onChange={(event) => setTemplateCode(event.target.value)}
          className="mt-1.5 h-8 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
        >
          {TEMPLATE_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>

      <Button
        type="button"
        size="sm"
        disabled={state === "running"}
        onClick={() => run({ template_code: templateCode })}
      >
        {state === "running" ? "Rendering…" : "Render preview"}
      </Button>

      {error && <ErrorLine message={error} />}

      {state === "done" && data && (
        <div className="mt-3">
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">Subject: </span>
            {data.subject}
          </p>
          {!data.used_real_subscription && (
            <p className="mt-1 text-xs text-muted-foreground">
              Rendered with sample values — you have no active subscriptions to draw from.
            </p>
          )}
          {/* Sandboxed iframe, never dangerouslySetInnerHTML. The template HTML is
              trusted, but the iframe also isolates the email's own light-mode styling
              from the app's dark theme — inlined, it would render against the wrong
              background and look broken for reasons that have nothing to do with the
              template. */}
          <iframe
            title={`Email preview: ${data.subject}`}
            srcDoc={data.html}
            sandbox=""
            className="mt-2 h-96 w-full rounded-lg border border-border bg-white"
          />
        </div>
      )}
    </div>
  )
}

// 4. Integration status -----------------------------------------------------

interface ServiceStatus {
  ok: boolean
  latency_ms: number
  reason?: string
}

type StatusPayload = Record<string, ServiceStatus>

const SERVICE_LABELS: Record<string, string> = {
  supabase: "Supabase",
  openai: "OpenAI",
  resend: "Resend",
  razorpay: "Razorpay",
}

export function IntegrationStatusPanel() {
  const { state, data, error, run } = useDevAction<StatusPayload>("integration_status")

  return (
    <div className="space-y-4">
      <Button type="button" size="sm" disabled={state === "running"} onClick={() => run({})}>
        {state === "running" ? "Checking…" : "Check all four"}
      </Button>

      {error && <ErrorLine message={error} />}

      {state === "done" && data && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {Object.entries(SERVICE_LABELS).map(([key, label]) => {
            const status = data[key]
            if (!status) return null
            return (
              <li key={key} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-foreground">{label}</span>
                <span className="flex items-baseline gap-2">
                  {/* Word, not a coloured dot. Status is never conveyed by colour alone
                      anywhere in this app; colour only reinforces the text.
                      A reason can accompany a healthy status too — Resend's send-only key
                      is reachable and working, but could not answer a full read check, and
                      flattening that to a bare "Reachable" would hide a real caveat. */}
                  <span
                    className={`text-sm ${status.ok ? "text-[var(--chart-3)]" : "text-destructive"}`}
                  >
                    {status.ok
                      ? status.reason === "restricted_key"
                        ? "Reachable (send-only key)"
                        : "Reachable"
                      : (status.reason ?? "Failed")}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {status.latency_ms}ms
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
