import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { errorResponse, successResponse } from "../_shared/http.ts"
import { daysUntil } from "../_shared/urgency.ts"
import { buildInsightPrompt, type InsightContext } from "../_shared/insight-prompt.ts"
import {
  buildPortfolioSummaryPrompt,
  type PortfolioSummaryContext,
} from "../_shared/insight-summary-prompt.ts"

// Dry-run prompt builder for the Test AI Response utility.
//
// FORK E (decided): ai-generate-insight/index.ts and insights-generate-summary/index.ts
// are live, demo-critical, and are NOT modified to support this. Adding a `dry_run` flag
// to them would have given perfect fidelity, but at the cost of editing the two functions
// the Insights feature depends on days before the showcase. Instead the *context
// assembly* is rebuilt here.
//
// ACCEPTED RISK, stated plainly: the helpers below are copies. If the originals change,
// these silently drift and the previewed prompt stops matching the real one. Each copy
// names its source so the drift is at least visible. What is NOT duplicated is the prompt
// text itself — buildInsightPrompt and buildPortfolioSummaryPrompt are imported from
// _shared/, so the system prompt and user-message shape shown here are always exactly
// what production sends. Drift is therefore confined to the input values, never the
// prompt wording.
//
// This action NEVER calls OpenAI and NEVER writes to the database. The utility's "real
// call" mode deliberately goes through the untouched production functions from the
// browser instead, which makes it a genuine end-to-end test rather than a simulation.

// --- Copied from ai-generate-insight/index.ts (SUBSCRIPTION_COLUMNS) ---
const INSIGHT_SUBSCRIPTION_COLUMNS =
  "id, user_id, custom_name, cost, currency, billing_frequency, next_renewal_date, lifecycle_status, monthly_equivalent, annual_equivalent, subscription_catalog(name)"

// --- Copied from insights-generate-summary/index.ts (SUBSCRIPTION_COLUMNS) ---
const SUMMARY_SUBSCRIPTION_COLUMNS =
  "id, custom_name, cost, currency, monthly_equivalent, annual_equivalent, catalog_id, subscription_catalog(name, category:subscription_categories(name))"

interface InsightSubscriptionRow {
  id: string
  user_id: string
  custom_name: string | null
  billing_frequency: string
  next_renewal_date: string
  lifecycle_status: string
  subscription_catalog: { name: string } | null
}

interface SummarySubscriptionRow {
  id: string
  custom_name: string | null
  cost: number
  currency: string
  monthly_equivalent: number
  annual_equivalent: number
  catalog_id: string | null
  subscription_catalog: { name: string; category: { name: string } | null } | null
}

// --- Copied from ai-generate-insight/index.ts and insights-generate-summary/index.ts ---
function getSubscriptionName(sub: {
  custom_name: string | null
  subscription_catalog: { name: string } | null
}): string {
  return sub.subscription_catalog?.name ?? sub.custom_name ?? "Untitled subscription"
}

// --- Copied from insights-generate-summary/index.ts ---
function getCategoryName(sub: SummarySubscriptionRow): string | null {
  return sub.subscription_catalog?.category?.name ?? null
}

// --- Copied from ai-generate-insight/index.ts ---
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// --- Copied from ai-generate-insight/index.ts (getSharedInfo) ---
async function getSharedInfo(
  supabaseAdmin: SupabaseClient,
  subscriptionId: string
): Promise<{ isShared: boolean; memberCount: number }> {
  const { data: sharedSubs } = await supabaseAdmin
    .from("shared_subscriptions")
    .select("id, subscription_id")
    .eq("subscription_id", subscriptionId)

  if (!sharedSubs || sharedSubs.length === 0) return { isShared: false, memberCount: 0 }

  const { data: members } = await supabaseAdmin
    .from("shared_members")
    .select("shared_subscription_id")
    .in(
      "shared_subscription_id",
      sharedSubs.map((s) => s.id as string)
    )
    .eq("status", "active")

  return { isShared: true, memberCount: (members ?? []).length }
}

// --- Copied from insights-generate-summary/index.ts (computeTotalsByCurrency) ---
function computeTotalsByCurrency(rows: SummarySubscriptionRow[]) {
  const map = new Map<string, { monthly: number; annual: number }>()
  for (const row of rows) {
    const entry = map.get(row.currency) ?? { monthly: 0, annual: 0 }
    entry.monthly += row.monthly_equivalent ?? 0
    entry.annual += row.annual_equivalent ?? 0
    map.set(row.currency, entry)
  }
  return Array.from(map.entries()).map(([currency, totals]) => ({ currency, ...totals }))
}

