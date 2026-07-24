# Build Log — Subsense-web

Append-only, most-recent-first traceability log of build steps, the prompts that drove them, and how each step was verified. This lives inside the code repo (not the IIT Capstone governance docs) because it's a record of *implementation activity*, not product/architecture decisions — those still belong in `08_Decision_Log`.

Two things keep this current automatically:
1. A git `post-commit` hook (`.git/hooks/post-commit`, local-only — not versioned by git itself) appends a one-line entry for every commit: timestamp, hash, message.
2. `CLAUDE.md` instructs Claude Code to append a full entry here — the prompt it was given, what it built, and how it verified the work — before committing each task, using the template below.

---

## Entry template

```
## YYYY-MM-DD — <short task title>

**Prompt:**
<the prompt given to Claude Code, or a faithful summary if very long>

**What was done:**
- <bullet list of concrete changes / files touched>

**Verification:**
- <build/lint/test results>
- <manual smoke test results, if any>

**Commit:** <hash> — "<commit message>"
```

---

## 2026-07-23 — Fix: auth error messages rendering as "{}", missing back-link from check-email state

**Prompt:**
Two bugs found in manual testing of the email/password auth just built: (1) sign-up (and likely sign-in) errors render as a literal "{}" on screen instead of the actual message — find every place `formError` gets set from a Supabase auth call's error and make sure it reads `error.message` with a sensible fallback if empty. (2) the "Check your email to confirm your account." state has no way back to the sign-in form — add a "Back to sign in" link that resets to sign-in mode. After fixing, re-test signing up with `crazy.anu2008@gmail.com` (the user's own repro case) and report the actual error message, plus re-test with a fresh email to confirm the happy path plus new back-link. Don't commit without go-ahead.

**What was done:**
- Investigated against the **real** Supabase backend (not mocks) before touching any code, since the existing `AuthPage.tsx`/`ResetPasswordPage.tsx` already did `setFormError(error.message)` directly — not the object, not a template literal — so the bug couldn't be what it first looked like. Ran `supabase.auth.signUp(...)` directly from Node against the live project: `error.message` really was the two-character string `"{}"`, `error.name` was `AuthRetryableFetchError`, `error.status` was `500`. A raw `fetch()` to `/auth/v1/signup` (bypassing supabase-js entirely) showed the *actual* server response: `{"error_code":"unexpected_failure","msg":"Error sending confirmation email"}` — a real, readable message. The bug is in `@supabase/auth-js` itself: `handleError()` treats every 5xx as "retryable" and returns before ever parsing the JSON body for those, falling back to `JSON.stringify()` on the raw fetch-error object — which serializes to `"{}"` since that object has no own enumerable properties. So `error.message` is broken *before* it ever reaches this app's code, for any signup that hits a 500.
- Also ran the same test with a completely fresh, never-used email — same `500`/`"Error sending confirmation email"` result, confirming this isn't specific to already-registered emails; it's every signup attempt right now.
- Added `src/features/auth/auth-error.ts` exporting `getAuthErrorMessage(error)`: returns a fixed fallback ("Something went wrong. Please try again.") when the message is empty *or* looks like a stringified object (starts with `{`), otherwise returns the real message untouched. A plain `error.message || fallback` guard (what "empty" alone would catch) would not have caught this specific case, since `"{}"` is a non-empty, truthy string — the `startsWith("{")` check is what actually fixes the reported symptom.
- Wired `getAuthErrorMessage` into `AuthPage.tsx`'s and `ResetPasswordPage.tsx`'s `setFormError(...)` calls (the two places that read a Supabase auth error's `.message`). `ForgotPasswordPage.tsx` doesn't render any error at all by design (same confirmation regardless of outcome, to not leak account existence), so there was nothing to change there.
- `AuthPage.tsx`: added a "← Back to sign in" button under the check-email message, resetting `checkEmail`, `mode` (to `"signin"`), `password`, `confirmPassword`, and `formError` — deliberately leaving `email` filled in, since a returning user retrying sign-in most likely wants the same address still there.

**Verification:**
- `npm run build`: passes (exit 0, same pre-existing bundle-size advisory).
- `npm run lint`: same 4 pre-existing errors, no new ones.
- **Re-tested `crazy.anu2008@gmail.com` against the real backend as asked**: this attempt did not error at all — it went straight to the "Check your email to confirm your account" state, with no message shown. This is Supabase's intentional, secure behavior for an already-registered email: it deliberately doesn't send a new confirmation email or reveal that the account exists, so it skips the email-send step entirely (and therefore never hits the SMTP-related 500) and just shows the same generic "check your email" outcome a genuine new signup would show — consistent with the same non-enumeration principle already used in `ForgotPasswordPage.tsx`.
- **Re-tested with a fresh, never-used email as asked**: this one did hit the real backend's 500 (`"Error sending confirmation email"`) — and now renders the clean fallback "Something went wrong. Please try again." instead of "{}", confirming the fix works. Screenshot confirmed.
- **Back-link**: verified via a mocked signup response (to avoid spamming more live signups against a project whose email-sending already looks rate-limited/misconfigured) — clicking "← Back to sign in" correctly returns to the Sign in tab with the form visible. Screenshot confirmed.

**Real, separate issue surfaced by this investigation — not a frontend bug, flagging for the user:** Supabase's confirmation-email sending is currently failing server-side (`"Error sending confirmation email"`, HTTP 500) for brand-new signups. This happened for every fresh email tested today, while an already-registered email's signup didn't need to send anything and therefore didn't hit it. The most likely cause is the built-in default mailer's very low rate limit (a handful of emails/hour) being exhausted by testing, though a genuine SMTP misconfiguration is also possible — worth checking Supabase's Auth logs and Authentication → Email settings, and considering a custom SMTP provider if this needs to work reliably beyond occasional manual testing. This is independent of today's UI fix: the fallback message now shown is accurate ("something went wrong"), but real users hitting this during actual signup still won't be able to complete it until the underlying email delivery is fixed.

**Commit:** (see next entry — logged automatically by the post-commit hook)

---

## 2026-07-23 — Email/password authentication (closing Phase 2's Google-only gap)

**Prompt:**
Build the missing email/password authentication — doc 03's Authentication screen list has always included "Email/password fallback where supported. Forgot password. Reset password." alongside Google Sign-In (DEC-011 made Google primary, not exclusive); Phase 2 only built the Google half. Add `signInWithPassword`/`signUpWithPassword`/`resetPasswordForEmail`/`updatePassword` to `AuthContext.tsx`. Add a sign-in/create-account toggle to `AuthPage.tsx` using the existing `Input`/`Label`/`Tabs` components and the `formError` pattern from `AddSubscriptionPage.tsx`: sign-in (email+password), sign-up (email+password+confirm, client-side match check, "check your email" state if `data.session` is null after signup since email confirmation is enabled), a "Forgot password?" link. New `ForgotPasswordPage.tsx` (email → generic confirmation regardless of outcome, doesn't leak account existence) and `ResetPasswordPage.tsx` (new password + confirm → `updatePassword` → navigate to `/`), same card layout as `AuthPage`. Wire both into `App.tsx` outside `ProtectedRoute`. Don't touch Supabase-dashboard config (redirect URL allowlist, email templates) — flag it for the user. Verify sign-up's check-email state, sign-in's bad-password error, and forgot-password's confirmation message. Update BUILD_LOG.md, run build/lint, don't commit.

