import { Pencil, X } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { formatMoney } from "@/features/subscriptions/subscription-utils"
import { getMemberDisplayName, type SharedMemberRow as SharedMemberRowData, type SplitMethod } from "@/features/shared-subscriptions/shared-subscription-utils"

export interface SharedMemberRowProps {
  member: SharedMemberRowData
  splitMethod: SplitMethod
  isOwner: boolean
  onEdit: () => void
  onRemove: () => void
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return (first + second).toUpperCase() || "?"
}

// C-019 Shared Member Row. Only active members ever reach this component — a removed
// member's row simply drops out of the caller's list (doc 06: their payment_requests
// history stays visible via C-021 elsewhere, per DEC-080's no-cascade rule).
export function SharedMemberRow({ member, splitMethod, isOwner, onEdit, onRemove }: SharedMemberRowProps) {
  const name = getMemberDisplayName(member)

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Avatar>
        <AvatarFallback>{getInitials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {member.display_name && member.email && (
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        )}
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-foreground">{formatMoney(member.amount_owed, member.currency)}</p>
        {splitMethod === "equal" && <p className="text-xs text-muted-foreground">Auto-splits equally</p>}
      </div>
      {isOwner && (
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${name}`}>
            <Pencil className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${name} from split`}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
