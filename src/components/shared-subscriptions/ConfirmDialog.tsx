import type { ReactNode } from "react"

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

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
  confirming?: boolean
  confirmVariant?: "default" | "destructive"
}

// C-017 Confirmation Dialog — first generic implementation (doc 06 v1.24 names two
// variants, "Reminder confirmation" and "Payment status confirmation," that this covers).
// Single-step by design: SubscriptionDetailsPage's existing Archive confirm and
// MarkPaidDialog's two-step pick/confirm wizard both stay as their own page-local
// compositions — Archive's shape already matches this generic form closely enough that
// it could migrate here later, but that migration isn't part of this pass; MarkPaidDialog's
// own "pick a date first" step has no generic equivalent to offer.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  confirming = false,
  confirmVariant = "default",
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={confirming} />}>
            Cancel
          </DialogClose>
          <Button type="button" variant={confirmVariant} onClick={onConfirm} disabled={confirming}>
            {confirming ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
