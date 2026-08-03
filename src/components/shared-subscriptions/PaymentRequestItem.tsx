import { useState } from "react"
import { Bell, CheckCircle2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/shared-subscriptions/ConfirmDialog"
import { formatMoney, type Currency } from "@/features/subscriptions/subscription-utils"
import {
  PAYMENT_REQUEST_STATUS_LABEL,
  canMemberReportPaid,
  canOwnerMarkPaid,
  canSendReminder,
  type PaymentRequestRow,
} from "@/features/shared-subscriptions/shared-subscription-utils"

export interface PaymentRequestItemProps {
  request: PaymentRequestRow
  memberName: string
  isOwner: boolean
  isSelf: boolean
  onOwnerMarkPaid: () => Promise<boolean>
  onReportPaid: () => Promise<boolean>
  onSendReminder: () => Promise<boolean>
  mutating: boolean
}

function formatCycleDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

// C-021 Payment Request Item — one billing-cycle payment_requests row, actions scoped by
// actor and current status per DEC-037. Note the "Mark Paid" action here is deliberately
// NOT called "Mark Paid" in its own copy — MarkPaidDialog.tsx already owns that phrase for
// a different action ("I paid the subscription provider"); this one means "this member
// paid me back," so its button/dialog name the member explicitly to avoid the collision.
export function PaymentRequestItem({
  request,
  memberName,
  isOwner,
  isSelf,
  onOwnerMarkPaid,
  onReportPaid,
  onSendReminder,
  mutating,
}: PaymentRequestItemProps) {
  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [reportPaidOpen, setReportPaidOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)

  const currency = request.currency as Currency

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{memberName}</p>
        <p className="text-xs text-muted-foreground">{formatCycleDate(request.billing_cycle_date)}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-foreground">{formatMoney(request.amount, currency)}</p>
        <Badge variant="outline" className="mt-1">
          {PAYMENT_REQUEST_STATUS_LABEL[request.status]}
        </Badge>
      </div>

      {isOwner && (canOwnerMarkPaid(request.status) || canSendReminder(request.status)) && (
        <div className="flex items-center gap-1">
          {canSendReminder(request.status) && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setReminderOpen(true)}
                    aria-label={`Send reminder to ${memberName}`}
                  />
                }
              >
                <Bell className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Send reminder</TooltipContent>
            </Tooltip>
          )}
          {canOwnerMarkPaid(request.status) && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setMarkPaidOpen(true)}
                    aria-label={`Mark ${memberName}'s payment received`}
                  />
                }
              >
                <CheckCircle2 className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Mark {memberName}'s payment received</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {!isOwner && isSelf && canMemberReportPaid(request.status) && (
        <Button type="button" variant="outline" size="sm" onClick={() => setReportPaidOpen(true)}>
          I've Paid
        </Button>
      )}

      <ConfirmDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        title={`Mark ${memberName}'s payment as received?`}
        description={`This confirms ${formatMoney(request.amount, currency)} from ${memberName} has been received. This can't be undone.`}
        confirmLabel="Mark received"
        confirming={mutating}
        onConfirm={async () => {
          const ok = await onOwnerMarkPaid()
          if (ok) setMarkPaidOpen(false)
        }}
      />

      <ConfirmDialog
        open={reportPaidOpen}
        onOpenChange={setReportPaidOpen}
        title="Report this payment as sent?"
        description={`This lets the owner know you've paid ${formatMoney(request.amount, currency)}. They'll confirm it on their end.`}
        confirmLabel="I've paid"
        confirming={mutating}
        onConfirm={async () => {
          const ok = await onReportPaid()
          if (ok) setReportPaidOpen(false)
        }}
      />

      <ConfirmDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        title={`Send a reminder to ${memberName}?`}
        description={`They'll get an email about the ${formatMoney(request.amount, currency)} they owe for this billing cycle.`}
        confirmLabel="Send reminder"
        confirming={mutating}
        onConfirm={async () => {
          const ok = await onSendReminder()
          if (ok) setReminderOpen(false)
        }}
      />
    </div>
  )
}