// --- Copied from insights-generate-summary/index.ts (findDuplicateGroups), reduced to
// the two category lists PortfolioSummaryContext actually consumes. ---
function findDuplicateAndOverlapCategories(rows: SummarySubscriptionRow[]) {
  const duplicateCategories: string[] = []
  const overlapCategories: string[] = []

  const exactByKey = new Map<string, SummarySubscriptionRow[]>()
  for (const row of rows) {
    if (!row.catalog_id) continue
    const key = `${row.catalog_id}::${row.currency}`
    const list = exactByKey.get(key) ?? []
    list.push(row)
    exactByKey.set(key, list)
  }
  for (const group of exactByKey.values()) {
    if (group.length < 2) continue
    duplicateCategories.push(getSubscriptionName(group[0]))
  }

  const categoryByKey = new Map<string, SummarySubscriptionRow[]>()
  for (const row of rows) {
    const category = getCategoryName(row)
    if (!category) continue
    const key = `${category}::${row.currency}`
    const list = categoryByKey.get(key) ?? []
    list.push(row)
    categoryByKey.set(key, list)
  }
  for (const [key, group] of categoryByKey.entries()) {
    if (group.length < 2) continue
    overlapCategories.push(key.split("::")[0])
  }

  return {
    duplicateCategories: [...new Set(duplicateCategories)],
    overlapCategories: [...new Set(overlapCategories)],
  }
}

// --- Copied from insights-generate-summary/index.ts (findCostComparisons), reduced to
// the three fields PortfolioSummaryContext consumes. ---
function findPricierThanAverage(rows: SummarySubscriptionRow[]) {
  const byKey = new Map<string, SummarySubscriptionRow[]>()
  for (const row of rows) {
    const category = getCategoryName(row)
    if (!category) continue
    const key = `${category}::${row.currency}`
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }

  const pricier: { subscriptionName: string; category: string; currency: string }[] = []
  for (const [key, group] of byKey.entries()) {
    if (group.length < 2) continue
    const [category, currency] = key.split("::")
    const average = group.reduce((sum, s) => sum + (s.monthly_equivalent ?? 0), 0) / group.length
    for (const sub of group) {
      if ((sub.monthly_equivalent ?? 0) > average) {
        pricier.push({ subscriptionName: getSubscriptionName(sub), category, currency })
      }
    }
  }
  return pricier
}

export async function handleBuildPrompt(
  supabaseAdmin: SupabaseClient,
  userId: string,
  body: { target?: unknown; subscription_id?: unknown }
): Promise<Response> {
  const target = body.target === "summary" ? "summary" : "insight"

  if (target === "insight") {
    if (typeof body.subscription_id !== "string") {
      return errorResponse(400, "DEV_001", "subscription_id is required when target is 'insight'.")
    }

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select(INSIGHT_SUBSCRIPTION_COLUMNS)
      .eq("id", body.subscription_id)
      .maybeSingle()

    const typedSub = sub as unknown as InsightSubscriptionRow | null

    // Ownership check, not just existence — a hidden route is not an access control,
    // and without this any authenticated caller could read back another user's
    // subscription name and renewal date through the returned prompt.
    if (!typedSub || typedSub.user_id !== userId) {
      return errorResponse(404, "DEV_002", "Subscription not found or not owned by this user.")
    }

    const shared = await getSharedInfo(supabaseAdmin, typedSub.id)

    const context: InsightContext = {
      subscriptionName: getSubscriptionName(typedSub),
      billingFrequency: typedSub.billing_frequency,
      nextRenewalDate: formatDate(typedSub.next_renewal_date),
      daysUntilRenewal: daysUntil(typedSub.next_renewal_date),
      lifecycleStatus: typedSub.lifecycle_status,
      isShared: shared.isShared,
      sharedMemberCount: shared.memberCount,
    }

    const prompt = buildInsightPrompt(context)
    return successResponse(
      { target, prompt, context },
      { dry_run: true, model_called: false, rows_written: 0 }
    )
  }

  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select(SUMMARY_SUBSCRIPTION_COLUMNS)
    .eq("user_id", userId)
    .neq("lifecycle_status", "archived")

  const rows = (subs ?? []) as unknown as SummarySubscriptionRow[]
  const { duplicateCategories, overlapCategories } = findDuplicateAndOverlapCategories(rows)

  const context: PortfolioSummaryContext = {
    subscriptionCount: rows.length,
    currencyTotals: computeTotalsByCurrency(rows),
    duplicateCategories,
    overlapCategories,
    pricierThanAverage: findPricierThanAverage(rows),
  }

  const prompt = buildPortfolioSummaryPrompt(context)
  return successResponse(
    { target, prompt, context },
    { dry_run: true, model_called: false, rows_written: 0 }
  )
}