**What was done:**
- `AuthContext.tsx`: added the four methods exactly as specified, typed via `ReturnType<typeof supabase.auth.X>` on the interface so callers get the real Supabase response shape (`data.session`, `error.message`, etc.) rather than a hand-rolled subset — needed since `AuthPage` has to inspect `data.session` after signup, not just `error`.
- `AuthPage.tsx`: added a `Tabs`-based sign-in/create-account toggle (reusing the same `Tabs` component and mode-switching pattern `AddSubscriptionPage.tsx` already established for catalog/custom, rather than a one-off toggle), full `formError` handling, a `checkEmail` state that replaces the whole form with a confirmation message when signup succeeds but returns no session, and a "Forgot password?" link. Google sign-in stays exactly as it was, now below a plain-text "or" divider.
- `ForgotPasswordPage.tsx` (new) and `ResetPasswordPage.tsx` (new): same centered-card layout as `AuthPage`, `Logo` at top. Forgot-password always shows the same confirmation copy after calling `resetPasswordForEmail`, regardless of the result, so the endpoint can't be used to enumerate which emails have accounts. Reset-password does a client-side match check, calls `updatePassword`, navigates to `/` on success — relies on `supabase-js`'s default handling of the recovery-session URL fragment from the email link, nothing custom needed for that part.
- `App.tsx`: added `/auth/forgot-password` and `/auth/reset-password` routes alongside `/auth`, outside `ProtectedRoute`.
- Confirmed `resetPasswordForEmail`'s `redirectTo` produces a real `?redirect_to=...` query parameter on the outgoing `/auth/v1/recover` request (found this while writing the mocked-request verification below, when the first route pattern without a trailing wildcard silently failed to intercept it) — the redirect URL is being sent correctly, it's just Supabase-dashboard-side allowlisting that's still needed (see below).

**Verification:**
- `npm run build`: passes (exit 0, same pre-existing bundle-size advisory).
- `npm run lint`: same 4 pre-existing errors, no new ones (the file/line for the `AuthContext.tsx` one shifted since the file grew, same underlying pre-existing violation as every prior phase).
- Manual smoke test (headless Chromium): since there's no real email inbox or existing Supabase test account in this environment, used `page.route()` to intercept and mock the actual Supabase Auth REST endpoints (`/auth/v1/token?grant_type=password`, `/auth/v1/signup`, `/auth/v1/recover`) with realistic GoTrue response shapes (confirmed against `@supabase/auth-js`'s own source for exactly how it derives `session`/`user`/`error.message` from each response, rather than guessing) — this exercises the real client-side logic paths, not just the network-failure branch. Confirmed: signing in with a mocked "invalid_credentials" response renders "Invalid login credentials" in the `formError` `<p>`; signing up with a mocked no-session response shows the "Check your email to confirm your account" state (form fully replaced, not just an added message); a client-side password/confirm-password mismatch on signup is caught before any network call and shows "Passwords don't match."; the forgot-password page shows its generic confirmation message after submit; the reset-password page renders its form correctly when visited directly (no live recovery session to fully complete this one — see below). Zero unexpected console errors (the one logged error is the intentionally-mocked 400 from the bad-password test itself).
- **Not fully verified — needs a real environment**: the actual end-to-end reset-password link, because the redirect URL isn't allowlisted in Supabase yet (see next point), and there's no real inbox here to click a real confirmation/reset email from.

**Flag for the user — manual Supabase-dashboard step, not doable from code:** add `<production-domain>/auth/reset-password` and the local dev equivalent (`http://localhost:5173/auth/reset-password`) to Supabase's Authentication → URL Configuration → Redirect URLs. Until that's done, real reset-password emails will fail to redirect back into the app correctly, even though the app-side code is in place and calling the right endpoint with the right redirect target.

**Commit:** (see next entry — logged automatically by the post-commit hook)

---

## 2026-07-23 — SubSense logo (DEC-055)

**Prompt:**
Build the SubSense logo per DEC-055 (doc 08) / doc 05's Logo section, using existing tokens only (`--primary`, `--popover`, `font-heading`/IBM Plex Sans), no new dependencies. Create `src/components/brand/LogoIcon.tsx` (a 40x40 rounded-square icon: `--popover` background, an S-curve stroked in `--primary`) and `src/components/brand/Logo.tsx` (the full lockup: icon + "SubSense" wordmark in `font-heading`). In `Header.tsx`, replace the plain text wordmark with icon-only (`LogoIcon`, `size-8`) — doc 05 reserves the full lockup for marketing/landing and the pre-auth screen. In `AuthPage.tsx`, replace the plain `<h1>SubSense</h1>` with the full `Logo` lockup, centered. Verify header shows icon-only, login page shows icon+wordmark centered, no console errors. Update BUILD_LOG.md, run build/lint, don't commit.

