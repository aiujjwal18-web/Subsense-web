import { useEffect, useState } from "react"
import { Loader2, Pencil, RefreshCw } from "lucide-react"
import { Link, Navigate, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CategoryIcon } from "@/components/subscriptions/CategoryIcon"
import { AiDecisionCard } from "@/features/ai-insights/AiDecisionCard"
import { useAiInsight } from "@/features/ai-insights/useAiInsight"
import { useAuth } from "@/features/auth/AuthContext"
import { AddEditMemberForm } from "@/components/shared-subscriptions/AddEditMemberForm"
import { ConfirmDialog } from "@/components/shared-subscriptions/ConfirmDialog"
import { PaymentRequestItem } from "@/components/shared-subscriptions/PaymentRequestItem"
import { SharedMemberRow } from "@/components/shared-subscriptions/SharedMemberRow"
import { useSharedSubscription, type AddEditMemberInput } from "@/features/shared-subscriptions/useSharedSubscription"
import {
  SPLIT_METHOD_LABEL,
  getMemberDisplayName,
  type SharedMemberRow as SharedMemberRowData,
  type SplitMethod,
} from "@/features/shared-subscriptions/shared-subscription-utils"
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
  formatRenewalLabel,
  getCategoryName,
  getDisplayName,
  type BillingFrequency,
  type Currency,
  type PaymentMethod,
  type RenewalUrgency,
  type SubscriptionRow,
} from "@/features/subscriptions/subscription-utils"

type LoadState = "loading" | "notFound" | "error" | "ready"

