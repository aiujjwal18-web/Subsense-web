# SubSense — End-to-End Run Sheet

One continuous journey through the whole product: **signup → add subscription → share → pay (Test Mode) → insights → idle timeout.**

Phases 1–10 were each tested in isolation as they were built. This sheet exists because the journey has never been run **start to finish in one unbroken session**, which is where hand-off bugs between phases actually show up.

**Method:** manual click-through. This project has no test runner (no vitest, no Playwright, no @testing-library) — see Phase 12 Task 8 in the plan for why automating this was rejected rather than skipped: the journey crosses a third-party Razorpay iframe, real email delivery, and a wall-clock idle timer, which are the three things browser automation handles worst.

---

## How to use this sheet

- Work top to bottom. **Do not reorder** — step 7 signs you out and ends the session, and several later steps depend on data created by earlier ones.
- Record `PASS` / `FAIL` in the Result column, with a note on any FAIL.
- A step that cannot be run (blocked by an earlier failure) is `BLOCKED`, not `FAIL`.
- Keep the browser console open for the entire run. **Any red console error is a finding**, even if the visible UI looks correct.

**Run metadata** — fill in before starting:

| Field | Value |
|---|---|
| Date / time | |
| Run by | |
| Commit SHA (`git rev-parse --short HEAD`) | |
| Environment | local dev (`npm run dev`) / deployed |
| Browser + version | |
| Test account email | |

---

## Pre-flight

Settle these before step 1. Each has burned time in past sessions.

| # | Check | Why it matters | Result |
|---|---|---|---|
| P1 | Use a **genuinely fresh email**, never one that has signed up before | Step 1 is testing real signup. A reused address tests the login path instead and silently invalidates the run. | |
| P2 | Confirm whether Supabase Auth requires **email confirmation** for this project | If confirmation is on, signup will not produce a session and step 1 stalls at a screen that looks broken but isn't. Check Authentication → Providers → Email in the dashboard first. | |
| P3 | Confirm Razorpay keys are **Test Mode** keys (`rzp_test_…`) | Live keys would make step 4 a real charge. Not a hypothetical — this is the BR-001 boundary. | |
| P4 | Note the current Resend usage | Free tier has produced real 429s in earlier testing. If step 3's reminder email never arrives, a rate limit is the first suspect, not the code. | |
| P5 | `npm run dev` running, browser console open, no pre-existing errors on load | Establishes the baseline so a console error found later is attributable to the run. | |

---

## 1. Signup

| # | Action | Expected result | Result |
|---|---|---|---|
| 1.1 | Go to `/` while signed out | Redirected to `/auth`. Not a blank page, not a spinner that never resolves. | |
| 1.2 | Select **Create account** | Signup form shows Email, Password, Confirm password. | |
| 1.3 | Enter mismatched passwords, submit | Rejected with a visible, specific message. Does **not** create an account. | |
| 1.4 | Correct the password, submit | Button shows "Creating account…" while in flight, then a session is established and you land on the Decision Workspace at `/`. | |
| 1.5 | Observe the Workspace empty state | Sensible empty state for an account with zero subscriptions — not an error, not a bare blank region. | |

> If P2 found email confirmation is **on**: expect to confirm via the inbox before a session exists. That is correct behaviour, not a failure — record it and continue.

---

## 2. Add subscription

| # | Action | Expected result | Result |
|---|---|---|---|
| 2.1 | Navigate to Add Subscription (`/subscriptions/add`) | Form loads with **From Catalog** / **Custom** tabs. | |
| 2.2 | In **From Catalog**, search `Netflix` | Results appear as you type. Each row shows a **generic category icon**, never a real Netflix brand logo (DEC-059). | |
| 2.3 | Select the result | Selection replaces the search box, with a Clear (✕) control. | |
| 2.4 | Set Cost `649`, Currency `INR`, Billing Frequency `Monthly`, Next Renewal Date **3 days from today** | Estimated annual cost appears and is arithmetically right (`649 × 12 = ₹7,788`). The 3-day date is deliberate — it drives urgency in 2.7 and 5.x. | |
| 2.5 | Save | Lands on the new subscription's detail page. | |
| 2.6 | Return to `/subscriptions` | The new subscription is listed. | |
| 2.7 | Check its card | Urgency reads **Critical** (≤7 days out) with a **text label**, not colour alone. The urgency glow renders — and does **not** render on a Normal-tier card. | |
| 2.8 | Add a second subscription, any catalog entry, renewal ~40 days out | Needed so Insights (step 5) has more than one row to reason about. | |

---

## 3. Share

| # | Action | Expected result | Result |
|---|---|---|---|
| 3.1 | Open the first subscription's details, find **Shared Members** | Reads "This subscription isn't shared with anyone yet" with a **Share this subscription** button. | |
| 3.2 | Click **Share this subscription**, choose a split method | Section switches to the shared state. | |
| 3.3 | Click **Add member**, add a member with a **real inbox you control** | Member row appears with the correct split amount. | |
| 3.4 | Open `/shared` | The subscription is listed with its split-method badge. | |
| 3.5 | Look for **Payment requests** | May be empty. Payment requests are **generated by a DB trigger**, not by a button — an empty list here is the trigger's schedule, not a bug. Record what you see; do not treat empty as FAIL. | |
| 3.6 | *(Only if a payment request exists)* Click the **Send Reminder** bell | Success toast; the email arrives. A 429 here means the Resend free-tier limit (see P4), not broken code. | |

