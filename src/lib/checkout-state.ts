// Module-level flag, deliberately not React state or AuthContext.
//
// Razorpay's checkout is a third-party iframe overlay: a user typing card details
// inside it produces zero mousemove/keydown/scroll events on our own document, so the
// idle timer sees total silence for the entire checkout and would otherwise sign the
// user out mid-payment. This flag lets the timer suspend itself for that window.
//
// Why not AuthContext: the only consumer is useIdleTimeout's interval tick, which
// needs the value *at tick time*, not reactively. Putting it in context would
// re-render every auth consumer twice per purchase for no benefit, and would mean
// touching AuthContext's session logic (DEC-084) for something unrelated to it. Same
// module-level pattern as loadRazorpayCheckout.ts's memoized `scriptPromise`.
//
// Lives in lib/ rather than features/profile/ so features/auth doesn't have to import
// from features/profile to read it.
let checkoutOpen = false

export function setCheckoutOpen(open: boolean): void {
  checkoutOpen = open
}

export function isCheckoutOpen(): boolean {
  return checkoutOpen
}
