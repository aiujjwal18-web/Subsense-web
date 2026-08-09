import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/AuthContext"
import { setCheckoutOpen } from "@/lib/checkout-state"
import { supabase } from "@/lib/supabase"
import { loadRazorpayCheckout } from "./loadRazorpayCheckout"
import type { RazorpayCheckoutSuccessResponse } from "./razorpay-types"

interface UpgradeButtonProps {
  planCode: string
}

// Orchestrates the Razorpay Test Mode purchase flow: create order -> open checkout
// widget -> verify payment -> refresh profile. Every step is behind this explicit
// click (BR-001: no auto-executing payment) — verification itself is automatic once
// Razorpay's own success callback fires.
export function UpgradeButton({ planCode }: UpgradeButtonProps) {
  const { refreshProfile } = useAuth()
  const [isProcessing, setIsProcessing] = useState(false)

  async function verifyPayment(response: RazorpayCheckoutSuccessResponse) {
    try {
      const { data, error } = await supabase.functions.invoke("razorpay-verify-payment", {
        body: response,
      })

      if (error || !data?.success) {
        toast.error("Payment verification failed. If you were charged, contact support.")
        return
      }

      await refreshProfile()
      toast.success("You're now on Premium.")
    } finally {
      // finally, not a straight-line call: the idle timer stays suspended until
      // verification has fully settled, and must resume even if this throws — a
      // stuck-true flag would disable the idle timeout for the rest of the session.
      setCheckoutOpen(false)
      setIsProcessing(false)
    }
  }

  async function handleUpgrade() {
    setIsProcessing(true)
    try {
      await loadRazorpayCheckout()

      const { data: orderData, error: orderError } = await supabase.functions.invoke("razorpay-create-order", {
        body: { plan_code: planCode },
      })

      if (orderError || !orderData?.success) {
        toast.error("Couldn't start checkout. Please try again.")
        setIsProcessing(false)
        return
      }

      const { order_id, amount, currency, key_id } = orderData.data as {
        order_id: string
        amount: number
        currency: string
        key_id: string
      }

      if (!window.Razorpay) {
        toast.error("Couldn't load the checkout widget. Please try again.")
        setIsProcessing(false)
        return
      }

      const checkout = new window.Razorpay({
        key: key_id,
        amount,
        currency,
        order_id,
        name: "SubSense",
        description: "Premium upgrade (Test Mode)",
        handler: (response) => {
          void verifyPayment(response)
        },
        modal: {
          ondismiss: () => {
            setCheckoutOpen(false)
            setIsProcessing(false)
          },
        },
        // Razorpay's checkout iframe can't read our CSS custom properties, so this
        // mirrors --primary's Cyber Lime hex directly (05_Design_System) rather than
        // the SDK's default gold. Update this if --primary's value ever changes.
        theme: { color: "#A3E635" },
      })
      // Razorpay renders checkout as a third-party iframe overlay, which emits no
      // activity events on our own document — without this the idle timer would see
      // total silence and could sign the user out mid-payment. Cleared again in both
      // exits from here: modal.ondismiss above, and verifyPayment's finally block.
      setCheckoutOpen(true)
      checkout.open()
    } catch {
      toast.error("Couldn't start checkout. Please try again.")
      // Covers the narrow case where checkout.open() itself throws after the flag was
      // set — no overlay ever appeared, so the idle timer must not stay suspended.
      setCheckoutOpen(false)
      setIsProcessing(false)
    }
  }

  return (
    <Button type="button" size="sm" onClick={handleUpgrade} disabled={isProcessing}>
      {isProcessing ? "Processing…" : "Upgrade"}
    </Button>
  )
}
