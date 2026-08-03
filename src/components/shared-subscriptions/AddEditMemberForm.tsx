import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Currency } from "@/features/subscriptions/subscription-utils"
import { formatMoney } from "@/features/subscriptions/subscription-utils"
import type { AddEditMemberInput } from "@/features/shared-subscriptions/useSharedSubscription"
import type { SplitMethod } from "@/features/shared-subscriptions/shared-subscription-utils"

export interface AddEditMemberFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "add" | "edit"
  splitMethod: SplitMethod
  currency: Currency
  initialValues?: AddEditMemberInput
  onSubmit: (input: AddEditMemberInput) => Promise<boolean>
  submitting: boolean
}

// C-020 Add/Edit Member Form. Reused for both first-time sharing setup and ongoing
// management (doc 06) — the caller decides which via `mode`, this component doesn't know
// or care whether it's the first member or the fifth. Remounted via a toggling `key` from
// the caller on each open, same convention as MarkPaidDialog, so local state always
// starts fresh.
export function AddEditMemberForm({
  open,
  onOpenChange,
  mode,
  splitMethod,
  currency,
  initialValues,
  onSubmit,
  submitting,
}: AddEditMemberFormProps) {
  const [displayName, setDisplayName] = useState(initialValues?.displayName ?? "")
  const [email, setEmail] = useState(initialValues?.email ?? "")
  const [amountOwed, setAmountOwed] = useState(
    initialValues ? String(initialValues.amountOwed) : ""
  )
  const [error, setError] = useState<string | null>(null)

  const amountEditable = splitMethod === "custom"

  async function handleSubmit() {
    if (!email.trim()) {
      setError("Email is required.")
      return
    }

    const amountNumber = amountEditable ? Number(amountOwed) : 0
    if (amountEditable && (!amountOwed || !Number.isFinite(amountNumber) || amountNumber < 0)) {
      setError("Enter an amount of 0 or more.")
      return
    }

    setError(null)
    const ok = await onSubmit({ displayName, email, amountOwed: amountNumber })
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add member" : "Edit member"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "They don't need a SubSense account — just an email to track what they owe."
              : "Update this member's details."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label htmlFor="member-display-name">Display name (optional)</Label>
            <Input
              id="member-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="member-amount-owed">Amount owed</Label>
            {amountEditable ? (
              <Input
                id="member-amount-owed"
                type="number"
                min="0"
                step="0.01"
                value={amountOwed}
                onChange={(event) => setAmountOwed(event.target.value)}
                className="mt-1.5"
              />
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {initialValues ? formatMoney(initialValues.amountOwed, currency) : "Computed automatically"} — recomputes
                automatically as members join or leave (equal split).
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={submitting} />}>
            Cancel
          </DialogClose>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : mode === "add" ? "Add member" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
