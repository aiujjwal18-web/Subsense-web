import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { supabase } from "@/lib/supabase"
import { shouldRegenerateInsight, type CachedInsightRow, type FinancialImpact } from "./ai-insight-utils"

export type AiInsightState =
  | "loading"
  | "ready"
  | "unavailable"
  | "regenerating"
  | "suppressed-archived"
  | "suppressed-paused"

export interface AiInsight {
  recommendation: string
  reason: string
  financial_impact: FinancialImpact
}

export interface UseAiInsightResult {
  insight: AiInsight | null
  state: AiInsightState
  regenerate: () => void
}

// Single-subscription insight for SubscriptionDetailsPage. Fetches its own
// subscriptions.updated_at (SUBSCRIPTION_SELECT_COLUMNS doesn't include it, and isn't
// widened just for this one caller — see ai-insight-utils.ts's comment) rather than
// requiring the page to supply it.
export function useAiInsight(subscriptionId: string): UseAiInsightResult {
  const [insight, setInsight] = useState<AiInsight | null>(null)
  const [state, setState] = useState<AiInsightState>("loading")
  const requestIdRef = useRef(0)
  // Frontend-only guard, no backend change: workspace mode already excludes both
  // archived and paused subscriptions via its own query/filter (pickTopUrgent skips
  // paused, DecisionWorkspacePage's fetch skips archived); single mode had no
  // equivalent for either. Extends DEC-064's existing paused-deprioritization pattern
  // (already applied to urgency, Upcoming Renewals, Recommended Reviews) to this
  // surface. Blocks both the silent auto-trigger and manual Regenerate — no OpenAI
  // call is made for either state, and the card shows a static, state-specific
  // message instead of the generic "unavailable" retry state, since there's nothing
  // to retry until the subscription's own lifecycle status changes.
  const suppressedRef = useRef<"archived" | "paused" | null>(null)

  async function generate(mode: "auto" | "manual") {
    if (suppressedRef.current) {
      setState(suppressedRef.current === "archived" ? "suppressed-archived" : "suppressed-paused")
      return
    }

    const requestId = ++requestIdRef.current
    setState((prev) => (mode === "auto" && prev === "loading" ? "loading" : "regenerating"))

    const { data, error } = await supabase.functions.invoke("ai-generate-insight", {
      body: { subscription_id: subscriptionId },
    })

    if (requestIdRef.current !== requestId) return // superseded by a newer call

    if (error || !data?.success) {
      setState("unavailable")
      if (mode === "manual") {
        toast.error("Couldn't generate an insight right now. Please try again.")
      }
      return
    }

    setInsight(data.data as AiInsight)
    setState("ready")
  }

  useEffect(() => {
    const requestId = ++requestIdRef.current

    async function load() {
      setState("loading")
      setInsight(null)

      const [{ data: cachedData, error: cachedError }, { data: subData, error: subError }] = await Promise.all([
        supabase
          .from("ai_recommendations")
          .select("id, subscription_id, recommendation_text, reason_text, financial_impact, model_version, generated_at, created_at")
          .eq("subscription_id", subscriptionId)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("subscriptions").select("updated_at, lifecycle_status").eq("id", subscriptionId).single(),
      ])

      if (requestIdRef.current !== requestId) return

      const lifecycleStatus = subError || !subData ? null : (subData.lifecycle_status as string)
      const suppressed = lifecycleStatus === "archived" ? "archived" : lifecycleStatus === "paused" ? "paused" : null
      suppressedRef.current = suppressed

      // TEMP DEBUG — remove after diagnosing the pause/resume cooldown bug.
      console.log("[useAiInsight] load() top", {
        subscriptionId,
        requestId,
        lifecycleStatus,
        suppressed,
        subError,
        at: new Date().toISOString(),
      })

      if (suppressed) {
        setInsight(null)
        setState(suppressed === "archived" ? "suppressed-archived" : "suppressed-paused")
        return
      }

      const cachedRow = (cachedError ? null : (cachedData as CachedInsightRow | null)) ?? null
      const subscriptionUpdatedAt = subError || !subData ? new Date(0).toISOString() : (subData.updated_at as string)

      if (cachedRow) {
        setInsight({
          recommendation: cachedRow.recommendation_text,
          reason: cachedRow.reason_text ?? "",
          financial_impact: cachedRow.financial_impact,
        })
        setState("ready")
      }

      const shouldRegenerate = shouldRegenerateInsight(cachedRow, subscriptionUpdatedAt)

      // TEMP DEBUG — remove after diagnosing the pause/resume cooldown bug.
      console.log("[useAiInsight] shouldRegenerateInsight call site", {
        subscriptionId,
        requestId,
        cachedRow,
        subscriptionUpdatedAt,
        nowMs: Date.now(),
        nowIso: new Date().toISOString(),
        generatedAtMs: cachedRow ? new Date(cachedRow.generated_at).getTime() : null,
        msSinceGenerated: cachedRow ? Date.now() - new Date(cachedRow.generated_at).getTime() : null,
        shouldRegenerate,
      })

      if (shouldRegenerate) {
        await generate("auto")
      }
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionId])

  return {
    insight,
    state,
    regenerate: () => {
      generate("manual")
    },
  }
}