**What was done:**
- `src/components/brand/LogoIcon.tsx` and `src/components/brand/Logo.tsx`: built exactly to the given spec (`cn` import confirmed as `@/lib/utils`, matching every other component in the codebase, no adjustment needed there).
- `Header.tsx`: swapped the plain `<span className="font-heading ...">SubSense</span>` wordmark for `<LogoIcon className="size-8 shrink-0" />` — icon-only, per doc 05.
- `AuthPage.tsx`: swapped the plain `<h1>SubSense</h1>` for `<Logo className="justify-center" />`, keeping the page's existing centered-card layout.
- Both new components use only pre-existing tokens (`var(--primary)`, `var(--popover)`, `font-heading`) and no new npm dependencies, as instructed.

**Verification:**
- `npm run build`: passes (exit 0, same pre-existing bundle-size advisory).
- `npm run lint`: same 4 pre-existing errors, no new ones.
- Manual smoke test (headless Chromium): `/auth` (no session) renders the full icon+wordmark lockup centered above the "Sign in to track your subscriptions" copy, alongside the existing Google sign-in button — screenshot confirmed the icon (blue S-curve on a dark rounded-square) and wordmark both render correctly, no layout breakage. The authenticated shell's `Header` (via the fake-session technique, since no real OAuth session is available here) shows only the icon in the top-left, confirmed via a text-content check that "SubSense" no longer appears as text in the header. Zero non-401 console errors in either view.

**Commit:** (see next entry — logged automatically by the post-commit hook)

---

## 2026-07-23 — DEC-044 exit-motion audit: Dialog/DropdownMenu/Select

**Prompt:**
DEC-044 (frozen, in 05_Design_System) specifies ease-in exit motion for dialogs (320ms), dropdowns/toggles (200ms), and toasts, using Motion per CLAUDE.md's animation rule. Audit every Dialog, DropdownMenu, and Select component/instance (profile menu, archive confirm dialog, Currency/Payment Method/Billing Frequency selects, any toast) and confirm whether exit animation is actually implemented, or whether they just disappear/snap closed instantly ("lights up" then vanishes, per user report). Where missing, implement using existing frozen timing values, same shared `motion.ts` if applicable — don't invent new values. Where implemented but not visually landing, check for a bug (e.g. `AnimatePresence` not wrapping the conditional render, `exit` prop not defined). Don't touch overall color palette, typography, or restraint level — purely closing an animation-completeness gap, not a redesign. Update BUILD_LOG.md, don't commit yet, run build/lint and report.

