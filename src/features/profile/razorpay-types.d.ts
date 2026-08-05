// Minimal ambient typing for Razorpay's checkout.js widget (loaded lazily via
// loadRazorpayCheckout.ts) — feature-local rather than a new global src/types/,
// matching this repo's existing "types hand-written per-feature" convention.
export interface RazorpayCheckoutSuccessResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export interface RazorpayCheckoutOptions {
  key: string
  amount: number
  currency: string
  order_id: string
  name?: string
  description?: string
  handler: (response: RazorpayCheckoutSuccessResponse) => void
  modal?: { ondismiss?: () => void }
  theme?: { color?: string }
}

export interface RazorpayCheckoutInstance {
  open: () => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance
  }
}
