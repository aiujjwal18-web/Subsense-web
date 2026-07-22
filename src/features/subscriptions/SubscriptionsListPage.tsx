import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Plus } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { SubscriptionCard } from "@/components/subscriptions/SubscriptionCard"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import {
  SUBSCRIPTION_SELECT_COLUMNS,
  computeRenewalUrgency,
  getDisplayName,
  getLogoUrl,
  type SubscriptionRow,
} from "@/features/subscriptions/subscription-utils"

// Entrance stagger is capped so a longer list doesn't keep growing the delay indefinitely.
const MAX_STAGGERED_ITEMS = 8
const STAGGER_STEP_SECONDS = 0.06

type LoadState = "loading" | "error" | "ready"

export function SubscriptionsListPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<SubscriptionRow[]>([])
  const [state, setState] = useState<LoadState>("loading")

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState("loading")
      const { data, error } = await supabase
        .from("subscriptions")
        .select(SUBSCRIPTION_SELECT_COLUMNS)
        .neq("lifecycle_status", "archived")
        .order("next_renewal_date", { ascending: true })

      if (cancelled) return

      if (error) {
        setState("error")
        return
      }

      setRows((data ?? []) as unknown as SubscriptionRow[])
      setState("ready")
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-foreground">
              Subscriptions
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {state === "ready"
                ? `${rows.length} tracked subscription${rows.length === 1 ? "" : "s"}`
                : "Your active subscriptions"}
            </p>
          </div>
          <Button type="button" onClick={() => navigate("/subscriptions/add")} className="gap-1.5">
            <Plus />
            Add Subscription
          </Button>
        </div>

        {state === "loading" && (
          <p className="mt-8 text-sm text-muted-foreground">Loading subscriptions…</p>
        )}

        {state === "error" && (
          <div className="mt-8 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            Couldn't load your subscriptions. Please try refreshing the page.
          </div>
        )}

        {state === "ready" && rows.length === 0 && (
          <div className="mt-8 flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              You haven't added any subscriptions yet.
            </p>
            <Button type="button" size="sm" onClick={() => navigate("/subscriptions/add")} className="gap-1.5">
              <Plus />
              Add your first subscription
            </Button>
          </div>
        )}

        {state === "ready" && rows.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row, index) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  ease: "easeOut",
                  delay: Math.min(index, MAX_STAGGERED_ITEMS - 1) * STAGGER_STEP_SECONDS,
                }}
              >
                <SubscriptionCard
                  name={getDisplayName(row)}
                  logoUrl={getLogoUrl(row)}
                  cost={row.cost}
                  currency={row.currency}
                  billingFrequency={row.billing_frequency}
                  customIntervalDays={row.custom_interval_days ?? undefined}
                  nextRenewalDate={row.next_renewal_date}
                  lifecycleStatus={row.lifecycle_status}
                  renewalUrgency={computeRenewalUrgency(row.next_renewal_date)}
                  onClick={() => navigate(`/subscriptions/${row.id}`)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
