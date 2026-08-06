import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts"
import { requireAuthenticatedUser } from "../_shared/require-user.ts"
import { errorResponse, handleCorsPreflight, successResponse } from "../_shared/http.ts"
import { generateInsightText } from "../_shared/openai-client.ts"
import { buildPortfolioSummaryPrompt, type PortfolioSummaryContext } from "../_shared/insight-summary-prompt.ts"

interface SubscriptionRow {
  id: string
  custom_name: string | null
  cost: number
  currency: string
  monthly_equivalent: number
  annual_equivalent: number
  catalog_id: string | null
  subscription_catalog: { name: string; category: { name: string } | null } | null
}

interface CurrencyTotal {
  currency: string
  monthly: number
  annual: number
}

interface DuplicateGroup {
  type: "exact" | "category_overlap"
  category: string
  subscriptions: { id: string; name: string; cost: number; currency: string }[]
  combined_monthly: number
}

interface LowerCostAlternative {
  subscription_id: string
  subscription_name: string
  category: string
  currency: string
  monthly_cost: number
  category_average_monthly: number
}

const SUBSCRIPTION_COLUMNS =
  "id, custom_name, cost, currency, monthly_equivalent, annual_equivalent, catalog_id, subscription_catalog(name, category:subscription_categories(name))"

function getSubscriptionName(sub: SubscriptionRow): string {
  return sub.subscription_catalog?.name ?? sub.custom_name ?? "Untitled subscription"
}

function getCategoryName(sub: SubscriptionRow): string | null {
  return sub.subscription_catalog?.category?.name ?? null
}

// Deno-side port of src/features/subscriptions/subscription-utils.ts's
// computeTotalsByCurrency — no shared package exists between Vite and Deno today, same
// cross-boundary duplication pattern as TOP_URGENT_LIMIT/WORKSPACE_BATCH_LIMIT elsewhere.
function computeTotalsByCurrency(rows: SubscriptionRow[]): CurrencyTotal[] {
  const map = new Map<string, { monthly: number; annual: number }>()
  for (const row of rows) {
    const entry = map.get(row.currency) ?? { monthly: 0, annual: 0 }
    entry.monthly += row.monthly_equivalent ?? 0
    entry.annual += row.annual_equivalent ?? 0
    map.set(row.currency, entry)
  }
  return Array.from(map.entries()).map(([currency, totals]) => ({ currency, ...totals }))
}

