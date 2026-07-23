import { useEffect, useState } from "react"
import { CreditCard, Pencil } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import {
  BILLING_FREQUENCY_LABEL,
  CURRENCY_LABEL,
  LIFECYCLE_LABEL,
  PAYMENT_METHOD_LABEL,
  SUBSCRIPTION_SELECT_COLUMNS,
  computeRenewalUrgency,
  formatMoney,
  getDisplayName,
  getLogoUrl,
  type BillingFrequency,
  type Currency,
  type PaymentMethod,
  type SubscriptionRow,
} from "@/features/subscriptions/subscription-utils"

type LoadState = "loading" | "notFound" | "error" | "ready"

const URGENCY_LABEL = { normal: "Normal", upcoming: "Upcoming", critical: "Critical" } as const

export function SubscriptionDetailsPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  // Keying by id makes React remount (and reset all local state, including
  // loadState back to "loading") when navigating between two different
  // subscriptions, instead of manually resetting state inside the effect.
  return <SubscriptionDetailsContent key={id} id={id} />
}

function SubscriptionDetailsContent({ id }: { id: string }) {
  const navigate = useNavigate()

  const [row, setRow] = useState<SubscriptionRow | null>(null)
  const [loadState, setLoadState] = useState<LoadState>("loading")

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [cost, setCost] = useState("")
  const [currency, setCurrency] = useState<Currency>("INR")
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>("monthly")
  const [customIntervalDays, setCustomIntervalDays] = useState("")
  const [nextRenewalDate, setNextRenewalDate] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("manual")
  const [paymentReferenceNote, setPaymentReferenceNote] = useState("")

  useEffect(() => {
    let cancelled = false

    supabase
      .from("subscriptions")
      .select(SUBSCRIPTION_SELECT_COLUMNS)
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setLoadState("error")
          return
        }
        if (!data) {
          setLoadState("notFound")
          return
        }
        setRow(data as unknown as SubscriptionRow)
        setLoadState("ready")
      })

    return () => {
      cancelled = true
    }
  }, [id])

  function startEditing() {
    if (!row) return
    setCost(String(row.cost))
    setCurrency(row.currency)
    setBillingFrequency(row.billing_frequency)
    setCustomIntervalDays(row.custom_interval_days ? String(row.custom_interval_days) : "")
    setNextRenewalDate(row.next_renewal_date)
    setPaymentMethod(row.payment_method)
    setPaymentReferenceNote(row.payment_reference_note ?? "")
    setFormError(null)
    setEditing(true)
  }

  async function handleSaveEdit() {
    if (!row) return
    const costNumber = Number(cost)
    const customIntervalDaysNumber = Number(customIntervalDays)

    if (!cost || !Number.isFinite(costNumber) || costNumber <= 0) {
      setFormError("Enter a valid cost greater than 0.")
      return
    }
    if (!nextRenewalDate) {
      setFormError("Choose a next renewal date.")
      return
    }
    if (
      billingFrequency === "custom" &&
      (!customIntervalDays || !Number.isFinite(customIntervalDaysNumber) || customIntervalDaysNumber <= 0)
    ) {
      setFormError("Enter a valid custom interval in days.")
      return
    }

    setSaving(true)
    setFormError(null)

    const { data, error } = await supabase
      .from("subscriptions")
      .update({
        cost: costNumber,
        currency,
        billing_frequency: billingFrequency,
        custom_interval_days: billingFrequency === "custom" ? customIntervalDaysNumber : null,
        next_renewal_date: nextRenewalDate,
        payment_method: paymentMethod,
        payment_reference_note: paymentReferenceNote.trim() || null,
      })
      .eq("id", row.id)
      .select(SUBSCRIPTION_SELECT_COLUMNS)
      .maybeSingle()

    setSaving(false)

    if (error || !data) {
      setFormError("Couldn't save your changes. Please try again.")
      return
    }

    setRow(data as unknown as SubscriptionRow)
    setEditing(false)
  }

  async function handleArchive() {
    if (!row) return
    setArchiving(true)
    const { error } = await supabase
      .from("subscriptions")
      .update({ lifecycle_status: "archived", archived_at: new Date().toISOString() })
      .eq("id", row.id)
    setArchiving(false)

    if (error) {
      setFormError("Couldn't archive this subscription. Please try again.")
      return
    }
    navigate("/subscriptions")
  }

  if (loadState === "loading") {
    return (
      <div className="px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm text-muted-foreground">Loading subscription…</p>
        </div>
      </div>
    )
  }

  if (loadState === "notFound" || loadState === "error") {
    return (
      <div className="px-6 py-12">
        <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            {loadState === "notFound"
              ? "This subscription doesn't exist or you don't have access to it."
              : "Couldn't load this subscription. Please try again."}
          </p>
          <Link to="/subscriptions" className="mt-4 inline-block text-sm text-primary hover:underline">
            Back to Subscriptions
          </Link>
        </div>
      </div>
    )
  }

  if (!row) return null

  const displayName = getDisplayName(row)
  const logoUrl = getLogoUrl(row)
  const urgency = computeRenewalUrgency(row.next_renewal_date)
  const isArchived = row.lifecycle_status === "archived"

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link to="/subscriptions" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Subscriptions
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="size-12 shrink-0 rounded-full bg-muted object-contain ring-1 ring-border" />
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                <CreditCard className="size-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <h1 className="font-heading text-2xl font-semibold text-foreground">{displayName}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {BILLING_FREQUENCY_LABEL[row.billing_frequency]}
                {row.billing_frequency === "custom" && row.custom_interval_days
                  ? ` (every ${row.custom_interval_days} days)`
                  : ""}
              </p>
            </div>
          </div>
          {!editing && !isArchived && (
            <Button type="button" variant="outline" size="sm" onClick={startEditing} className="gap-1.5">
              <Pencil className="size-3.5" />
              Edit
            </Button>
          )}
        </div>

        {/* Overview */}
        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">Overview</h2>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{LIFECYCLE_LABEL[row.lifecycle_status]}</Badge>
            {!isArchived && <Badge variant="outline">{URGENCY_LABEL[urgency]}</Badge>}
          </div>
          <p className="mt-4 font-heading text-2xl font-semibold text-foreground">
            {formatMoney(row.cost, row.currency)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Next renewal: {new Date(row.next_renewal_date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </section>

        {/* Billing */}
        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">Billing</h2>

          {!editing ? (
            <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Currency</dt>
                <dd className="mt-0.5 text-foreground">{CURRENCY_LABEL[row.currency]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Payment method</dt>
                <dd className="mt-0.5 text-foreground">{PAYMENT_METHOD_LABEL[row.payment_method]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monthly equivalent</dt>
                <dd className="mt-0.5 text-foreground">
                  {row.monthly_equivalent != null ? formatMoney(row.monthly_equivalent, row.currency) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Annual equivalent</dt>
                <dd className="mt-0.5 text-foreground">
                  {row.annual_equivalent != null ? formatMoney(row.annual_equivalent, row.currency) : "—"}
                </dd>
              </div>
              {row.payment_reference_note && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Note</dt>
                  <dd className="mt-0.5 text-foreground">{row.payment_reference_note}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-cost">Cost</Label>
                <Input
                  id="edit-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="edit-currency">Currency</Label>
                <Select
                  value={currency}
                  onValueChange={(value) => setCurrency(value as Currency)}
                >
                  <SelectTrigger id="edit-currency" className="mt-1.5">
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
                <Label htmlFor="edit-billing-frequency">Billing Frequency</Label>
                <Select
                  value={billingFrequency}
                  onValueChange={(value) => setBillingFrequency(value as BillingFrequency)}
                >
                  <SelectTrigger id="edit-billing-frequency" className="mt-1.5">
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
                  <Label htmlFor="edit-custom-interval-days">Repeats every (days)</Label>
                  <Input
                    id="edit-custom-interval-days"
                    type="number"
                    min="1"
                    step="1"
                    value={customIntervalDays}
                    onChange={(event) => setCustomIntervalDays(event.target.value)}
                    className="mt-1.5"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="edit-next-renewal-date">Next Renewal Date</Label>
                <Input
                  id="edit-next-renewal-date"
                  type="date"
                  value={nextRenewalDate}
                  onChange={(event) => setNextRenewalDate(event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="edit-payment-method">Payment Method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                >
                  <SelectTrigger id="edit-payment-method" className="mt-1.5">
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
                <Label htmlFor="edit-payment-reference-note">Payment Note (optional)</Label>
                <Input
                  id="edit-payment-reference-note"
                  value={paymentReferenceNote}
                  onChange={(event) => setPaymentReferenceNote(event.target.value)}
                  className="mt-1.5"
                />
              </div>

              {formError && <p className="text-sm text-destructive sm:col-span-2">{formError}</p>}

              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(false)
                    setFormError(null)
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Lifecycle */}
        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">Lifecycle Status</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Current status: <span className="text-foreground">{LIFECYCLE_LABEL[row.lifecycle_status]}</span>
          </p>
          {isArchived ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Archived {row.archived_at ? new Date(row.archived_at).toLocaleDateString() : ""}
            </p>
          ) : (
            <Dialog>
              <DialogTrigger
                render={
                  <Button type="button" variant="destructive" size="sm" className="mt-3" />
                }
              >
                Archive subscription
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Archive this subscription?</DialogTitle>
                  <DialogDescription>
                    {displayName} will be removed from your active subscriptions. Its history is kept, not
                    deleted.
                  </DialogDescription>
                </DialogHeader>
                {formError && <p className="text-sm text-destructive">{formError}</p>}
                <DialogFooter>
                  <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                  <Button type="button" variant="destructive" onClick={handleArchive} disabled={archiving}>
                    {archiving ? "Archiving…" : "Archive"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </section>

        {/* Placeholders — later phases */}
        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">AI Insight</h2>
          <p className="mt-2 text-sm text-muted-foreground">Coming in a later phase.</p>
        </section>
        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">Shared Members</h2>
          <p className="mt-2 text-sm text-muted-foreground">Coming in a later phase.</p>
        </section>
        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">Reminder Context</h2>
          <p className="mt-2 text-sm text-muted-foreground">Coming in a later phase.</p>
        </section>
      </div>
    </div>
  )
}
