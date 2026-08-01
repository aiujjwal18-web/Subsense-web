import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts"
import { requireServiceRole, successResponse, errorResponse } from "../_shared/http.ts"
import { sendWithRetry } from "../_shared/resend-client.ts"
import { renderEmail, type TemplateContext } from "../_shared/email-template.ts"

const BATCH_CAP = 200
const LEASE_MINUTES = 10
const CONCURRENCY = 12

interface ReminderRow {
  id: string
  user_id: string
  subscription_id: string | null
  payment_request_id: string | null
  reminder_type: string
  scheduled_for: string
  timezone_snapshot: string
}

interface ProcessResult {
  reminder_id: string
  status: "sent" | "failed" | "skipped_archived"
  provider_message_id?: string
  error?: { code: string; message: string }
}

interface SubscriptionContextRow {
  id: string
  cost: number
  currency: string
  next_renewal_date: string
  custom_name: string | null
  archived_at: string | null
  subscription_catalog: { name: string } | null
}

interface PaymentRequestContextRow {
  id: string
  amount: number
  currency: string
  shared_subscriptions: {
    subscriptions: {
      custom_name: string | null
      subscription_catalog: { name: string } | null
    } | null
  } | null
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

// Multi-currency users: join per-currency totals ("₹840 + $12") rather than reporting
// only one currency and silently dropping the rest — mirrors DecisionWorkspacePage.tsx's
// computeTotalsByCurrency, which already refuses to sum different currencies together.
function joinPerCurrency(byCurrency: Map<string, { monthly: number; annual: number }>, field: "monthly" | "annual"): string {
  if (byCurrency.size === 0) return formatMoney(0, "INR")
  return [...byCurrency.entries()].map(([currency, totals]) => formatMoney(totals[field], currency)).join(" + ")
}

async function processInChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size)
    results.push(...(await Promise.all(chunk.map(fn))))
  }
  return results
}