const URGENCY_LABEL: Record<RenewalUrgency, string> = {
  normal: "Normal",
  upcoming: "Upcoming",
  critical: "Critical",
  overdue: "Overdue",
}

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
  const { appUser } = useAuth()

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

  // Called unconditionally (before the loading/notFound/error early returns below) —
  // hooks can't be called after a conditional return. useAiInsight only needs `id`,
  // not the loaded `row`, so it can run independently of the subscription fetch above.
  const aiInsight = useAiInsight(id)
  // Same reasoning applies here — the "INR" fallback only matters until `row` loads;
  // every UI path that can actually call createShare() only renders once `row` (and
  // therefore its real currency) is already available.
  const sharedSub = useSharedSubscription(id, row?.currency ?? "INR")

  const [shareSetupOpen, setShareSetupOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<SharedMemberRowData | null>(null)
  const [removingMember, setRemovingMember] = useState<SharedMemberRowData | null>(null)

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
      toast.error("Couldn't save your changes. Please try again.")
      return
    }

    toast.success("Changes saved")
    setRow(data as unknown as SubscriptionRow)
    setEditing(false)
  }

  async function handleArchive() {
    if (!row) return
    setArchiving(true)
    // .select().maybeSingle() (not a bare .update()) so a write RLS silently blocks —
    // e.g. a non-owner whose UPDATE's WHERE clause matches zero rows, no Postgres error —
    // is distinguishable from a real success. RLS doesn't throw on a blocked UPDATE, it
    // just matches nothing; checking {error} alone would report "Archived" regardless.
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ lifecycle_status: "archived", archived_at: new Date().toISOString() })
      .eq("id", row.id)
      .select("id")
      .maybeSingle()
    setArchiving(false)

    if (error || !data) {
      setFormError("Couldn't archive this subscription. Please try again.")
      toast.error("Couldn't archive this subscription. Please try again.")
      return
    }
    toast.success("Subscription archived")
    navigate("/subscriptions")
  }

  async function handleCreateShare(splitMethod: SplitMethod) {
    const ok = await sharedSub.createShare(splitMethod)
    if (ok) setShareSetupOpen(false)
  }

  async function handleAddMemberSubmit(input: AddEditMemberInput) {
    return sharedSub.addMember(input)
  }

  async function handleEditMemberSubmit(input: AddEditMemberInput) {
    if (!editingMember) return false
    return sharedSub.editMember(editingMember.id, input)
  }

  async function handleConfirmRemoveMember() {
    if (!removingMember) return
    const ok = await sharedSub.removeMember(removingMember.id)
    if (ok) setRemovingMember(null)
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
          {/* Announced: the page swaps from loading straight to this with no focus
              change, so it is otherwise silent to a screen reader (WCAG 4.1.3). */}
          <p role="alert" className="text-sm text-muted-foreground">
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
  const category = getCategoryName(row)
  const urgency = computeRenewalUrgency(row.next_renewal_date, row.lifecycle_status)
  const isArchived = row.lifecycle_status === "archived"
  // subscriptions_select_shared_member (file 34) made this page reachable by a linked
  // member for the first time — it was previously owner-only by RLS. This page was
  // designed as an owner-only surface (doc 10: a linked member's real access point is
  // SharedSubscriptionsPage, not this page) — so rather than rendering a stripped-down
  // read-only version for a non-owner, redirect them away entirely once ownership is known
  // (below). Data can be read under the new RLS grant; that's a separate question from
  // which page should render it.
  const isOwner = appUser != null && row.user_id === appUser.id

  if (!isOwner) {
    return <Navigate to="/shared" replace />
  }

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link to="/subscriptions" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Subscriptions
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <CategoryIcon category={category} className="size-12" iconClassName="size-6" />
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
          {isOwner && !editing && !isArchived && (
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
            {formatRenewalLabel(row.next_renewal_date, urgency)}
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

              {formError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{formError}</p>}

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
          ) : isOwner ? (
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
                {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
                <DialogFooter>
                  <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                  <Button type="button" variant="destructive" onClick={handleArchive} disabled={archiving}>
                    {archiving ? "Archiving…" : "Archive"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </section>

        {/* AI Insight */}
        <section className="mt-6">
          <div className="flex items-center justify-between gap-3 px-1 pb-2">
            <h2 className="font-heading text-sm font-semibold text-foreground">AI Insight</h2>
            {aiInsight.state !== "suppressed-archived" && aiInsight.state !== "suppressed-paused" && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="gap-1"
                onClick={aiInsight.regenerate}
                disabled={aiInsight.state === "loading" || aiInsight.state === "regenerating"}
              >
                {aiInsight.state === "regenerating" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                Regenerate
              </Button>
            )}
          </div>
          <AiDecisionCard
            subscriptionId={row.id}
            subscriptionName={displayName}
            category={category}
            cost={row.cost}
            currency={row.currency}
            nextRenewalDate={row.next_renewal_date}
            renewalUrgency={urgency}
            state={aiInsight.state}
            insight={aiInsight.insight}
            onRegenerate={aiInsight.regenerate}
          />
        </section>

        {/* Shared Members — DEC-080: "Manage sharing" is the single entry point for both
            first-time setup and ongoing management, not a separate flow. */}
        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-sm font-semibold text-foreground">Shared Members</h2>
            {sharedSub.state === "ready" && sharedSub.isOwner && (
              <Button type="button" variant="outline" size="sm" onClick={() => setAddMemberOpen(true)}>
                Add member
              </Button>
            )}
          </div>

          {sharedSub.state === "loading" && (
            <p role="status" className="mt-2 text-sm text-muted-foreground">Loading…</p>
          )}

          {sharedSub.state === "error" && (
            <p role="alert" className="mt-2 text-sm text-muted-foreground">Couldn't load sharing details. Please try again.</p>
          )}

          {sharedSub.state === "notShared" && (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                This subscription isn't shared with anyone yet.
              </p>
              <Button type="button" size="sm" className="mt-3" onClick={() => setShareSetupOpen(true)}>
                Share this subscription
              </Button>
            </>
          )}

          {sharedSub.state === "ready" && sharedSub.sharedSubscription && (
            <>
              {sharedSub.members.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No members yet — add one to start splitting this cost.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {sharedSub.members.map((member) => (
                    <SharedMemberRow
                      key={member.id}
                      member={member}
                      splitMethod={sharedSub.sharedSubscription!.split_method}
                      isOwner={sharedSub.isOwner}
                      onEdit={() => setEditingMember(member)}
                      onRemove={() => setRemovingMember(member)}
                    />
                  ))}
                </div>
              )}

              {sharedSub.paymentRequests.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Payment requests
                  </h3>
                  <div className="mt-2 space-y-2">
                    {sharedSub.paymentRequests.map((request) => (
                      <PaymentRequestItem
                        key={request.id}
                        request={request}
                        memberName={getMemberDisplayName(
                          request.shared_members ?? { display_name: null, email: null }
                        )}
                        isOwner={sharedSub.isOwner}
                        isSelf={false}
                        onOwnerMarkPaid={() => sharedSub.ownerMarkPaid(request.id)}
                        onReportPaid={() => sharedSub.reportPaid(request.id)}
                        onSendReminder={() => sharedSub.sendReminder(request.id)}
                        mutating={sharedSub.mutating}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Reminder Context — later phase */}
        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">Reminder Context</h2>
          <p className="mt-2 text-sm text-muted-foreground">Coming in a later phase.</p>
        </section>
      </div>

      {/* Share setup — split-method picker, first-time only */}
      <Dialog open={shareSetupOpen} onOpenChange={setShareSetupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share {displayName}</DialogTitle>
            <DialogDescription>
              Pick how the cost splits. You can add members right after.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {(Object.entries(SPLIT_METHOD_LABEL) as [SplitMethod, string][]).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant="outline"
                className="justify-start"
                disabled={sharedSub.mutating}
                onClick={() => handleCreateShare(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {sharedSub.sharedSubscription && (
        <AddEditMemberForm
          key={addMemberOpen ? "add-open" : "add-closed"}
          open={addMemberOpen}
          onOpenChange={setAddMemberOpen}
          mode="add"
          splitMethod={sharedSub.sharedSubscription.split_method}
          currency={sharedSub.sharedSubscription.currency}
          onSubmit={handleAddMemberSubmit}
          submitting={sharedSub.mutating}
        />
      )}

      {sharedSub.sharedSubscription && editingMember && (
        <AddEditMemberForm
          key={editingMember.id}
          open={editingMember != null}
          onOpenChange={(open) => {
            if (!open) setEditingMember(null)
          }}
          mode="edit"
          splitMethod={sharedSub.sharedSubscription.split_method}
          currency={sharedSub.sharedSubscription.currency}
          initialValues={{
            displayName: editingMember.display_name ?? "",
            email: editingMember.email ?? "",
            amountOwed: editingMember.amount_owed,
          }}
          onSubmit={handleEditMemberSubmit}
          submitting={sharedSub.mutating}
        />
      )}

      <ConfirmDialog
        open={removingMember != null}
        onOpenChange={(open) => {
          if (!open) setRemovingMember(null)
        }}
        title={`Remove ${removingMember ? getMemberDisplayName(removingMember) : "this member"} from the split?`}
        description="Their payment history stays visible below — this only stops new payment requests from going to them."
        confirmLabel="Remove"
        confirmVariant="destructive"
        confirming={sharedSub.mutating}
        onConfirm={handleConfirmRemoveMember}
      />
    </div>
  )
}
