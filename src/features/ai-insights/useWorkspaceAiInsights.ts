import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { supabase } from "@/lib/supabase"
import { computeRenewalUrgency, daysUntil, type SubscriptionRow } from "@/features/subscriptions/subscription-utils"
import {
  FREE_TIER_WORKSPACE_LIMIT,
  shouldRegenerateInsight,
  TOP_URGENT_LIMIT,
  type CachedInsightRow,
  type FinancialImpact,
} from "./ai-insight-utils"
import type { AiInsight, AiInsightState } from "./useAiInsight"

export interface WorkspaceInsightEntry {
  insight: AiInsight | null
  state: AiInsightState
}

export interface UseWorkspaceAiInsightsResult {
  candidates: SubscriptionRow[]
  // Count before the free-tier cap is applied — lets the caller distinguish "nothing
  // else was urgent" from "more existed but got capped" for an explanatory note.
  allCandidateCount: number
  entries: Map<string, WorkspaceInsightEntry>
  regenerate: () => void
}

interface BatchInsightItem {
  subscription_id: string
  recommendation: string
  reason: string
  financial_impact: FinancialImpact
}

// DEC-079: Critical or Upcoming urgency only — Overdue is deliberately excluded, its
// renewal decision point has already passed. Reuses the same sort/cap mechanics as
// DecisionWorkspacePage.tsx's own upcomingRenewals (paused excluded, sorted by
// proximity), capped at TOP_URGENT_LIMIT instead of 5 — but NOT upcomingRenewals'
// broader "!== normal" filter, which also includes Overdue.
function pickTopUrgent(rows: SubscriptionRow[]): SubscriptionRow[] {
  return rows
    .filter((row) => row.lifecycle_status !== "paused")
    .map((row) => ({
      row,
      urgency: computeRenewalUrgency(row.next_renewal_date, row.lifecycle_status),
      days: daysUntil(row.next_renewal_date),
    }))
    .filter(({ urgency }) => urgency === "critical" || urgency === "upcoming")
    .sort((a, b) => a.days - b.days)
    .slice(0, TOP_URGENT_LIMIT)
    .map(({ row }) => row)
}

// Batch variant of useAiInsight for DecisionWorkspacePage's merged "AI Insights"
// section (DEC-067 resolution). One {scope:"workspace"} call covers up to
// TOP_URGENT_LIMIT subscriptions; a single subscription's failure within the batch
// falls back to its existing cached content if any, or "unavailable" if none — it
// never fails the whole section.
export function useWorkspaceAiInsights(rows: SubscriptionRow[], isPremium: boolean): UseWorkspaceAiInsightsResult {
  const allCandidates = pickTopUrgent(rows)
  // DEC-082: free tier is capped to the single most urgent insight, no partial
  // teaser for the rest. allCandidates stays uncapped so the caller can tell
  // "nothing else was urgent" apart from "more existed but got capped".
  const candidates = isPremium ? allCandidates : allCandidates.slice(0, FREE_TIER_WORKSPACE_LIMIT)
  const candidateIds = candidates.map((row) => row.id).join(",")

  const [entries, setEntries] = useState<Map<string, WorkspaceInsightEntry>>(new Map())
  const requestIdRef = useRef(0)

  async function generate(mode: "auto" | "manual", currentCandidates: SubscriptionRow[]) {
    const requestId = ++requestIdRef.current

    setEntries((prev) => {
      const next = new Map(prev)
      for (const c of currentCandidates) {
        const existing = next.get(c.id)
        next.set(c.id, { insight: existing?.insight ?? null, state: existing?.insight ? "regenerating" : "loading" })
      }
      return next
    })

    const { data, error } = await supabase.functions.invoke("ai-generate-insight", {
      body: { scope: "workspace" },
    })

    if (requestIdRef.current !== requestId) return

    if (error || !data?.success) {
      setEntries((prev) => {
        const next = new Map(prev)
        for (const c of currentCandidates) {
          const existing = next.get(c.id)
          next.set(c.id, existing?.insight ? { insight: existing.insight, state: "ready" } : { insight: null, state: "unavailable" })
        }
        return next
      })
      if (mode === "manual") {
        toast.error("Couldn't refresh insights right now. Please try again.")
      }
      return
    }

    const returned = ((data.data.insights ?? []) as BatchInsightItem[])
    const returnedById = new Map(returned.map((item) => [item.subscription_id, item]))

    setEntries((prev) => {
      const next = new Map(prev)
      for (const c of currentCandidates) {
        const item = returnedById.get(c.id)
        if (item) {
          next.set(c.id, {
            insight: { recommendation: item.recommendation, reason: item.reason, financial_impact: item.financial_impact },
            state: "ready",
          })
          continue
        }
        const existing = next.get(c.id)
        next.set(c.id, existing?.insight ? { insight: existing.insight, state: "ready" } : { insight: null, state: "unavailable" })
      }
      return next
    })
  }

  useEffect(() => {
    const requestId = ++requestIdRef.current
    const currentCandidates = candidates

    async function load() {
      if (currentCandidates.length === 0) {
        setEntries(new Map())
        return
      }

      const ids = currentCandidates.map((c) => c.id)

      const [{ data: cachedRows }, { data: subRows }] = await Promise.all([
        supabase
          .from("ai_recommendations")
          .select("id, subscription_id, recommendation_text, reason_text, financial_impact, model_version, generated_at, created_at")
          .in("subscription_id", ids)
          .order("generated_at", { ascending: false }),
        supabase.from("subscriptions").select("id, updated_at").in("id", ids),
      ])

      if (requestIdRef.current !== requestId) return

      const latestCachedById = new Map<string, CachedInsightRow>()
      for (const row of (cachedRows ?? []) as CachedInsightRow[]) {
        if (row.subscription_id && !latestCachedById.has(row.subscription_id)) {
          latestCachedById.set(row.subscription_id, row) // already ordered desc by generated_at
        }
      }

      const updatedAtById = new Map<string, string>()
      for (const row of (subRows ?? []) as Array<{ id: string; updated_at: string }>) {
        updatedAtById.set(row.id, row.updated_at)
      }

      const nextEntries = new Map<string, WorkspaceInsightEntry>()
      let anyStale = false
      for (const c of currentCandidates) {
        const cachedRow = latestCachedById.get(c.id) ?? null
        nextEntries.set(
          c.id,
          cachedRow
            ? {
                insight: {
                  recommendation: cachedRow.recommendation_text,
                  reason: cachedRow.reason_text ?? "",
                  financial_impact: cachedRow.financial_impact,
                },
                state: "ready",
              }
            : { insight: null, state: "loading" }
        )
        if (shouldRegenerateInsight(cachedRow, updatedAtById.get(c.id) ?? new Date(0).toISOString())) {
          anyStale = true
        }
      }
      setEntries(nextEntries)

      if (anyStale) {
        await generate("auto", currentCandidates)
      }
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateIds])

  return {
    candidates,
    allCandidateCount: allCandidates.length,
    entries,
    regenerate: () => {
      generate("manual", candidates)
    },
  }
}
