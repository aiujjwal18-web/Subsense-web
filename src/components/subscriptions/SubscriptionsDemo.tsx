import { useEffect, useState } from "react"
import { motion } from "motion/react"

import {
  SubscriptionCard,
  type SubscriptionCardProps,
} from "@/components/subscriptions/SubscriptionCard"
import { supabase } from "@/lib/supabase"

interface MockSubscription extends SubscriptionCardProps {
  id: string
}

const MOCK_SUBSCRIPTIONS: MockSubscription[] = [
  {
    id: "netflix",
    name: "Netflix",
    cost: 15.49,
    currency: "USD",
    billingFrequency: "monthly",
    nextRenewalDate: "2026-08-04",
    lifecycleStatus: "active",
    renewalUrgency: "normal",
  },
  {
    id: "spotify",
    name: "Spotify Premium",
    cost: 10.99,
    currency: "USD",
    billingFrequency: "monthly",
    nextRenewalDate: "2026-07-24",
    lifecycleStatus: "active",
    renewalUrgency: "upcoming",
  },
  {
    id: "notion",
    name: "Notion Plus",
    cost: 96,
    currency: "USD",
    billingFrequency: "yearly",
    nextRenewalDate: "2026-07-22",
    lifecycleStatus: "renewal_confirmed",
    renewalUrgency: "critical",
  },
  {
    id: "adobe",
    name: "Adobe Creative Cloud",
    cost: 59.99,
    currency: "USD",
    billingFrequency: "monthly",
    nextRenewalDate: "2026-08-15",
    lifecycleStatus: "created",
    renewalUrgency: "upcoming",
  },
  {
    id: "gym",
    name: "Anytime Fitness",
    cost: 45,
    currency: "USD",
    billingFrequency: "monthly",
    nextRenewalDate: "2026-08-01",
    lifecycleStatus: "paused",
    renewalUrgency: "normal",
  },
  {
    id: "reader",
    name: "Old Reader Pro",
    cost: 5,
    currency: "USD",
    billingFrequency: "monthly",
    nextRenewalDate: "2026-01-10",
    lifecycleStatus: "cancelled",
    renewalUrgency: "normal",
  },
]

// Entrance stagger is capped so a longer list doesn't keep growing the delay indefinitely.
const MAX_STAGGERED_ITEMS = 8
const STAGGER_STEP_SECONDS = 0.06

export function SubscriptionsDemo() {
  const [subscriptions, setSubscriptions] = useState(MOCK_SUBSCRIPTIONS)

  useEffect(() => {
    let cancelled = false

    supabase
      .from("subscription_catalog")
      .select("name, logo_url, slug")
      .order("created_at", { ascending: true })
      .limit(6)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        setSubscriptions((prev) =>
          prev.map((sub, i) =>
            data[i]
              ? {
                  ...sub,
                  id: data[i].slug,
                  name: data[i].name,
                  logoUrl: data[i].logo_url ?? undefined,
                }
              : sub
          )
        )
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Subscriptions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subscriptions.length} tracked subscriptions
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subscriptions.map((subscription, index) => (
            <motion.div
              key={subscription.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                ease: "easeOut",
                delay: Math.min(index, MAX_STAGGERED_ITEMS - 1) * STAGGER_STEP_SECONDS,
              }}
            >
              <SubscriptionCard {...subscription} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
