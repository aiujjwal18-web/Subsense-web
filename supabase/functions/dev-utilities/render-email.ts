import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { errorResponse, successResponse } from "../_shared/http.ts"
import { renderEmail, type TemplateContext } from "../_shared/email-template.ts"

// Render-only email preview. Deliberately NEVER calls Resend.
//
// Two reasons this is server-side rather than a client-side preview: the templates live
// in notification_templates (a table the browser has no business reading wholesale), and
// renderEmail() is Deno-side shared code. Porting the renderer into src/ would have
// avoided an Edge Function entirely, but a copied renderer silently stops matching what
// actually gets emailed the first time either copy is edited — and a preview that lies
// is worse than no preview.
//
// The context below is built from the caller's own real subscription so the preview shows
// realistic values rather than lorem placeholders. Where a template needs a figure the
// caller has no row for, a clearly-marked sample value is substituted rather than leaving
// the token unresolved.

interface TemplateRow {
  template_code: string
  subject: string
  body: string
}

interface SubscriptionRow {
  cost: number
  currency: string
  next_renewal_date: string
  custom_name: string | null
  monthly_equivalent: number
  annual_equivalent: number
  subscription_catalog: { name: string } | null
}

// --- Copied from send-reminder-email/index.ts (formatMoney / formatDate) ---
function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// reminder_<type> is the template_code convention send-reminder-email uses when it looks
// a template up (`reminder_${reminder.reminder_type}`).
function reminderTypeFromCode(templateCode: string): string {
  return templateCode.startsWith("reminder_") ? templateCode.slice("reminder_".length) : templateCode
}

// Mirrors send-reminder-email/index.ts's buildContext, but sourced from one real
// subscription belonging to the caller rather than from a claimed reminders row --
// this action previews a template, it does not simulate a send.
function buildPreviewContext(
  reminderType: string,
  sub: SubscriptionRow | null,
  subscriptionCount: number,
  monthlySpend: string,
  annualSpend: string
): TemplateContext {
  if (reminderType === "monthly_digest" || reminderType === "lapsed_reengagement") {
    return {
      active_subscription_count: subscriptionCount,
      monthly_spend: monthlySpend,
      annual_spend: annualSpend,
      // Empty by design, matching production: the joined totals above already embed
      // their own currency symbols, so the template's trailing {{currency}} resolves to
      // nothing and collapseWhitespace() tidies the gap. Previewing this is a genuine
      // regression check on that helper.
      currency: "",
      ai_insight_count: 0,
    }
  }

  const name = sub?.subscription_catalog?.name ?? sub?.custom_name ?? "Sample Subscription"

  if (reminderType === "shared_payment") {
    return {
      subscription_name: name,
      amount: sub?.cost ?? 499,
      currency: sub?.currency ?? "INR",
      owed_to: "a sample subscription owner",
    }
  }

  return {
    subscription_name: name,
    renewal_date: sub ? formatDate(sub.next_renewal_date) : formatDate(new Date().toISOString()),
    amount: sub?.cost ?? 499,
    currency: sub?.currency ?? "INR",
  }
}

export async function handleRenderEmail(
  supabaseAdmin: SupabaseClient,
  userId: string,
  body: { template_code?: unknown }
): Promise<Response> {
  if (typeof body.template_code !== "string") {
    return errorResponse(400, "DEV_001", "template_code is required.")
  }

  const { data: template } = await supabaseAdmin
    .from("notification_templates")
    .select("template_code, subject, body")
    .eq("template_code", body.template_code)
    .eq("is_active", true)
    .maybeSingle()

  const typedTemplate = template as TemplateRow | null
  if (!typedTemplate) {
    return errorResponse(404, "DEV_002", `No active template with code '${body.template_code}'.`)
  }

  // Caller's own subscriptions only -- never another user's, even though this is a
  // read-only preview: the rendered HTML would otherwise leak their subscription names
  // and renewal dates.
  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "cost, currency, next_renewal_date, custom_name, monthly_equivalent, annual_equivalent, subscription_catalog(name)"
    )
    .eq("user_id", userId)
    .is("archived_at", null)

  const rows = (subs ?? []) as unknown as SubscriptionRow[]

  // Per-currency joins rather than one summed figure -- adding different currencies
  // together produces a meaningless number, the same rule every other surface here
  // follows.
  const byCurrency = new Map<string, { monthly: number; annual: number }>()
  for (const row of rows) {
    const entry = byCurrency.get(row.currency) ?? { monthly: 0, annual: 0 }
    entry.monthly += row.monthly_equivalent ?? 0
    entry.annual += row.annual_equivalent ?? 0
    byCurrency.set(row.currency, entry)
  }
  const joinPerCurrency = (field: "monthly" | "annual") =>
    byCurrency.size === 0
      ? formatMoney(0, "INR")
      : [...byCurrency.entries()].map(([currency, t]) => formatMoney(t[field], currency)).join(" + ")

  const reminderType = reminderTypeFromCode(typedTemplate.template_code)
  const context = buildPreviewContext(
    reminderType,
    rows[0] ?? null,
    rows.length,
    joinPerCurrency("monthly"),
    joinPerCurrency("annual")
  )

  const appUrl = Deno.env.get("APP_BASE_URL") ?? "https://subsense.co.in"
  const rendered = renderEmail(
    typedTemplate.subject,
    typedTemplate.body,
    context,
    appUrl,
    reminderType
  )

  return successResponse(
    {
      template_code: typedTemplate.template_code,
      reminder_type: reminderType,
      subject: rendered.subject,
      html: rendered.html,
      context,
      used_real_subscription: rows.length > 0,
    },
    { sent: false, provider_calls: 0 }
  )
}