---

## 4. Pay — Razorpay Test Mode

> **BR-001 boundary.** Every step here is behind an explicit click. Nothing auto-executes a payment.

| # | Action | Expected result | Result |
|---|---|---|---|
| 4.1 | Go to `/profile` | Plan section lists the active plans from `premium_plans`. Current plan is marked. | |
| 4.2 | Click **Upgrade** | Button shows "Processing…", then the Razorpay overlay opens. | |
| 4.3 | Pay with Razorpay's test card | Razorpay's own test-mode success screen. **If the card is declined, check Razorpay's current test-card list rather than assuming a code bug** — the commonly used value is `4111 1111 1111 1111` with any future expiry and any CVV, but Razorpay changes these. | |
| 4.4 | Wait for verification | Success toast "You're now on Premium." Profile flips to Premium **without a manual refresh**. | |
| 4.5 | **Idle-timer interaction — the one that matters.** Repeat 4.2, then leave the Razorpay overlay open and untouched for **over 40 seconds** before completing or dismissing | You are **not** signed out, no idle warning toast fires, and completing the payment afterwards still works. This is the checkout-suspension guard (`isCheckoutOpen()` in `useIdleTimeout.ts`). | |
| 4.6 | Dismiss the overlay without paying | Button returns to "Upgrade". Then confirm the idle timer **resumes** — the warning toast should fire ~30s later if you stay idle. A stuck-open flag would disable the idle timeout for the rest of the session. | |

---

## 5. Insights

| # | Action | Expected result | Result |
|---|---|---|---|
| 5.1 | Go to `/insights` as the now-Premium account | Premium content renders, not the upsell card. | |
| 5.2 | Read the **Summary** | Prose reads naturally and its figures match the Spend Summary below it. | |
| 5.3 | **Multi-currency check** — add a third subscription in a different currency (e.g. `USD 9.00`), return to Insights | Summary states **both** currency totals. A dropped currency is the exact DEC-083 bug fixed in `e84d9d4`; this is its regression check. | |
| 5.4 | Check **Spend Summary** | One row per currency. Totals never summed across currencies. | |
| 5.5 | Check **Duplicate & Overlap Detection** | Renders correctly whether or not duplicates exist. | |
| 5.6 | Check **Worth a Second Look** | Titled "Worth a Second Look" — **not** "Lower-Cost Alternatives" (renamed in `ca35a85`). Copy describes an intra-portfolio comparison, and does not claim competitor or market pricing. | |
| 5.7 | Reload the page 2–3 times | Content stays consistent; no blank flash on revisit. | |

---

## 6. Developer utilities *(optional — Phase 11)*

Skip entirely if Phase 11's Edge Function tasks are not yet deployed.

| # | Action | Expected result | Result |
|---|---|---|---|
| 6.1 | Type `/dev-utilities` directly | Page renders with five sections. | |
| 6.2 | Check the Sidebar | **No** Dev Utilities entry. The page is unlinked by design. | |
| 6.3 | Sign out, then visit `/dev-utilities` | Redirected to `/auth`. Sign back in before continuing. | |

---

## 7. Idle timeout — **run last**

> This step ends your session. Everything above must be complete first.

Current thresholds, read from `src/features/auth/useIdleTimeout.ts`: **30s warning / 40s sign-out.** These are deliberate demo-week values (commit `44053bb`) — *not* the 15/20 minutes named in older notes. If the file has changed since, use its values, not these.

| # | Action | Expected result | Result |
|---|---|---|---|
| 7.1 | Land on any authenticated page. Do not touch mouse, keyboard, scroll or screen | — | |
| 7.2 | Wait ~30 seconds | Warning toast "Still there?" with a **Stay signed in** action, and a duration that reads in **seconds** — never "0 minutes". | |
| 7.3 | Click **Stay signed in** | Toast dismisses; you stay signed in. | |
| 7.4 | Go idle again, ~30s | Warning fires again. | |
| 7.5 | Move the mouse before 40s | Warning dismisses; no sign-out. | |
| 7.6 | Go idle and let it run past 40s | Signed out, redirected to `/auth`, and an informational toast explains the inactivity sign-out. The toast is **visible after sign-out** (`<Toaster />` is mounted outside `ProtectedRoute` for exactly this reason). | |
| 7.7 | Confirm what the timer did | Sign-out **only**. No payment, cancellation, renewal, or downgrade was triggered (BR-001). | |

---

## Results

| Section | Steps | Passed | Failed | Blocked |
|---|---|---|---|---|
| Pre-flight | 5 | | | |
| 1. Signup | 5 | | | |
| 2. Add subscription | 8 | | | |
| 3. Share | 6 | | | |
| 4. Pay | 6 | | | |
| 5. Insights | 7 | | | |
| 6. Dev utilities | 3 | | | |
| 7. Idle timeout | 7 | | | |

**Console errors observed:**

**Failures / notes:**

**Overall:** PASS / FAIL
