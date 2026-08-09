import { useEffect, useState } from "react"

import { useAuth } from "@/features/auth/AuthContext"
import { supabase } from "@/lib/supabase"

export interface DevSubscriptionOption {
  id: string
  name: string
}

// Three panels need the same "pick one of my subscriptions" list, so it is fetched once
// here rather than three times. Read through the normal client (Path A) -- RLS already
// scopes subscriptions to the caller, so no Edge Function is warranted just to list them.
export function useOwnSubscriptions() {
  const { appUser } = useAuth()
  const [options, setOptions] = useState<DevSubscriptionOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!appUser) return
    let cancelled = false

    supabase
      .from("subscriptions")
      .select("id, custom_name, subscription_catalog(name)")
      .eq("user_id", appUser.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data ?? []) as unknown as {
          id: string
          custom_name: string | null
          subscription_catalog: { name: string } | null
        }[]
        setOptions(
          rows.map((row) => ({
            id: row.id,
            name: row.subscription_catalog?.name ?? row.custom_name ?? "Untitled subscription",
          }))
        )
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [appUser])

  return { options, loading }
}