// Both duplicate/overlap groups and the lower-cost-alternative average are grouped by
// currency alongside the grouping key — combining monthly figures across currencies
// would produce a meaningless number, same rule computeTotalsByCurrency itself follows.
function findDuplicateGroups(rows: SubscriptionRow[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = []

  const exactByKey = new Map<string, SubscriptionRow[]>()
  for (const row of rows) {
    if (!row.catalog_id) continue
    const key = `${row.catalog_id}::${row.currency}`
    const list = exactByKey.get(key) ?? []
    list.push(row)
    exactByKey.set(key, list)
  }
  for (const group of exactByKey.values()) {
    if (group.length < 2) continue
    groups.push({
      type: "exact",
      category: getSubscriptionName(group[0]),
      subscriptions: group.map((s) => ({ id: s.id, name: getSubscriptionName(s), cost: s.cost, currency: s.currency })),
      combined_monthly: group.reduce((sum, s) => sum + (s.monthly_equivalent ?? 0), 0),
    })
  }

  const categoryByKey = new Map<string, SubscriptionRow[]>()
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
    const category = key.split("::")[0]
    groups.push({
      type: "category_overlap",
      category,
      subscriptions: group.map((s) => ({ id: s.id, name: getSubscriptionName(s), cost: s.cost, currency: s.currency })),
      combined_monthly: group.reduce((sum, s) => sum + (s.monthly_equivalent ?? 0), 0),
    })
  }

  return groups
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

// Templates the spend total directly from real numbers, one clause per currency,
// rather than asking the model to restate them — a prior version handed the model a
// semicolon-joined list of totals and trusted it to faithfully reproduce every one in
// its own prose; with 2+ currencies it would non-deterministically drop one. This
// function is the actual fix: the figures the user sees are never model-generated.
function buildSpendLeadSentence(currencyTotals: CurrencyTotal[], subscriptionCount: number): string {
  if (currencyTotals.length === 0) {
    return "You have no active subscriptions right now."
  }
  const amounts = currencyTotals.map((t) => formatMoney(t.monthly, t.currency))
  const amountsPhrase =
    amounts.length === 1
      ? amounts[0]
      : amounts.length === 2
        ? `${amounts[0]} and ${amounts[1]}`
        : `${amounts.slice(0, -1).join(", ")}, and ${amounts[amounts.length - 1]}`
  return `You're spending ${amountsPhrase} across ${subscriptionCount} active subscription${subscriptionCount === 1 ? "" : "s"} this month.`
}

// Code-level guard, not just a prompt instruction — the prompt already tells the
// model never to restate a figure, but a prompt instruction alone isn't reliable
// enough given this is the exact bug being fixed. Any digit or currency symbol in the
// model's framing text means it's restating (or worse, misstating) a number that the
// lead sentence above already states correctly — discard it rather than risk showing
// a wrong or duplicated figure.
const FIGURE_PATTERN = /[\d₹$]/
const FALLBACK_FRAMING_SENTENCE = "Here's a quick look at where your money is going."

function safeFramingSentence(modelText: string | null): string {
  if (!modelText || FIGURE_PATTERN.test(modelText)) return FALLBACK_FRAMING_SENTENCE
  return modelText
}

// No competitor-pricing data exists anywhere in this schema — inventing one would
// violate the same no-fabricated-financial-claims discipline ai-generate-insight's
// financial_impact already enforces. Real, deterministic intra-portfolio comparison
// only: flag subscriptions priced above their own category's real average.
function findLowerCostAlternatives(rows: SubscriptionRow[]): LowerCostAlternative[] {
  const byKey = new Map<string, SubscriptionRow[]>()
  for (const row of rows) {
    const category = getCategoryName(row)
    if (!category) continue
    const key = `${category}::${row.currency}`
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }

  const alternatives: LowerCostAlternative[] = []
  for (const [key, group] of byKey.entries()) {
    if (group.length < 2) continue
    const [category, currency] = key.split("::")
    const average = group.reduce((sum, s) => sum + (s.monthly_equivalent ?? 0), 0) / group.length
    for (const sub of group) {
      if ((sub.monthly_equivalent ?? 0) > average) {
        alternatives.push({
          subscription_id: sub.id,
          subscription_name: getSubscriptionName(sub),
          category,
          currency,
          monthly_cost: sub.monthly_equivalent,
          category_average_monthly: average,
        })
      }
    }
  }
  return alternatives
}

Deno.serve(async (req) => {
  const corsPreflight = handleCorsPreflight(req)
  if (corsPreflight) return corsPreflight

  const supabaseAdmin = createSupabaseAdminClient()

  const authResult = await requireAuthenticatedUser(req, supabaseAdmin)
  if (authResult instanceof Response) return authResult
  const { userId } = authResult

  // Hard gate — the real security boundary, since RLS has no premium concept and an
  // ungated query would make client-side gating purely cosmetic. Never trust a
  // client-supplied premium flag; reuses the same live entitlement check as
  // ai-generate-insight's workspace-scope gate.
  const { data: isPremium } = await supabaseAdmin.rpc("user_has_active_premium", { target_user_id: userId })
  if (!isPremium) {
    return errorResponse(403, "INS_001", "Premium required.")
  }

  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("user_id", userId)
    .neq("lifecycle_status", "archived")

  const rows = (subs ?? []) as unknown as SubscriptionRow[]

  const spendSummary = computeTotalsByCurrency(rows)
  const duplicates = findDuplicateGroups(rows)
  const lowerCostAlternatives = findLowerCostAlternatives(rows)

  const summaryContext: PortfolioSummaryContext = {
    subscriptionCount: rows.length,
    currencyTotals: spendSummary,
    duplicateCategories: [...new Set(duplicates.filter((d) => d.type === "exact").map((d) => d.category))],
    overlapCategories: [...new Set(duplicates.filter((d) => d.type === "category_overlap").map((d) => d.category))],
    pricierThanAverage: lowerCostAlternatives.map((a) => ({ subscriptionName: a.subscription_name, category: a.category, currency: a.currency })),
  }

  const summaryResult = await generateInsightText(buildPortfolioSummaryPrompt(summaryContext))
  const modelFraming = summaryResult.ok
    ? [summaryResult.recommendation, summaryResult.reason].filter(Boolean).join(" ")
    : null

  // The lead sentence (real numbers, templated) is never at risk — only the model's
  // own framing text passes through the figure guard, and falls back to a generic
  // sentence rather than the whole summary being unavailable if the model's call
  // fails or its output slips a number past the prompt instruction.
  const leadSentence = buildSpendLeadSentence(spendSummary, rows.length)
  const aiSummary = `${leadSentence} ${safeFramingSentence(modelFraming)}`.trim()

  return successResponse(
    {
      spend_summary: { by_currency: spendSummary },
      duplicates,
      lower_cost_alternatives: lowerCostAlternatives,
      ai_summary: aiSummary,
    },
    {}
  )
})
