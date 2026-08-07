import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { useAuth } from "@/features/auth/AuthContext"
import { isCheckoutOpen } from "@/lib/checkout-state"

// Demo-week values (locked, not a placeholder): 30s warning / 40s sign-out, chosen
// so the feature is actually demoable live rather than requiring a real 15-20 minute
// wait. Revisit to ~4 / 4.5 minutes if this continues past the capstone as a real
// product — 15/20 minutes (this project's first-pass value) was judged too lax even
// for that later stage, let alone for a demo.
const WARNING_AFTER_MS = 30 * 1000
const SIGN_OUT_AFTER_MS = 40 * 1000

// Elapsed idle time is measured against a timestamp rather than re-armed setTimeouts,
// so the checkout suspension below is a single arithmetic adjustment instead of a
// teardown/rebuild of pending timers. At demo-week's 30s/40s thresholds a coarse tick
// would eat most of the grace window, so this runs at 1s granularity instead of the
// 15s that was fine against a 15-20 minute policy — rescale this back up (e.g. 15s)
// if the thresholds below are ever moved back into minutes. Browsers throttle
// intervals in a backgrounded tab; that only ever delays the sign-out, never fires it
// early.
const TICK_INTERVAL_MS = 1 * 1000

// The clock advances at most once per throttle window, so a mousemove storm costs one
// comparison per event and nothing more — this *is* the throttle, no second timestamp
// needed. Tightened alongside TICK_INTERVAL_MS for the same demo-week-granularity
// reason.
const ACTIVITY_THROTTLE_MS = 1 * 1000

const WARNING_TOAST_ID = "idle-timeout-warning"

// Handles both the current sub-minute demo values and the eventual minutes-scale
// values in one function, rather than a minutes-only computation that would silently
// round 30s/40s down to "0 minutes" / misleadingly up to "1 minutes".
function formatDuration(ms: number): string {
  if (ms < 60_000) {
    const seconds = Math.round(ms / 1000)
    return `${seconds} second${seconds === 1 ? "" : "s"}`
  }
  const minutes = Math.round(ms / 60_000)
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

const ACTIVITY_EVENTS: readonly string[] = ["mousemove", "keydown", "scroll", "click", "touchstart"]

// Capture phase: `scroll` does not bubble, so a listener bound to window in the bubble
// phase would miss scrolling inside any nested scroll container.
const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true }

/**
 * Signs the user out after {@link SIGN_OUT_AFTER_MS} of inactivity, with a warning
 * toast at {@link WARNING_AFTER_MS}. Mounted once from ProtectedRoute so it covers
 * every authenticated route and never runs on the public /auth/* pages.
 *
 * Cross-tab idle time is deliberately tracked per-tab (no storage/BroadcastChannel
 * sync) — an idle tab can sign out while another is in use. Accepted limitation; the
 * resulting sign-out still propagates normally through Supabase's own cross-tab
 * session sync and AuthContext's onAuthStateChange handler.
 */
export function useIdleTimeout(enabled: boolean) {
  const { signOut } = useAuth()

  // Seeded to 0 rather than Date.now(): reading the clock during render is impure
  // (react-hooks/purity). Both are set to a real timestamp by the effect below before
  // anything can read them — nothing outside the effect touches these refs.
  const lastActivityRef = useRef(0)
  const lastTickRef = useRef(0)
  const warnedRef = useRef(false)
  const signingOutRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const startedAt = Date.now()
    lastActivityRef.current = startedAt
    lastTickRef.current = startedAt
    warnedRef.current = false
    signingOutRef.current = false

    function resetIdleClock() {
      lastActivityRef.current = Date.now()
      if (warnedRef.current) {
        warnedRef.current = false
        toast.dismiss(WARNING_TOAST_ID)
      }
    }

    function handleActivity() {
      if (Date.now() - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return
      resetIdleClock()
    }

    function tick() {
      const now = Date.now()
      const sinceLastTick = now - lastTickRef.current
      lastTickRef.current = now

      // Suspend, not reset. Carrying the activity timestamp forward by exactly the
      // elapsed interval freezes the *measured* idle duration for as long as
      // Razorpay's checkout iframe is open — the user is typing card details in a
      // third-party overlay that emits no events on our document, so from here that
      // is indistinguishable from being away. A bare early return would let wall
      // clock keep accumulating and fire the sign-out the instant a long checkout
      // finished, which is precisely the failure this guard exists to prevent.
      // Resetting instead would be wrong in the other direction: it would hand a
      // fresh full window to someone who really did walk away mid-checkout.
      if (isCheckoutOpen()) {
        lastActivityRef.current += sinceLastTick
        return
      }

      const idleFor = now - lastActivityRef.current

      if (idleFor >= SIGN_OUT_AFTER_MS) {
        if (signingOutRef.current) return
        signingOutRef.current = true
        toast.dismiss(WARNING_TOAST_ID)
        // Sign-out is the only thing this timer is ever allowed to do — never a
        // payment, cancellation, renewal, or downgrade (BR-001).
        void signOut().then(() => {
          toast.info(`Signed out after ${formatDuration(SIGN_OUT_AFTER_MS)} of inactivity.`)
        })
        return
      }

      if (idleFor >= WARNING_AFTER_MS && !warnedRef.current) {
        warnedRef.current = true
        toast.warning("Still there?", {
          id: WARNING_TOAST_ID,
          description: `You'll be signed out in about ${formatDuration(SIGN_OUT_AFTER_MS - WARNING_AFTER_MS)}.`,
          duration: Number.POSITIVE_INFINITY,
          action: { label: "Stay signed in", onClick: resetIdleClock },
        })
      }
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, LISTENER_OPTIONS)
    }
    const intervalId = window.setInterval(tick, TICK_INTERVAL_MS)

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity, LISTENER_OPTIONS)
      }
      window.clearInterval(intervalId)
      toast.dismiss(WARNING_TOAST_ID)
    }
  }, [enabled, signOut])
}
