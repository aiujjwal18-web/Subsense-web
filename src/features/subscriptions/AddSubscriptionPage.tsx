import { useEffect, useState } from "react"
import { CreditCard, Search, X } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/features/auth/AuthContext"
import { supabase } from "@/lib/supabase"
import {
  BILLING_FREQUENCY_LABEL,
  CURRENCY_LABEL,
  PAYMENT_METHOD_LABEL,
  estimateAnnualCost,
  formatMoney,
  type BillingFrequency,
  type Currency,
  type PaymentMethod,
} from "@/features/subscriptions/subscription-utils"

interface CatalogResult {
  id: string
  name: string
  logo_url: string | null
}

export function AddSubscriptionPage() {
  const navigate = useNavigate()
  const { appUser } = useAuth()

  const [mode, setMode] = useState<"catalog" | "custom">("catalog")

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CatalogResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogResult | null>(null)

  const [customName, setCustomName] = useState("")

  const [cost, setCost] = useState("")
  const [currency, setCurrency] = useState<Currency>("INR")
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>("monthly")
  const [customIntervalDays, setCustomIntervalDays] = useState("")
  const [nextRenewalDate, setNextRenewalDate] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("manual")
  const [paymentReferenceNote, setPaymentReferenceNote] = useState("")

  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode !== "catalog" || selectedCatalog) {
      return
    }
    const trimmed = query.trim()
    if (!trimmed) {
      return
    }
    const handle = setTimeout(() => {
      supabase
        .from("subscription_catalog")
        .select("id, name, logo_url")
        .ilike("name", `%${trimmed}%`)
        .order("name")
        .limit(8)
        .then(({ data, error }) => {
          setSearching(false)
          if (!error && data) setResults(data)
        })
    }, 250)
    return () => clearTimeout(handle)
  }, [query, mode, selectedCatalog])

  const costNumber = Number(cost)
  const customIntervalDaysNumber = Number(customIntervalDays)
  const annualEstimate =
    Number.isFinite(costNumber) && costNumber > 0
      ? estimateAnnualCost(
          costNumber,
          billingFrequency,
          billingFrequency === "custom" ? customIntervalDaysNumber : undefined
        )
      : 0

  function validate(): string | null {
    if (mode === "catalog" && !selectedCatalog) {
      return "Select a subscription from the catalog, or switch to Custom."
    }
    if (mode === "custom" && !customName.trim()) {
      return "Enter a name for this subscription."
    }
    if (!cost || !Number.isFinite(costNumber) || costNumber <= 0) {
      return "Enter a valid cost greater than 0."
    }
    if (!nextRenewalDate) {
      return "Choose a next renewal date."
    }
    if (billingFrequency === "custom") {
      if (!customIntervalDays || !Number.isFinite(customIntervalDaysNumber) || customIntervalDaysNumber <= 0) {
        return "Enter a valid custom interval in days."
      }
    }
    return null
  }

  async function handleSave() {
    const validationError = validate()
    if (validationError) {
      setFormError(validationError)
      return
    }
    if (!appUser) {
      setFormError("Your account is still setting up — please try again in a moment.")
      return
    }

    setSaving(true)
    setFormError(null)

    const { data, error } = await supabase
      .from("subscriptions")
      .insert({
        user_id: appUser.id,
        catalog_id: mode === "catalog" ? selectedCatalog!.id : null,
        custom_name: mode === "custom" ? customName.trim() : null,
        cost: costNumber,
        currency,
        billing_frequency: billingFrequency,
        custom_interval_days: billingFrequency === "custom" ? customIntervalDaysNumber : null,
        next_renewal_date: nextRenewalDate,
        payment_method: paymentMethod,
        payment_reference_note: paymentReferenceNote.trim() || null,
      })
      .select("id")
      .single()

    setSaving(false)

    if (error || !data) {
      setFormError("Couldn't save this subscription. Please try again.")
      return
    }

    navigate(`/subscriptions/${data.id}`)
  }

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Add Subscription
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find it in the catalog, or add it manually.
        </p>

        <div className="mt-8 rounded-lg border border-border bg-card p-6">
          <Tabs
            value={mode}
            onValueChange={(value) => {
              setMode(value as "catalog" | "custom")
              setFormError(null)
            }}
          >
            <TabsList>
              <TabsTrigger value="catalog">From Catalog</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>

            <TabsContent value="catalog" className="mt-4">
              {selectedCatalog ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  {selectedCatalog.logo_url ? (
                    <img
                      src={selectedCatalog.logo_url}
                      alt=""
                      className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                      <CreditCard className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {selectedCatalog.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setSelectedCatalog(null)
                      setQuery("")
                    }}
                    aria-label="Clear selection"
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => {
                      const value = event.target.value
                      setQuery(value)
                      if (value.trim()) setSearching(true)
                    }}
                    placeholder="Search subscriptions (e.g. Netflix)"
                    className="pl-8"
                  />
                  {searching && (
                    <p className="mt-2 text-xs text-muted-foreground">Searching…</p>
                  )}
                  {!searching && query.trim() && results.length > 0 && (
                    <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                      {results.map((result) => (
                        <li key={result.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedCatalog(result)}
                            className="flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-muted"
                          >
                            {result.logo_url ? (
                              <img
                                src={result.logo_url}
                                alt=""
                                className="size-8 shrink-0 rounded-full object-cover ring-1 ring-border"
                              />
                            ) : (
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                                <CreditCard className="size-4 text-muted-foreground" />
                              </div>
                            )}
                            <span className="truncate text-sm text-foreground">
                              {result.name}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!searching && query.trim() && results.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No matches — try Custom instead.
                    </p>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="custom" className="mt-4">
              <Label htmlFor="custom-name">Name</Label>
              <Input
                id="custom-name"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="e.g. Neighborhood Gym"
                className="mt-1.5"
              />
            </TabsContent>
          </Tabs>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cost">Cost</Label>
              <Input
                id="cost"
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                placeholder="0.00"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={currency}
                onValueChange={(value) => setCurrency(value as Currency)}
              >
                <SelectTrigger id="currency" className="mt-1.5">
                  <SelectValue>{(value: Currency) => CURRENCY_LABEL[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CURRENCY_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="billing-frequency">Billing Frequency</Label>
              <Select
                value={billingFrequency}
                onValueChange={(value) => setBillingFrequency(value as BillingFrequency)}
              >
                <SelectTrigger id="billing-frequency" className="mt-1.5">
                  <SelectValue>
                    {(value: BillingFrequency) => BILLING_FREQUENCY_LABEL[value]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BILLING_FREQUENCY_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {billingFrequency === "custom" && (
              <div>
                <Label htmlFor="custom-interval-days">Repeats every (days)</Label>
                <Input
                  id="custom-interval-days"
                  type="number"
                  min="1"
                  step="1"
                  value={customIntervalDays}
                  onChange={(event) => setCustomIntervalDays(event.target.value)}
                  placeholder="45"
                  className="mt-1.5"
                />
              </div>
            )}

            <div>
              <Label htmlFor="next-renewal-date">Next Renewal Date</Label>
              <Input
                id="next-renewal-date"
                type="date"
                value={nextRenewalDate}
                onChange={(event) => setNextRenewalDate(event.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
              >
                <SelectTrigger id="payment-method" className="mt-1.5">
                  <SelectValue>
                    {(value: PaymentMethod) => PAYMENT_METHOD_LABEL[value]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="payment-reference-note">Payment Note (optional)</Label>
              <Input
                id="payment-reference-note"
                value={paymentReferenceNote}
                onChange={(event) => setPaymentReferenceNote(event.target.value)}
                placeholder="e.g. Family plan via Dad's card"
                className="mt-1.5"
              />
            </div>
          </div>

          {annualEstimate > 0 && (
            <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">Estimated annual cost</p>
              <p className="mt-0.5 font-heading text-lg font-semibold text-foreground">
                ≈ {formatMoney(annualEstimate, currency)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  /year (estimate)
                </span>
              </p>
            </div>
          )}

          {formError && (
            <p className="mt-4 text-sm text-destructive">{formError}</p>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/subscriptions")}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Subscription"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