Deno.serve(async (req) => {
  const authError = requireServiceRole(req)
  if (authError) return authError

  let requestBody: { reminder_id?: string } = {}
  try {
    const text = await req.text()
    if (text) requestBody = JSON.parse(text)
  } catch {
    return errorResponse(400, "INVALID_BODY", "Request body must be valid JSON or empty.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const mode: "single" | "batch" = requestBody.reminder_id ? "single" : "batch"
  const nowIso = new Date().toISOString()
  const leaseThreshold = new Date(Date.now() - LEASE_MINUTES * 60_000).toISOString()

  // Claim-before-send: a single atomic UPDATE bumps updated_at as a soft lease.
  // status stays 'pending' throughout the claim — it is only ever set to 'sent' after
  // Resend confirms delivery (see below), never optimistically here. A second,
  // truly-concurrent invocation's claim query excludes rows this one just bumped
  // (its own updated_at <= leaseThreshold filter no longer matches), giving SQS-style
  // visibility-timeout safety without a new "processing" enum value or a migration.
  // If an invocation crashes mid-batch, claimed-but-unprocessed rows self-heal once the
  // 10-minute lease expires — well within the next hourly tick (DEC-068's catch-up model).
  let claimQuery = supabaseAdmin
    .from("reminders")
    .update({ updated_at: nowIso })
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .lte("updated_at", leaseThreshold)

  claimQuery =
    mode === "single"
      ? claimQuery.eq("id", requestBody.reminder_id as string)
      : claimQuery.order("scheduled_for", { ascending: true }).limit(BATCH_CAP)

  // NOTE: assumes .order()/.limit() chaining on .update() is supported by this
  // project's installed supabase-js/PostgREST version — verify via `supabase functions
  // serve` once the CLI is linked. If unsupported, drop .order()/.limit() here (claim
  // all due+unleased rows in one UPDATE) and slice to BATCH_CAP client-side below;
  // unprocessed rows still self-heal via the same lease, costing only a bounded delay.
  const { data: claimedRaw, error: claimError } = await claimQuery.select(
    "id, user_id, subscription_id, payment_request_id, reminder_type, scheduled_for, timezone_snapshot"
  )

  if (claimError) {
    return errorResponse(500, "CLAIM_FAILED", claimError.message)
  }

  const claimed = ((claimedRaw ?? []) as ReminderRow[]).slice(0, BATCH_CAP)

  if (mode === "single" && claimed.length === 0) {
    return errorResponse(404, "NOT_FOUND", "reminder_id not found or not currently claimable.")
  }

  if (claimed.length === 0) {
    return successResponse(
      { processed: 0, sent: 0, failed: 0, results: [] },
      { invoked_at: nowIso, mode, batch_cap: BATCH_CAP, lease_minutes: LEASE_MINUTES }
    )
  }

  // ---- batch-fetch supporting data (no N+1) ----
  const { data: templates } = await supabaseAdmin
    .from("notification_templates")
    .select("id, template_code, subject, body")
    .eq("is_active", true)
  const templateByCode = new Map((templates ?? []).map((t) => [t.template_code as string, t]))

  const userIds = [...new Set(claimed.map((r) => r.user_id))]
  const { data: users } = await supabaseAdmin.from("users").select("id, email").in("id", userIds)
  const userById = new Map((users ?? []).map((u) => [u.id as string, u]))

  const subscriptionIds = [...new Set(claimed.map((r) => r.subscription_id).filter((id): id is string => Boolean(id)))]
  const { data: subscriptions } = subscriptionIds.length
    ? await supabaseAdmin
        .from("subscriptions")
        .select("id, cost, currency, next_renewal_date, custom_name, archived_at, subscription_catalog(name)")
        .in("id", subscriptionIds)
    : { data: [] as SubscriptionContextRow[] }
  const subscriptionById = new Map(
    ((subscriptions ?? []) as SubscriptionContextRow[]).map((s) => [s.id, s])
  )

  const paymentRequestIds = [
    ...new Set(claimed.map((r) => r.payment_request_id).filter((id): id is string => Boolean(id))),
  ]
  const { data: paymentRequests } = paymentRequestIds.length
    ? await supabaseAdmin
        .from("payment_requests")
        .select(
          "id, amount, currency, shared_subscriptions(subscriptions(custom_name, subscription_catalog(name)))"
        )
        .in("id", paymentRequestIds)
    : { data: [] as PaymentRequestContextRow[] }
  const paymentRequestById = new Map(
    ((paymentRequests ?? []) as PaymentRequestContextRow[]).map((p) => [p.id, p])
  )

  // monthly_digest/lapsed_reengagement are user-level (no subscription_id) — aggregate
  // each affected user's active-subscription count and per-currency monthly/annual totals.
  const digestUserIds = [
    ...new Set(
      claimed
        .filter((r) => r.reminder_type === "monthly_digest" || r.reminder_type === "lapsed_reengagement")
        .map((r) => r.user_id)
    ),
  ]
  const userTotals = new Map<string, { count: number; byCurrency: Map<string, { monthly: number; annual: number }> }>()
  if (digestUserIds.length) {
    const { data: activeSubs } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, currency, monthly_equivalent, annual_equivalent")
      .in("user_id", digestUserIds)
      .is("archived_at", null)
    for (const s of activeSubs ?? []) {
      const entry = userTotals.get(s.user_id) ?? { count: 0, byCurrency: new Map() }
      entry.count += 1
      const cur = entry.byCurrency.get(s.currency) ?? { monthly: 0, annual: 0 }
      cur.monthly += s.monthly_equivalent ?? 0
      cur.annual += s.annual_equivalent ?? 0
      entry.byCurrency.set(s.currency, cur)
      userTotals.set(s.user_id, entry)
    }
  }

  const appUrl = Deno.env.get("APP_BASE_URL") ?? "https://subsense.co.in"
  const fromAddress = Deno.env.get("RESEND_FROM_ADDRESS") ?? "onboarding@resend.dev"

  function buildContext(reminder: ReminderRow): TemplateContext | null {
    if (reminder.reminder_type === "monthly_digest" || reminder.reminder_type === "lapsed_reengagement") {
      const totals = userTotals.get(reminder.user_id) ?? { count: 0, byCurrency: new Map() }
      return {
        active_subscription_count: totals.count,
        monthly_spend: joinPerCurrency(totals.byCurrency, "monthly"),
        annual_spend: joinPerCurrency(totals.byCurrency, "annual"),
        // Copy already embeds the currency symbol inside the joined totals above, so the
        // template's own trailing {{currency}} token resolves to empty here by design.
        currency: "",
        ai_insight_count: 0, // Phase 7 AI feature doesn't exist yet
      }
    }

    if (reminder.reminder_type === "shared_payment") {
      const pr = reminder.payment_request_id ? paymentRequestById.get(reminder.payment_request_id) : null
      if (!pr) return null
      const subName =
        pr.shared_subscriptions?.subscriptions?.subscription_catalog?.name ??
        pr.shared_subscriptions?.subscriptions?.custom_name ??
        "Untitled subscription"
      return { subscription_name: subName, amount: pr.amount, currency: pr.currency }
    }

    if (reminder.subscription_id) {
      const sub = subscriptionById.get(reminder.subscription_id)
      if (!sub) return null
      return {
        subscription_name: sub.subscription_catalog?.name ?? sub.custom_name ?? "Untitled subscription",
        renewal_date: formatDate(sub.next_renewal_date),
        amount: sub.cost,
        currency: sub.currency,
      }
    }

    return null
  }

  async function recordFailure(
    reminder: ReminderRow,
    classification: "retryable" | "terminal",
    errorCode: string,
    errorMessage: string,
    templateId: string | null
  ) {
    await supabaseAdmin.from("notifications").insert({
      user_id: reminder.user_id,
      reminder_id: reminder.id,
      payment_request_id: reminder.payment_request_id,
      channel: "email",
      template_id: templateId,
      delivery_status: "failed",
    })
    await supabaseAdmin.from("reminder_history").insert({
      reminder_id: reminder.id,
      user_id: reminder.user_id,
      delivery_status: "failed",
      error_code: errorCode,
      error_message: errorMessage,
      trigger_source: mode === "single" ? "developer" : "system",
    })
    await supabaseAdmin.from("audit_logs").insert({
      actor_type: "service",
      action: "email_delivery_failed",
      entity_table: "reminders",
      entity_id: reminder.id,
      metadata: { reminder_type: reminder.reminder_type, error_code: errorCode, error_message: errorMessage },
    })

    // Retryable: leave status='pending' untouched — the lease bumped at claim time
    // expires in 10 minutes, so the next hourly tick reclaims and retries it for free.
    // Terminal: mark 'failed' so a genuinely per-row-broken reminder (bad recipient,
    // malformed payload) stops re-attempting forever and the schema's 'failed' status
    // is actually used.
    if (classification === "terminal") {
      await supabaseAdmin.from("reminders").update({ status: "failed" }).eq("id", reminder.id).eq("status", "pending")
    }
  }

  async function processReminder(reminder: ReminderRow): Promise<ProcessResult> {
    const user = userById.get(reminder.user_id)
    const templateCode = `reminder_${reminder.reminder_type}`
    const template = templateByCode.get(templateCode)

    if (!user?.email || !template) {
      const errorCode = !user?.email ? "USER_EMAIL_MISSING" : "TEMPLATE_MISSING"
      const errorMessage = !user?.email ? "No user or email on file." : `No active template for ${templateCode}.`
      await recordFailure(reminder, "terminal", errorCode, errorMessage, template?.id ?? null)
      return { reminder_id: reminder.id, status: "failed", error: { code: errorCode, message: errorMessage } }
    }

    // Defensive (belt-and-braces, likely overlaps with an existing DB-side mechanism
    // per doc 10 — not treated as closing a real gap on its own): skip a stale reminder
    // whose subscription was archived after it was scheduled.
    if (reminder.subscription_id) {
      const sub = subscriptionById.get(reminder.subscription_id)
      if (sub?.archived_at) {
        await supabaseAdmin
          .from("reminders")
          .update({ status: "skipped_archived" })
          .eq("id", reminder.id)
          .eq("status", "pending")
        return { reminder_id: reminder.id, status: "skipped_archived" }
      }
    }

    const context = buildContext(reminder)
    if (!context) {
      await recordFailure(
        reminder,
        "terminal",
        "CONTEXT_UNAVAILABLE",
        "Could not build template context (missing related row).",
        template.id
      )
      return {
        reminder_id: reminder.id,
        status: "failed",
        error: { code: "CONTEXT_UNAVAILABLE", message: "Missing related row." },
      }
    }

    const rendered = renderEmail(template.subject, template.body, context, appUrl, reminder.reminder_type)
    const result = await sendWithRetry({
      from: `SubSense <${fromAddress}>`,
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
    })

    if (result.ok) {
      await supabaseAdmin.from("notifications").insert({
        user_id: reminder.user_id,
        reminder_id: reminder.id,
        payment_request_id: reminder.payment_request_id,
        channel: "email",
        template_id: template.id,
        delivery_status: "sent",
        provider_message_id: result.providerMessageId,
        sent_at: new Date().toISOString(),
      })
      await supabaseAdmin.from("reminder_history").insert({
        reminder_id: reminder.id,
        user_id: reminder.user_id,
        delivery_status: "sent",
        provider_message_id: result.providerMessageId,
        trigger_source: mode === "single" ? "developer" : "system",
      })
      await supabaseAdmin.from("reminders").update({ status: "sent" }).eq("id", reminder.id).eq("status", "pending")
      return { reminder_id: reminder.id, status: "sent", provider_message_id: result.providerMessageId }
    }

    await recordFailure(reminder, result.classification, result.errorCode, result.errorMessage, template.id)
    return {
      reminder_id: reminder.id,
      status: "failed",
      error: { code: result.errorCode, message: result.errorMessage },
    }
  }

  const results = await processInChunks(claimed, CONCURRENCY, processReminder)

  if (mode === "single") {
    const result = results[0]
    if (result.status === "failed") {
      return errorResponse(502, result.error?.code ?? "SEND_FAILED", result.error?.message ?? "Failed to send reminder.")
    }
    return successResponse(
      { reminder_id: result.reminder_id, status: result.status, provider_message_id: result.provider_message_id },
      { invoked_at: nowIso, mode }
    )
  }

  const sent = results.filter((r) => r.status === "sent").length
  const failed = results.filter((r) => r.status === "failed").length

  return successResponse(
    { processed: results.length, sent, failed, results },
    { invoked_at: nowIso, mode, batch_cap: BATCH_CAP, lease_minutes: LEASE_MINUTES }
  )
})
