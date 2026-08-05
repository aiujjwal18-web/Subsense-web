import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts"
import { requireAuthenticatedUser } from "../_shared/require-user.ts"
import { errorResponse, handleCorsPreflight, successResponse } from "../_shared/http.ts"
import { computeRenewalUrgency, daysUntil } from "../_shared/urgency.ts"
import { generateInsightText } from "../_shared/openai-client.ts"
import { buildInsightPrompt, type InsightContext } from "../_shared/insight-prompt.ts"

// Must match src/features/ai-insights/ai-insight-utils.ts's TOP_URGENT_LIMIT —
// duplicated across the Deno/TS runtime boundary, same accepted tradeoff as
// _shared/urgency.ts itself (see that file's comment).
const WORKSPACE_BATCH_LIMIT = 3

// DEC-082: free tier sees exactly 1 AI insight. Must match ai-insight-utils.ts's
// FREE_TIER_WORKSPACE_LIMIT — same cross-boundary duplication as WORKSPACE_BATCH_LIMIT
// above. Enforced here (not just on the frontend) so a free-tier client can't trigger
// (and get billed/cached for) 3 OpenAI generations when only 1 is ever shown, and a
// modified client can't simply request more.
const FREE_TIER_WORKSPACE_LIMIT = 1

interface SubscriptionRow {
  id: string
  user_id: string
  custom_name: string | null
  cost: number
  currency: string
  billing_frequency: string
  next_renewal_date: string
  lifecycle_status: string
  monthly_equivalent: number
  annual_equivalent: number
  subscription_catalog: { name: string } | null
}

interface FinancialImpact {
  monthly_impact: number
  annual_impact: number
  currency: string
}

interface SharedInfo {
  isShared: boolean
  memberCount: number
}

const SUBSCRIPTION_COLUMNS =
  "id, user_id, custom_name, cost, currency, billing_frequency, next_renewal_date, lifecycle_status, monthly_equivalent, annual_equivalent, subscription_catalog(name)"

function getSubscriptionName(sub: SubscriptionRow): string {
  return sub.subscription_catalog?.name ?? sub.custom_name ?? "Untitled subscription"
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function computeFinancialImpact(sub: SubscriptionRow): FinancialImpact {
  return {
    monthly_impact: sub.monthly_equivalent,
    annual_impact: sub.annual_equivalent,
    currency: sub.currency,
  }
}

// Batch-fetches shared status for a set of subscription_ids (no N+1) — reads
// shared_subscriptions + shared_members only, never writes either.
async function getSharedInfo(supabaseAdmin: SupabaseClient, subscriptionIds: string[]): Promise<Map<string, SharedInfo>> {
  const result = new Map<string, SharedInfo>()
  if (subscriptionIds.length === 0) return result

  const { data: sharedSubs } = await supabaseAdmin
    .from("shared_subscriptions")
    .select("id, subscription_id")
    .in("subscription_id", subscriptionIds)

  if (!sharedSubs || sharedSubs.length === 0) return result

  const sharedSubIds = sharedSubs.map((s) => s.id as string)
  const { data: members } = await supabaseAdmin
    .from("shared_members")
    .select("shared_subscription_id")
    .in("shared_subscription_id", sharedSubIds)
    .eq("status", "active")

  const countBySharedSubId = new Map<string, number>()
  for (const m of members ?? []) {
    const key = m.shared_subscription_id as string
    countBySharedSubId.set(key, (countBySharedSubId.get(key) ?? 0) + 1)
  }

  for (const s of sharedSubs) {
    result.set(s.subscription_id as string, {
      isShared: true,
      memberCount: countBySharedSubId.get(s.id as string) ?? 0,
    })
  }

  return result
}

type InsightOutcome =
  | { ok: true; subscription_id: string; recommendation: string; reason: string; financial_impact: FinancialImpact }
  | { ok: false; subscription_id: string; code: "AI_001" | "AI_003"; message: string }

// Single unit of work shared by both single-subscription and workspace-batch modes:
// build the prompt, call OpenAI, compute financial_impact from real DB columns
// (never from the model), write ai_recommendations + audit_logs. NEVER touches
// subscriptions or shared_subscriptions — the literal BR-001/GP-002 enforcement
// point, verified by the fact that no .update()/.insert()/.delete() against either
// table appears anywhere in this file.
async function generateInsightForSubscription(
  sub: SubscriptionRow,
  userId: string,
  supabaseAdmin: SupabaseClient,
  sharedInfo: SharedInfo
): Promise<InsightOutcome> {
  const context: InsightContext = {
    subscriptionName: getSubscriptionName(sub),
    billingFrequency: sub.billing_frequency,
    nextRenewalDate: formatDate(sub.next_renewal_date),
    daysUntilRenewal: daysUntil(sub.next_renewal_date),
    lifecycleStatus: sub.lifecycle_status,
    isShared: sharedInfo.isShared,
    sharedMemberCount: sharedInfo.memberCount,
  }

  const result = await generateInsightText(buildInsightPrompt(context))
  if (!result.ok) {
    return { ok: false, subscription_id: sub.id, code: result.code, message: result.message }
  }

  const financial_impact = computeFinancialImpact(sub)

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("ai_recommendations")
    .insert({
      user_id: userId,
      subscription_id: sub.id,
      recommendation_text: result.recommendation,
      reason_text: result.reason,
      financial_impact,
      model_version: "gpt-4o-mini",
    })
    .select("id")
    .single()

  if (insertError || !inserted) {
    return {
      ok: false,
      subscription_id: sub.id,
      code: "AI_003",
      message: insertError?.message ?? "Failed to persist insight.",
    }
  }

  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: userId,
    actor_type: "user",
    action: "ai_generated",
    entity_table: "ai_recommendations",
    entity_id: inserted.id,
    metadata: { subscription_id: sub.id, model_version: "gpt-4o-mini" },
  })

  return { ok: true, subscription_id: sub.id, recommendation: result.recommendation, reason: result.reason, financial_impact }
}

