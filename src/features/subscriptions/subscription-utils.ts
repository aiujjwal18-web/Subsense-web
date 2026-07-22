export type BillingFrequency = "monthly" | "every_28_days" | "yearly" | "custom"

export type LifecycleStatus =
  | "active"
  | "review_due"
  | "renewal_confirmed"
  | "paused"
  | "archived"

export type RenewalUrgency = "normal" | "upcoming" | "critical"

export type Currency = "INR" | "USD"

export type PaymentMethod = "upi_autopay" | "card_emandate" | "app_store" | "manual"

export interface CatalogRef {
  name: string
  logo_url: string | null
}

// Shared column list for public.subscriptions reads — used by both the list and
// details pages so the two never drift out of sync.
export const SUBSCRIPTION_SELECT_COLUMNS =
  "id, catalog_id, custom_name, cost, currency, billing_frequency, custom_interval_days, next_renewal_date, payment_method, payment_reference_note, lifecycle_status, monthly_equivalent, annual_equivalent, archived_at, created_at, subscription_catalog(name, logo_url)"

export interface SubscriptionRow {
  id: string
  catalog_id: string | null
  custom_name: string | null
  cost: number
  currency: Currency
  billing_frequency: BillingFrequency
  custom_interval_days: number | null
  next_renewal_date: string
  payment_method: PaymentMethod
  payment_reference_note: string | null
  lifecycle_status: LifecycleStatus
  monthly_equivalent: number | null
  annual_equivalent: number | null
  archived_at: string | null
  created_at: string
  subscription_catalog: CatalogRef | null
}

export const BILLING_FREQUENCY_LABEL: Record<BillingFrequency, string> = {
  monthly: "Monthly",
  every_28_days: "Every 28 Days",
  yearly: "Yearly",
  custom: "Custom",
}

export const LIFECYCLE_LABEL: Record<LifecycleStatus, string> = {
  active: "Active",
  review_due: "Review Due",
  renewal_confirmed: "Renewal Confirmed",
  paused: "Paused",
  archived: "Archived",
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  upi_autopay: "UPI Autopay",
  card_emandate: "Card e-Mandate",
  app_store: "App Store",
  manual: "Manual",
}

export const CURRENCY_LABEL: Record<Currency, string> = {
  INR: "INR (₹)",
  USD: "USD ($)",
}

export function getDisplayName(row: Pick<SubscriptionRow, "custom_name" | "subscription_catalog">): string {
  return row.subscription_catalog?.name ?? row.custom_name ?? "Untitled subscription"
}

export function getLogoUrl(row: Pick<SubscriptionRow, "subscription_catalog">): string | undefined {
  return row.subscription_catalog?.logo_url ?? undefined
}

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Whole days between today (local midnight) and a `date`-only string (YYYY-MM-DD).
 * Parsed as local calendar dates, not UTC, to avoid off-by-one shifts around midnight.
 */
export function daysUntil(dateStr: string): number {
  const target = parseDateOnly(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

// Not a frozen spec value — reuses the existing two_day/seven_day reminder windows as a
// reasonable default per-phase-4 guidance, pending an official doc 10 threshold.
export function computeRenewalUrgency(nextRenewalDate: string): RenewalUrgency {
  const days = daysUntil(nextRenewalDate)
  if (days <= 2) return "critical"
  if (days <= 7) return "upcoming"
  return "normal"
}

/**
 * Client-side estimate only — the DB trigger on public.subscriptions computes the
 * authoritative annual_equivalent/monthly_equivalent server-side on insert/update.
 */
export function estimateAnnualCost(
  cost: number,
  billingFrequency: BillingFrequency,
  customIntervalDays?: number | null
): number {
  if (!Number.isFinite(cost) || cost <= 0) return 0
  switch (billingFrequency) {
    case "monthly":
      return cost * 12
    case "every_28_days":
      return cost * (365 / 28)
    case "yearly":
      return cost
    case "custom":
      if (!customIntervalDays || customIntervalDays <= 0) return 0
      return cost * (365 / customIntervalDays)
  }
}

export function formatMoney(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}
