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
