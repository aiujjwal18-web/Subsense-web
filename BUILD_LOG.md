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