**What was done:**
- Audited `dialog.tsx`, `dropdown-menu.tsx`, `select.tsx` (all three built on `@base-ui/react` primitives, per Phase 4's Select follow-up fix) plus a repo-wide search for a toast component (none exists yet — nothing built against that part of DEC-044 to audit) and for a Toggle/Switch component (also none — the only "toggle" in the app is the sidebar's plain collapse button, not an animated open/close primitive).
- **Empirically measured actual close behavior in headless Chromium before touching anything**, rather than assuming from a code read: for the profile `DropdownMenu`, the archive-confirm `Dialog`, and the Currency `Select`, triggered close and checked (a) whether the popup element stayed in the DOM with a `data-closed` attribute after the close event, and (b) the actual computed `animation-duration`/`animation-timing-function` at that moment. Result: **exit animation was already technically implemented and working** for all three — Base UI's own `element.getAnimations()`-based unmount-delay (documented in its animation guide) was correctly holding each popup in the DOM until its CSS exit animation finished. This ruled out "AnimatePresence missing" or "exit prop undefined" as the cause — there's no Motion-based lifecycle here to be missing/misconfigured in the first place; the existing implementation (already established by earlier phases) uses Base UI's CSS-animation-attribute approach (`data-open`/`data-closed` + `tw-animate-css`'s `animate-in`/`animate-out` keyframe utilities), which Base UI's own docs list as a first-class, fully-supported alternative to Motion for this exact purpose.
- The real defect: every one of these (`DialogOverlay`, `DialogContent`, `DropdownMenuContent`, `DropdownMenuSubContent`, `SelectContent`) shared a single flat `duration-100` (100ms) Tailwind class applied to *both* enter and exit, with no explicit easing curve (falling back to the browser's default `ease`) — nowhere close to DEC-044's 320ms/200ms exit-specific values, and fast enough that a real exit animation reads as an instant snap to a human eye, matching the "lights up then vanishes" report exactly.
- **Surfaced the literal "using Motion" instruction as a real fork before implementing**, since it conflicts with what's actually broken here: a true Motion/`AnimatePresence` rewrite of all three shared primitives (they'd need Base UI's documented `keepMounted` + controlled-`open`-state + `motion.div` render-prop pattern, restructured through every existing call site: the profile menu, the archive dialog, all 6 currency/billing/payment selects) is a much larger, riskier change than "closing an animation-completeness gap" — with real new risk around focus/pointer-events on kept-mounted-but-hidden popups that isn't fully verifiable without deeper accessibility testing. Asked the user directly; they chose the scoped CSS-timing fix over the full Motion rewrite.
- **Fix applied** (CSS-attribute-scoped, using Tailwind's `data-closed:` variant so entry timing is untouched and only the exit direction changes): added `data-closed:duration-320 data-closed:ease-in` to `DialogOverlay` and `DialogContent`; added `data-closed:duration-200 data-closed:ease-in` to `DropdownMenuContent`, `DropdownMenuSubContent`, and `SelectContent`. No changes to `select.tsx`'s `SelectItem`, `dropdown-menu.tsx`'s items, or any color/spacing/typography — purely the two exit-direction timing tokens per DEC-044's own numbers.

**Verification:**
- `npm run build`: passes (exit 0, same pre-existing bundle-size advisory).
- `npm run lint`: same 4 pre-existing errors, no new ones.
- Re-ran the same empirical Chromium measurement after the fix: `DropdownMenu` now closes with computed `animation-duration: 0.2s`, `animation-timing-function: cubic-bezier(0.4, 0, 1, 1)` (CSS `ease-in`), fully detaching from the DOM ~274ms after the close event (was ~93ms before, with the pre-fix 100ms flat duration). `Dialog` now computes `animation-duration: 0.32s`, same `ease-in` curve, detaching ~849ms after close (was ~134ms before) — the gap beyond 320ms is the overlay's independent fade plus focus-return sequencing, not a second bug. `Select` computes the same `0.2s`/`ease-in` values correctly, but — confirmed as intended Base UI behavior via its own docs, not a leftover defect — a Select's popup element stays permanently attached to the DOM (goes to `hidden`, not removed) after its first open in a session, so a "does it detach" check doesn't apply to it the way it does to Dialog/DropdownMenu; the CSS values driving its exit animation are what were verified instead.
- Not verified: toasts and a dedicated Toggle/Switch primitive — neither exists in the codebase yet, so DEC-044's guidance for those two is nothing to audit against right now; worth reapplying the same `data-closed:duration-200 data-closed:ease-in` pattern whenever either is eventually built.

**Commit:** (see next entry — logged automatically by the post-commit hook)

---

## 2026-07-23 — Post-Phase-5 fixes: header Add Subscription, Motion coverage, Amazon Prime logo crop

**Prompt:**
Three things to check/fix, not deferred to a later phase: (1) the global "Add Subscription" button in the Header is still disabled — a Phase 3 placeholder built before `/subscriptions/add` existed (Phase 4) — wire it up. (2) The app looks visually flat/dull compared to what CLAUDE.md's Motion rule and the design system's micro-interaction spec (DEC-044) call for — hover states on interactive cards, staggered entrance for capped list items. Check whether the Phase 4/5 pages actually use Motion for these or were built without it; if missing, apply the existing frozen hover/stagger spec, don't invent new values. (3) The "Amazon Prime" catalog card shows only "rim" instead of a readable logo, unlike "Amazon Prime Video" which renders fine. Check whether that row's `logo_url` is broken/wrong, or the image is being cropped by the card's container sizing, and fix whichever it is.

**What was done:**
- **Header Add Subscription button**: `Header.tsx` — removed `disabled`, added `useNavigate()` + `onClick={() => navigate("/subscriptions/add")}`, matching how `SubscriptionsListPage`'s own Add button already navigates.
- **Motion coverage audit**: only `SubscriptionsListPage.tsx` (Phase 4) actually used Motion, for its subscription-grid entrance stagger (`initial y:16→0, opacity 0→1, duration 0.4s easeOut, delay = min(index,7)×0.06s`, capped at 8 items). Everything built in Phase 5 (`DecisionWorkspacePage.tsx`'s Upcoming Renewals / Recommended Reviews) and part of Phase 4 (`AddSubscriptionPage.tsx`'s catalog search results, itself capped at 8 rows) had zero entrance animation — a real gap matching the report, not a stylistic quibble.
  - Extracted the grid's existing stagger values into `src/lib/motion.ts` (`staggerItemMotion(index)`) so the frozen spec has one source instead of being retyped at each new call site, and pointed `SubscriptionsListPage.tsx` at it too (no behavior change there — same numbers, now shared).
  - Wrapped `DecisionWorkspacePage.tsx`'s Upcoming Renewals and Recommended Reviews rows, and `AddSubscriptionPage.tsx`'s catalog search results, in `motion.div`/`motion.li` using the same shared spec.
  - Interactive-card hover: `SubscriptionCard.tsx` already had a real hover treatment (`border-ring`/`bg-popover`, `duration-[120ms] ease-out`) — that's the only frozen hover-timing value anywhere in the codebase, so no new value was invented. The list-row buttons in `DecisionWorkspacePage.tsx` and `AddSubscriptionPage.tsx` only had bare `transition-colors hover:bg-muted` (no explicit timing, defaulting to Tailwind's generic transition), so they were aligned to the same `duration-[120ms] ease-out` timing for consistency.
- **Amazon Prime logo**: couldn't inspect the real `logo_url` value directly — the `subscription_catalog` table's SELECT RLS policy is authenticated-only (confirmed via an anon-key REST call returning `[]`), and no real session is available in this environment, same limitation flagged throughout. However, the bug report itself rules out a broken URL: a 404'd/invalid image would trigger the existing `onError` fallback to the generic `CreditCard` icon, not render partial legible text — "rim" showing through means the image loaded successfully and is being cropped. Reproduced the same failure mode with a real wide wordmark-style logo (603×182px, ~3.3:1) under the existing markup and got the identical crop artifact, confirming root cause: `object-cover` inside a `rounded-full size-9/10/12` avatar aggressively crops any non-square logo, keeping only a thin vertical slice. Fixed by switching every subscription-logo `<img>` (`SubscriptionCard.tsx`, `SubscriptionDetailsPage.tsx`, `DecisionWorkspacePage.tsx`'s `SubscriptionListItem`, both logo spots in `AddSubscriptionPage.tsx`) from `object-cover` to `object-contain`, plus a `bg-muted` base so any letterboxing around a non-square logo reads the same neutral fill already used by the no-logo fallback icon, instead of leaving transparent gaps. `avatar.tsx` (user profile photos, not brand logos) was left untouched — different content shape, not implicated by this bug.

