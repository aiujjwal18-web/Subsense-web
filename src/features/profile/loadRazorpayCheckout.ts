const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js"

let scriptPromise: Promise<void> | null = null

// Lazy-injected, not a static index.html tag — Razorpay's checkout script is only
// relevant on /profile, so routes that never touch payments pay no third-party
// script cost. Memoized so repeated Upgrade clicks don't inject the script twice.
export function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = RAZORPAY_SCRIPT_SRC
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        scriptPromise = null
        reject(new Error("Failed to load Razorpay checkout."))
      }
      document.body.appendChild(script)
    })
  }

  return scriptPromise
}
