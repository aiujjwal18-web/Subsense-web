import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import {
  computeNextRenewalDate,
  formatDateOnly,
  type BillingFrequency,
} from "@/features/subscriptions/subscription-utils"

interface MarkPaidDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  id: string
  name: string
  nextRenewalDate: string
  billingFrequency: BillingFrequency
  customIntervalDays?: number
  onUpdated?: () => void
}

// Card-level "Paid" quick-action per NEXT_SESSION_AGENDA item 7: picking a payment date
// recomputes next_renewal_date (forward from whichever of the current renewal date or the
// payment date is later), with a confirm step before the write, per doc 05's
// confirm-before-meaningful-data-impact rule. lifecycle_status is deliberately untouched.
//
// `name` names the subscription in the dialog's own copy (Phase 8 naming-disambiguation
// fix): C-021 Payment Request Item introduces a second, different "Mark Paid" meaning —
// "this shared member paid me back," not "I paid the provider" — so this dialog's title
// and success toast now say "Mark [subscription] as paid" rather than the bare, generic
// "Mark as paid" they used before, so the two are never visually interchangeable anywhere
// a user might see both.
//
// step/paymentDate reset to their defaults on every open, not just first mount — the call
// site remounts this component on each open/close transition via a toggling `key`, per
// React's own guidance for "reset state when X changes" (an effect that resets state in
// response to a prop is the documented anti-pattern this sidesteps).
export function MarkPaidDialog({
  open,
  onOpenChange,
  id,
  name,
  nextRenewalDate,
  billingFrequency,
  customIntervalDays,
  onUpdated,
}: MarkPaidDialogProps) {
  const [step, setStep] = useState<"pick" | "confirm">("pick")
  const [paymentDate, setPaymentDate] = useState(() => formatDateOnly(new Date()))
  const [saving, setSaving] = useState(false)

  const baseDate = paymentDate < nextRenewalDate ? nextRenewalDate : paymentDate
  const newNextRenewalDate = computeNextRenewalDate(baseDate, billingFrequency, customIntervalDays)

  async function handleConfirm() {
    setSaving(true)
    const { error } = await supabase
      .from("subscriptions")
      .update({ next_renewal_date: newNextRenewalDate })
      .eq("id", id)
    setSaving(false)

    if (error) {
      toast.error("Couldn't update the renewal date. Please try again.")
      return
    }
    toast.success(`${name} marked as paid`)
    onOpenChange(false)
    onUpdated?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {step === "pick" ? (
          <>
            <DialogHeader>
              <DialogTitle>Mark {name} as paid</DialogTitle>
              <DialogDescription>When was this payment made?</DialogDescription>
            </DialogHeader>
            <div>
              <Label htmlFor="payment-date">Payment date</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                className="mt-1.5"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => setStep("confirm")}>
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm new renewal date</DialogTitle>
              <DialogDescription>
                The next renewal date will change to{" "}
                {new Date(newNextRenewalDate).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                .
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("pick")} disabled={saving}>
                Back
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={saving}>
                {saving ? "Saving…" : "Confirm"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