**Verification:**
- `npm run build`: passes (exit 0, same pre-existing bundle-size advisory).
- `npm run lint`: same 4 pre-existing errors, no new ones.
- Manual smoke test (headless Chromium, `page.route()`-mocked `subscriptions`/`subscription_catalog` reads, same technique as Phase 5's verification): confirmed the header's Add Subscription button is no longer disabled and clicking it navigates to `/subscriptions/add`; confirmed zero non-401 console errors; confirmed a mocked wide (603×182px) "Amazon Prime" logo now renders as the full, legible wordmark inside its circular avatar instead of a cropped fragment (screenshot). Did not re-verify the stagger animation frame-by-frame (the shared values were already visually confirmed in Phase 4's original verification of `SubscriptionsListPage`) — confirmed instead that the same code path is now wired up on the new call sites and the page renders without errors.
- Not verified here: the real Supabase `subscription_catalog` row's actual `logo_url` value for "Amazon Prime" — blocked by RLS (authenticated-only SELECT) with no real session available. The fix addresses the render-side cropping bug (confirmed root cause via the "rim" partial-text symptom + reproduction), which resolves the issue regardless of what the real URL is unless that URL is also outright broken — worth a quick manual check in a real authenticated session to be certain both causes are ruled out.

**Commit:** (see next entry — logged automatically by the post-commit hook)

---

## 2026-07-23 — Phase 5: Decision Workspace

**Prompt:**
Implement Phase 5 (Decision Workspace) per 16_Implementation_Roadmap and 03_Information_Architecture's screen hierarchy: Today's Financial Context, AI Insights, Upcoming Renewals, Recommended Reviews, Shared Payment Activity, Potential Savings. Replaces the placeholder page at `/`. Today's Financial Context and Upcoming Renewals use real data (query active subscriptions, compute monthly/annual spend, list renewals by next_renewal_date) reusing `subscription-utils.ts` helpers — don't reinvent them. AI Insights and Shared Payment Activity must be empty/placeholder states only, no fake AI text or fake shared data (Phase 7/8 don't exist yet). Potential Savings stays a light placeholder (Insights/Phase 9 owns real analytics). Recommended Reviews derives from real data if trivial (Critical/Upcoming-flagged subscriptions), otherwise placeholder. Hard rules: no provider-control actions anywhere (BR-001, no cancel/renew/downgrade), handle the zero-subscription empty/healthy state coherently, reuse existing components (Renewal Urgency Indicator, card patterns) rather than inventing new one-off styling — check 06_Component_Library before inventing. Read BUILD_LOG.md and CLAUDE.md first. Update BUILD_LOG.md before committing; don't commit. Run build/lint and report.

**What was done:**
- The "Renewal Urgency Indicator" doc 03 wants reused was, on inspection, only inline JSX duplicated once already (inside `SubscriptionCard`) — not an actual reusable component. Extracted it into `src/components/subscriptions/RenewalUrgencyBadge.tsx` and refactored `SubscriptionCard.tsx` to consume it (removed its now-redundant local `URGENCY_LABEL`/`URGENCY_COLOR` maps), so this phase and any future one share one real implementation instead of a third copy-paste.
- Rewrote `src/features/decision-workspace/DecisionWorkspacePage.tsx` (was the Phase 3 placeholder): queries `public.subscriptions` via the existing `SUBSCRIPTION_SELECT_COLUMNS`/`SubscriptionRow` from `subscription-utils.ts` (same shape as the List/Details pages, `.neq("lifecycle_status", "archived")`), and renders all 6 sections in doc 03's exact order.
  - **Today's Financial Context** (real): active-subscription count, monthly/annual spend. Subscriptions can be billed in INR or USD — summing raw cost across currencies would silently produce a meaningless number, so totals are computed and displayed **grouped by currency** (via a `computeTotalsByCurrency` helper), never added together or converted. Uses the DB-trigger-computed `monthly_equivalent`/`annual_equivalent` columns directly (authoritative, since these rows already exist — unlike the Add page's necessary pre-save client-side estimate).
  - **AI Insights**: static empty-state copy only, no generated or hardcoded recommendation text.
  - **Upcoming Renewals** (real): top 5 by soonest `next_renewal_date`, with a "View all" link to `/subscriptions`.
  - **Recommended Reviews** (real): subscriptions where computed urgency is `upcoming`/`critical` OR `lifecycle_status === 'review_due'` — a simple, non-invented filter over already-derived fields, capped to 5, with its own "nothing needs attention" empty state.
  - **Shared Payment Activity**: static empty state only ("No shared payment activity yet"), no fake shared data.
  - **Potential Savings**: static placeholder copy only, no analytics.
  - A shared internal `SubscriptionListItem` sub-component (logo/fallback icon, name, cost, renewal date, `RenewalUrgencyBadge`) is reused by both Upcoming Renewals and Recommended Reviews rather than duplicating the row markup twice.
  - Zero-subscriptions state: rather than branching into a different page structure, all 6 sections still render (consistent layout/doc-03 hierarchy always visible), but Financial Context shows a friendly message + "Add your first subscription" CTA instead of stat numbers, and Upcoming Renewals/Recommended Reviews each show their own calm empty line — verified this reads as coherent, not broken or blank.
  - BR-001: no cancel/renew/downgrade controls anywhere on the page — the only interactive elements are pure navigation (row click → subscription details, "View all" → My Subscriptions, "Add your first subscription" → the Add flow).
  - Doc 06 (Component Library) wasn't in the repo, so card styling reuses the exact `rounded-lg border border-border bg-card p-6` section pattern already established in `SubscriptionDetailsPage.tsx`, rather than inventing new one-off styling.

**Verification:**
- `npm run build`: passes (exit 0, same pre-existing bundle-size advisory, no errors).
- `npm run lint`: same 4 pre-existing errors as every prior phase, no new ones.
- Manual smoke test (headless Chromium): a fake session gets 401'd by the real backend on every read (same limitation as Phases 2-4), which only exercises the error branch — not enough to actually verify the interesting logic here (currency grouping, urgency filtering, the empty state). So this time, intercepted the `subscriptions` REST call directly (Playwright `page.route`) and fulfilled it with realistic mock rows spanning both currencies, all three urgency tiers, and a `review_due` status, to actually exercise the real rendering logic rather than only its failure path. Confirmed: all 6 sections render in the correct order; INR and USD totals shown as separate, correctly-labeled figures (never summed together); urgency badges match expected tiers (Critical/Upcoming/Normal); Recommended Reviews correctly includes a `review_due` item despite its renewal being 90 days out, and correctly excludes a normal/active item with no upcoming renewal; the empty-state screenshot (0 rows) shows a coherent, non-blank page with a clear "Add your first subscription" CTA; a scripted scan of the populated page's text confirmed no cancel/renew/downgrade wording anywhere (BR-001); zero non-401 console errors in either state.

**Commit:** (see next entry — logged automatically by the post-commit hook)

---

## 2026-07-22 — Fix: unreadable native &lt;select&gt; dropdowns

**Prompt:**
Bug found during manual testing of Phase 4: the Currency and Payment Method dropdowns in AddSubscriptionPage (and by extension every native `<select>` introduced in Phase 4) render unreadable option text — light text on the browser's default white popup background, only visible on hover via the browser's own highlight. Fix by replacing every native `<select>`/`<option>` from Phase 4 with a proper shadcn/ui-style Select component built on the same `@base-ui/react` primitive family already used by `Dialog`/`DropdownMenu` in this project, rather than patching it with `<option>` CSS (unreliable across browsers). Check all of them, not just the two screenshotted.

**What was done:**
- There was no pre-existing Select component in `src/components/ui/` (checked directly rather than assuming from the bug report's phrasing) — confirmed `@base-ui/react/select` is installed with the same part-based API shape as the `dialog.tsx`/`dropdown-menu.tsx` primitives already in this codebase, and built `src/components/ui/select.tsx` (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`) matching their existing conventions exactly: `data-slot` attributes, `cn()` class merging, the same popup styling (`rounded-lg bg-popover ring-1 ring-foreground/10`, `data-open`/`data-closed` animation classes) and the same trigger sizing as `Input`/the native selects it replaces.
- Audited both Phase 4 files for every native `<select>` rather than trusting the bug report's two named examples — found and replaced all 6 (3 in `AddSubscriptionPage.tsx`: Currency, Billing Frequency, Payment Method; 3 in `SubscriptionDetailsPage.tsx`'s edit mode: the same three fields). Removed the now-unused `selectClassName` constant from both files. `SelectValue` uses the render-prop form (`{(value) => LABEL_MAP[value]}`) so the trigger shows the human label (e.g. "App Store"), not the raw enum value (`app_store`).

**Verification:**
- `npm run build`: passes (exit 0, same pre-existing bundle-size advisory) — confirms the generic `Select<Value>` typing checks out against real usage in both files.
- `npm run lint`: same 4 pre-existing errors, no new ones.
- Manual smoke test (headless Chromium, same fake-session technique as the rest of Phase 4): opened all three selects on the Add page and confirmed dark, fully-readable popovers with a highlighted+checkmarked selected item (screenshots), and did a full click-to-select round trip (selected "App Store", popover closed, trigger updated) with zero console errors. The `SubscriptionDetailsPage` edit-mode selects use the byte-identical pattern and passed the same TypeScript check, but weren't visually confirmed themselves — they only render once a real subscription row loads, which needs a real session (same limitation flagged throughout Phase 4).

**Commit:** (see next entry — logged automatically by the post-commit hook)

---

## 2026-07-22 — Phase 4: Subscription Management

**Prompt:**
Implement Phase 4 (Subscription Management) for SubSense per 16_Implementation_Roadmap and docs 03/06/10/11. My Subscriptions (`/subscriptions`): replace `SubscriptionsDemo`'s hardcoded array entirely with a real per-user query against `public.subscriptions`, RLS-scoped. Add Subscription (`/subscriptions/add`): catalog search, custom entry, annual cost preview, save with validation. Subscription Details (`/subscriptions/:id`): overview, billing, lifecycle status, view→edit; AI Insight/Shared Members/Reminder Context stay static placeholders (Phase 6/7/8 scope). Archive sets `lifecycle_status`/`archived_at`, doesn't delete — history must survive. Path A (direct Supabase client + RLS) per DEC-031, no Edge Function. Don't touch `AuthContext`/`ProtectedRoute`/shell components beyond wiring routes into `App.tsx`. No AI-generated insight text, no reminder scheduling, no shared-member editing.

Doc 10 wasn't in the repo, so the real schema (table name, columns, enum values) was obtained directly from the user rather than guessed or probed live, following the pattern from Phase 2/3: table is `public.subscriptions` (not `user_subscriptions`), with `catalog_id` (nullable FK to `subscription_catalog`, no denormalization — reads must join), `custom_name` (required when `catalog_id` is null), `cost`/`currency`/`billing_frequency` (`monthly | every_28_days | yearly | custom` — no weekly/quarterly), `custom_interval_days`, `next_renewal_date`, `payment_method`, `payment_reference_note`, `lifecycle_status` (`active | review_due | renewal_confirmed | paused | archived` — no `created`/`cancelled`, differs from doc 05's stale spec), server-trigger-computed `monthly_equivalent`/`annual_equivalent` (never sent on write), and `archived_at`. `currency` enum confirmed as `INR | USD` only; `payment_method` as `upi_autopay | card_emandate | app_store | manual`. Renewal urgency isn't a stored column — computed client-side, thresholds explicitly flagged by the user as a default (not frozen spec): critical ≤2 days, upcoming ≤7 days, reusing the existing two_day/seven_day reminder windows.

**What was done:**
- `src/features/subscriptions/subscription-utils.ts`: single source of truth for the real schema's types, label maps, and helpers (`computeRenewalUrgency`, `estimateAnnualCost` — explicitly a client-side estimate, not authoritative — `formatMoney`, `getDisplayName`/`getLogoUrl` for catalog-joined vs custom rows, and the shared `SUBSCRIPTION_SELECT_COLUMNS` join string used by both list and details reads).
- Updated `src/components/subscriptions/SubscriptionCard.tsx` in place to match the real `billing_frequency`/`lifecycle_status` enums (was still on Phase 1's placeholder enum, e.g. `weekly`/`quarterly`/`created`/`cancelled` that don't exist in the live schema); added a `customIntervalDays` prop so `billing_frequency = 'custom'` renders a real suffix (e.g. `/45d`) instead of a static label. Mapped the new `review_due` status to the amber "needs attention" color, alongside `active`/`renewal_confirmed` = green, `paused`/`archived` = gray — a judgment call, not a frozen spec.
- Deleted `src/components/subscriptions/SubscriptionsDemo.tsx`; replaced with `src/features/subscriptions/SubscriptionsListPage.tsx` (relocated to match the Phase 3 feature-page convention, since it's route-level logic, not a reusable component — its sibling pages Add/Details had to live there anyway). Real query: joins `subscription_catalog(name, logo_url)`, excludes `archived` rows, ordered by soonest renewal; loading/error/empty states; "Add Subscription" button navigates to `/subscriptions/add` (the Header's own placeholder button was left untouched, per the phase's shell-components restriction — this page-level button is the actual entry point this phase).
- `src/features/subscriptions/AddSubscriptionPage.tsx`: tabbed catalog-search (debounced `ilike` against `subscription_catalog`) vs. custom-name entry, shared billing/payment fields (cost, currency, billing frequency + conditional custom-interval-days, next renewal date, payment method, optional note), a live client-side annual-cost estimate labeled as such, client-side validation mirroring the DB check constraints, and insert via `user_id: appUser.id` (never denormalizing catalog name/logo per the user's explicit correction) → navigates to the new subscription's details page on success.
- `src/features/subscriptions/SubscriptionDetailsPage.tsx`: Overview/Billing/Lifecycle Status sections plus three static "Coming in a later phase" placeholders (AI Insight, Shared Members, Reminder Context). View→edit toggle covers billing/logistics fields only — identity (catalog link/custom name) and lifecycle status are not freely editable, since the only defined lifecycle transition this phase asked for is archive. Archive is a dedicated action behind a confirm `Dialog` (not a generic status dropdown), setting `lifecycle_status = 'archived'` + `archived_at = now()`, then navigating back to the list.
- Wired `/subscriptions`, `/subscriptions/add`, `/subscriptions/:id` into `App.tsx`'s existing `ProtectedRoute`/`AppLayout` layout route. `AuthContext`, `ProtectedRoute`, and the three shell components were not touched otherwise.
- Fixed two real bugs found during this work: (1) used `DialogTrigger` instead of `DialogClose` for the archive dialog's Cancel button — would have re-opened rather than closed it. (2) the debounced catalog-search effect and the details-page load effect both called `setState` synchronously as the first statement in a `useEffect` body, which the newer `react-hooks/set-state-in-effect` rule (part of this repo's `eslint-plugin-react-hooks`) correctly flags as a real anti-pattern, not just style noise — fixed by moving the "start searching" flag into the search input's `onChange` handler (a real event, not an effect), and by keying an inner `SubscriptionDetailsContent` component on `id` so React remounts (and naturally resets `loadState`) when navigating between two different subscriptions, instead of manually resetting state inside the effect.

**Verification:**
- `npm run build`: passes (exit 0; same pre-existing bundle-size advisory, no errors).
- `npm run lint`: back down to exactly the same 4 pre-existing errors as Phase 2/3 (confirmed no new errors from any Phase 4 file) — the two real `set-state-in-effect` violations above were fixed, not suppressed.
- Manual smoke test (headless Chromium, same fake-session technique as Phase 3, since no real Google-authenticated session is available in this environment): the fake token is correctly rejected by the real backend on every `subscriptions`/`subscription_catalog` read and the Add-page's insert attempt, which exercised and confirmed the graceful-degradation paths — the list page's error state, the details page's error/not-found state, and the Add page's "your account is still setting up" guard when `appUser` is null — all render correctly with zero non-401 console errors, no crashes. Also confirmed: tab switching, the custom-interval-days field appearing only for `billing_frequency = 'custom'`, the live annual-cost estimate computing correctly, and the sidebar's "My Subscriptions" item staying highlighted on `/subscriptions/add` (non-`end` `NavLink` matching a child route).
- Not verified here, needs a real session: actual catalog search results, a real insert succeeding end-to-end, real edit-save, real archive, and the true "not found" branch (an authenticated request for an id that legitimately doesn't/no-longer belongs to the caller returns 0 rows, vs. the 401-error branch exercised above) — same limitation flagged in Phases 2 and 3, worth a manual click-through before considering this phase fully signed off.

**Commit:** (see next entry — logged automatically by the post-commit hook)

---

## 2026-07-22 — Phase 3: App Shell and Navigation

**Prompt:**
Implement Phase 3 (App Shell and Navigation) for SubSense per 16_Implementation_Roadmap, 03_Information_Architecture, and 06_Component_Library. Build the authenticated app shell (header, sidebar, responsive nav, profile menu, layout) and route to the primary modules — no module gets real feature content except My Subscriptions (already exists). Routing correction: move `SubscriptionsDemo` from `/` to `/subscriptions` (Decision Workspace, not My Subscriptions, is the default authenticated destination per doc 03); `/` becomes a Decision Workspace placeholder (Phase 5 builds the real thing). Primary nav in order: Decision Workspace (`/`), My Subscriptions (`/subscriptions`), Shared Subscriptions (`/shared`), Insights (`/insights`), Profile (`/profile`) — explicitly no Developer/Test Utilities item. Build `Header.tsx` (C-001: logo, profile menu off `AuthContext` profile data with email fallback, sign-out, disabled Search/Add Subscription/Notifications placeholders), `Sidebar.tsx` (C-002: 5 nav items, active-route highlighting, expand/collapse), `AppLayout.tsx` (composes Header + Sidebar + `<Outlet />`, responsive) in `src/components/shell/`. Wire `App.tsx`: `ProtectedRoute` wraps `AppLayout`, 5 routes nested inside via `<Outlet />`, `/auth` stays outside the shell. Placeholder pages for the other 4 modules: heading + "Coming in a later phase," existing tokens only. Read latest BUILD_LOG.md entry first; run build/lint after, fix real errors, log this entry before committing.

**What was done:**
- Created `src/components/shell/Sidebar.tsx`, `Header.tsx`, `AppLayout.tsx`.
- Created 4 placeholder pages: `src/features/decision-workspace/DecisionWorkspacePage.tsx`, `src/features/shared-subscriptions/SharedSubscriptionsPage.tsx`, `src/features/insights/InsightsPage.tsx`, `src/features/profile/ProfilePage.tsx`.
- Rewired `src/App.tsx`: `/auth` public and standalone; a pathless layout route (`ProtectedRoute` wrapping `AppLayout`) nests `/`, `/subscriptions`, `/shared`, `/insights`, `/profile` via `<Outlet />`. Removed the ad-hoc sign-out button (now lives in `Header`'s profile menu). `SubscriptionsDemo.tsx` itself untouched — only its route changed.
- Sidebar: active-item highlighting via `NavLink` (`bg-sidebar-primary`/`text-sidebar-primary-foreground`), desktop expand/collapse toggle (icon-only rail when collapsed), mobile overlay+backdrop (hidden by default below `lg:`, opened via Header's hamburger). All colors from the existing `--sidebar-*` tokens already in `index.css` — no new tokens needed.
- Header: hamburger (mobile only), wordmark, disabled Search/Add Subscription/Notifications placeholders (Phase 4/6 scope), profile dropdown (`Avatar` + `DropdownMenu`) reading `profile.display_name`/`profile.avatar_url` with fallback to `session.user.email` then initials, sign-out wired to `AuthContext.signOut`.
- Asked the user to confirm the exact `user_profiles` column names for display name/avatar before building the profile menu, rather than guessing or re-probing the DB (confirmed: `display_name`, `avatar_url`).

**Verification:**
- `npm run build`: passes (same pre-existing advisory chunk-size warning, no errors; exit code confirmed 0 directly after the fix below).
- `npm run lint`: same 4 pre-existing `react-refresh/only-export-components` errors as Phase 2 (3 in untouched shadcn files, 1 in `AuthContext.tsx` — confirmed no new errors from any Phase 3 file).
- Found and fixed a real bug during manual testing: `DropdownMenuLabel` (wraps base-ui's `Menu.GroupLabel`) was used outside a `<Menu.Group>`, throwing `MenuGroupContext is missing` and silently crashing the entire dropdown content (0 nodes rendered, no visible error in the UI). Fixed by wrapping it in `DropdownMenuGroup`. Also widened the dropdown from its default anchor-width (~32px, badly truncating the email) to `w-56`.
- Manual smoke test (headless Chromium, since no real Google-authenticated session is available in this environment): seeded a structurally-valid-but-unsigned fake Supabase session into `localStorage` to get past `ProtectedRoute`'s session check (the backend correctly 401s the fake token on the `users`/`user_profiles`/`user_preferences` reads, which exercises and confirms the email/initials fallback path in `Header`). Verified: all 5 routes render with correct active-nav highlighting; sidebar desktop collapse/expand; mobile hamburger opens/closes the sidebar overlay with backdrop; profile dropdown opens, shows full email, sign-out is styled destructive; `/auth` renders standalone with no shell chrome when signed out and auto-redirects to `/` when a session exists; visiting a protected route with no session at all correctly redirects to `/auth`. This confirms the shell/routing logic but is not a substitute for a real OAuth smoke test.

**Commit:** (see next entry — logged automatically by the post-commit hook)

---

## 2026-07-21 — Phase 2: Authentication and Profile

**Prompt:**
Implement Phase 2 (Authentication and Profile) for SubSense per 16_Implementation_Roadmap and 11_API_Integration_Architecture. Goals: Google Sign-In, first-login provisioning, profile/preferences load, protected routes. Critical rules: BR-002, BR-006, BR-007, BR-008. DB-side provisioning (`handle_new_user()` trigger) already exists — frontend must only read, never write provisioning logic. Build `AuthContext.tsx` (AuthProvider + `useAuth()` hook), `AuthPage.tsx` (Google Sign-In button), `ProtectedRoute.tsx` (session guard) in `src/features/auth/`. Wire `App.tsx` with `react-router-dom`: `/auth` public, `/` protected wrapping existing `SubscriptionsDemo` as an interim landing page. No header/sidebar/nav (Phase 3 scope), no new routes beyond `/auth` and `/`. Add a minimal sign-out control without touching `SubscriptionsDemo.tsx`. Run build/lint and confirm BR-002/006/007/008 compliance.

**What was done:**
- Created `src/features/auth/AuthContext.tsx`, `AuthPage.tsx`, `ProtectedRoute.tsx`.
- Wired `src/App.tsx`: `BrowserRouter`, `AuthProvider`, `/auth` and `/` routes, fixed-position sign-out button.
- Added `react-router-dom` dependency.
- Fixed a pre-existing TS5101 `baseUrl`-deprecated error that was hard-blocking `tsc -b` (added `"ignoreDeprecations": "6.0"` to `tsconfig.app.json` — TypeScript's own suggested one-line fix, no behavior change; a proper fix later would be switching `moduleResolution` to `"bundler"` to drop `baseUrl` entirely).

**Verification:**
- `npm run build`: passes (one advisory chunk-size warning only, not an error).
- `npm run lint`: 4 `react-refresh/only-export-components` errors — 3 pre-existing in shadcn-generated files (confirmed via `git diff HEAD`, untouched), 1 new in `AuthContext.tsx` (exports both `AuthProvider` and `useAuth` from one file, matching the requested file structure over lint-cleanliness; dev-fast-refresh-only impact, not correctness).
- Manual smoke test (user-performed): Google Sign-In round-trip completed successfully, landed on `/` with session active; new rows confirmed created in Supabase Table Editor for `public.users`, `public.user_profiles`, `public.user_preferences`; sign-out correctly returned to `/auth`.
- BR-002/006/007/008: all confirmed satisfied (protected route gates `/`, provisioning is fully DB-trigger-owned with no frontend write path, loading state + request-counter guard prevent stale/partial data exposure).

**Commit:** (see next entry — logged automatically by the post-commit hook)

**Commit logged:** `b01fae6` — "Phase 2: Google Sign-In, first-login provisioning, protected routes (BR-002/006/007/008)" (2026-07-21 23:55) — 10 files changed, 7056 insertions(+), 6721 deletions(-)

**Commit logged:** `82d00b8` — "Phase 3: App Shell and Navigation" (2026-07-22 19:16) — 9 files changed, 342 insertions(+), 48 deletions(-)

**Commit logged:** `b49d278` — "Fold in CLAUDE.md session-start instruction and BUILD_LOG.md commit trailer" (2026-07-22 19:19) — 2 files changed, 6 insertions(+)

**Commit logged:** `be6fa25` — "Phase 4: Subscription Management" (2026-07-22 20:53) — 9 files changed, 1343 insertions(+), 179 deletions(-)

**Commit logged:** `df59503` — "Phase 5: Decision Workspace, plus post-Phase-5 fixes and DEC-044 exit-motion timing" (2026-07-23 21:17) — 12 files changed, 443 insertions(+), 56 deletions(-)

**Commit logged:** `f769fb8` — "Log commit trailer for df59503 (Phase 5 + post-Phase-5 fixes + DEC-044 exit-motion)" (2026-07-23 21:21) — 1 file changed, 2 insertions(+)

**Commit logged:** `73f8d53` — "SubSense logo (DEC-055)" (2026-07-24 20:32) — 4 files changed, 67 insertions(+), 3 deletions(-)

**Commit logged:** `f9ada35` — "Email/password authentication, plus error-message and back-link fixes" (2026-07-24 20:35) — 7 files changed, 486 insertions(+), 58 deletions(-)