Deno.serve(async (req) => {
  const corsPreflight = handleCorsPreflight(req)
  if (corsPreflight) return corsPreflight

  const supabaseAdmin = createSupabaseAdminClient()

  const authResult = await requireAuthenticatedUser(req, supabaseAdmin)
  if (authResult instanceof Response) return authResult
  const { userId } = authResult

  let requestBody: { subscription_id?: string; scope?: string } = {}
  try {
    const text = await req.text()
    if (text) requestBody = JSON.parse(text)
  } catch {
    return errorResponse(400, "INVALID_BODY", "Request body must be valid JSON.")
  }

  // ---- single mode ----
  if (requestBody.subscription_id) {
    const { data: sub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("id", requestBody.subscription_id)
      .maybeSingle()

    if (subError || !sub || (sub as unknown as SubscriptionRow).user_id !== userId) {
      return errorResponse(404, "AI_002", "Subscription not found or not owned by this user.")
    }

    const typedSub = sub as unknown as SubscriptionRow
    const sharedInfoMap = await getSharedInfo(supabaseAdmin, [typedSub.id])
    const result = await generateInsightForSubscription(
      typedSub,
      userId,
      supabaseAdmin,
      sharedInfoMap.get(typedSub.id) ?? { isShared: false, memberCount: 0 }
    )

    if (!result.ok) {
      return errorResponse(result.code === "AI_001" ? 504 : 502, result.code, result.message)
    }

    return successResponse(
      {
        recommendation: result.recommendation,
        reason: result.reason,
        financial_impact: result.financial_impact,
      },
      {}
    )
  }

  // ---- workspace batch mode ----
  if (requestBody.scope === "workspace") {
    // Never trust a client-supplied premium flag — this is the live, service-role-callable
    // entitlement check already used elsewhere in the schema (17_SubSense_Migration_v2.sql:459-473).
    const { data: isPremium } = await supabaseAdmin.rpc("user_has_active_premium", { target_user_id: userId })
    const workspaceLimit = isPremium ? WORKSPACE_BATCH_LIMIT : FREE_TIER_WORKSPACE_LIMIT

    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("user_id", userId)
      .neq("lifecycle_status", "archived")
      .neq("lifecycle_status", "paused")

    // DEC-079: Critical or Upcoming only — Overdue is deliberately excluded, its
    // renewal decision point has already passed, a different signal than this batch
    // is for. Not the broader "!== normal" filter DecisionWorkspacePage's
    // upcomingRenewals uses for its own, separate purpose.
    const candidates = ((subs ?? []) as unknown as SubscriptionRow[])
      .map((row) => ({
        row,
        urgency: computeRenewalUrgency(row.next_renewal_date, row.lifecycle_status),
        days: daysUntil(row.next_renewal_date),
      }))
      .filter(({ urgency }) => urgency === "critical" || urgency === "upcoming")
      .sort((a, b) => a.days - b.days)
      .slice(0, workspaceLimit)
      .map(({ row }) => row)

    if (candidates.length === 0) {
      return successResponse({ insights: [] }, {})
    }

    const sharedInfoMap = await getSharedInfo(supabaseAdmin, candidates.map((s) => s.id))

    const results = await Promise.all(
      candidates.map((sub) =>
        generateInsightForSubscription(sub, userId, supabaseAdmin, sharedInfoMap.get(sub.id) ?? { isShared: false, memberCount: 0 })
      )
    )

    // A single subscription's failure doesn't fail the whole batch — it's simply
    // omitted; the frontend treats a missing subscription_id as "unavailable" for
    // that one card, not a page-level error.
    const insights = results
      .filter((r): r is Extract<InsightOutcome, { ok: true }> => r.ok)
      .map(({ subscription_id, recommendation, reason, financial_impact }) => ({
        subscription_id,
        recommendation,
        reason,
        financial_impact,
      }))

    return successResponse({ insights }, {})
  }

  return errorResponse(400, "INVALID_BODY", 'Request must include subscription_id or scope:"workspace".')
})
