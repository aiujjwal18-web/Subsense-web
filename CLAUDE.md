# CLAUDE.md — Subsense-web

Project-level instructions for Claude Code. Follow these with no deviations. This file is read at the start of every session (see "Session start" below) — if anything here conflicts with a direct user instruction in the current chat, the user's direct instruction wins for that task, but flag the conflict rather than silently picking one.

## Skill discipline (mandatory)

Three skills are installed project-scoped under `.claude/skills/` (and mirrored under `.cursor/skills/` for Cursor): `impeccable`, `superpowers`, and `caveman`. They are not optional flavor — use them as follows, every session, without being asked:

### Design or UI work → `impeccable`, before writing code

Any task that touches visual design — new component, redesign, "make this bolder/quieter", "audit"/"critique"/"polish" a screen, color/typography/layout/motion changes — invoke `impeccable` first and apply it before touching code:

- **Register: this app is Product, not Brand**, per Impeccable's own register split (Brand = design IS the product, marketing/landing/portfolio; Product = design SERVES the product, app UI/dashboards/tools). Every screen in this app is Product register — familiarity and consistency are virtues here, not flaws. The three pre-authentication screens carry a narrow, explicitly documented exception (DEC-056, see Brand System below) — that exception does not make those screens Brand register, and it does not extend to any other screen.
- Run the **absolute-bans check** on anything you're about to ship: side-stripe borders, gradient text, glassmorphism used decoratively rather than purposefully, the hero-metric template, identical card grids, modal-as-first-thought. If you're about to write one of these, stop and restructure — don't ship it and mention it in passing.
- Run the **AI-slop test** (first-order: could someone guess the palette from the category alone; second-order: could someone guess the aesthetic family from category-plus-anti-references) on any new visual surface before considering it done.
- State which `impeccable` command lens you're applying (`audit`, `critique`, `polish`, `bolder`, `quieter`, etc.) when a request maps to one, so the review criteria are explicit rather than implied.

### Any non-trivial feature, bugfix, or refactor → `superpowers`, before writing code

"Non-trivial" means: anything beyond a one-line typo or copy fix. Invoke `superpowers` and follow its process:

1. **Brainstorm first** for new features — don't jump to implementation. State the approach and get confirmation (in chat is fine for a capstone project; a written design doc is optional here, use judgment on when it's worth it) before writing code.
2. **Systematic debugging first** for any bug — root cause before fix, per its four-phase process. Don't propose a fix before you've traced why the bug happens.
3. **Test-driven development, adapted to this project's real state**: this repo does not currently have a test runner configured. The Iron Law ("no production code without a failing test first") cannot be followed literally until that exists. Do not silently skip this — say so explicitly the first time it matters ("this project has no test framework set up; TDD as written requires one — set one up, or flag this as an accepted gap for a capstone timeline"), and let the user decide rather than quietly writing untested code as if the rule didn't apply.
4. **Verification before completion**: don't declare a task done on a claim — actually run the dev server, check the console, look at the real rendered output. This project's history (see BUILD_LOG.md) has caught more than one "verified on a technicality" claim that didn't hold up at normal viewing scale; don't repeat that pattern.

### `caveman` — opt-in only, not a default for this project

Only activate `caveman` when the user explicitly asks for it in a session ("talk like caveman", `/caveman`). Do not apply it by default to this project's chat responses. BUILD_LOG.md entries, commit messages, and any code/comments always stay in normal, complete prose regardless of caveman state — this matches `caveman`'s own stated boundaries (code/commits/PRs are written normally, never compressed).

## Never render a real third-party brand logo (DEC-059) — durable rule, not a one-time fix

No subscription card, catalog entry, or any other UI in this app ever renders a real per-service brand logo, brand-specific font, or anything styled to resemble a service's own logotype — this includes services added to the catalog in the future, not just the 31 rows that exist today. This closed a real trademark/IP exposure the earlier DEC-046 approach (fetching each service's actual logo from Simple Icons/Wikimedia) carried, even for a non-commercial capstone build.

Instead: every subscription card renders a fixed, generic Lucide icon keyed to the subscription's `category`, rendered inline as a component (no image, no URL, no network fetch) — `Tv` (Entertainment), `Headphones` (Music), `Briefcase` (Productivity), `BookOpen` (Education), `Wrench` (Utilities), `Bot` (AI Tools), `Layers` (Other). Full table in `05_Design_System`'s Icon System section. The subscription's real name still displays as plain text, but only in this app's own type system (Plus Jakarta Sans/Inter) — never a brand's own lettering.

`subscription_catalog.logo_url` (added under DEC-046) is deprecated — do not read it anywhere in new code, even though the column still exists in the schema (kept, unused, rather than dropped; see `10_Database_Architecture` for why). If you're adding a new catalog row or building a new component that shows a subscription's identity, use the category icon lookup, never `logo_url` or a freshly-fetched brand asset — the fact that fetching one would be technically easy is not a reason to reintroduce this.

## Brand System: DEC-065 "Cyber Lime" (current, supersedes DEC-057 "amber/white", which superseded "Ledger Dark" before that)

Full detail lives in `05_Design_System` (IIT Capstone docs folder — always check the current version number in `19_SubSense_Claude_Project_Instructions`, don't hardcode a version here). The essentials, so you don't have to open that doc for every small task. This table is live in `src/index.css` today, not a pending target — verify against that file if anything here looks off, don't assume this note is stale before checking.

### Colors

| Token | Hex | Use |
| --- | --- | --- |
| Page | `#050505` | App background — deepest layer |
| Surface 1 | `#121212` | Card, sidebar, nav bars |
| Surface 2 | `#1A1A1E` | Elevated surface, modal, dropdown, icon tile — distinct tier from Surface 1, reintroduced under DEC-065 |
| Primary | `#A3E635` ("Cyber Lime") | Default/rest primary button fill, active highlights, key metrics — pair with **dark text** (`#050505`), never Text Primary on this fill |
| Secondary Accent | `#38BDF8` ("Cool Steel Blue") | Wordmark gradient's second color, status-tag/interactive-state uses — deliberately not extended to Border Beam/GlowingEffect gradients (those recolor to Primary + Text Primary instead), keeping this blue exclusive to the wordmark |
| Text Primary | `#F1F5F9` ("Metallic Silver") | Body/heading text |
| Text Secondary | `#94A3B8` ("Muted Chrome") | Supporting text |
| Text Muted | `#737373` | Placeholders, captions — unchanged since DEC-057 |
| Accent Subtle Background | `rgba(163,230,53,0.15)` | Badge/pill background, checked-toggle track |
| Accent Subtle Text | `#A3E635` | Text on accent subtle background |
| Border / Border Strong | see `index.css` `--border` / `--border-strong` | Unchanged in role, values live in code |
| Status colors (Neutral/Amber/Green/Red) | `#94A3B8` / `#F59E0B` / `#059669` / `#DC2626` | Unchanged, deliberately independent of brand color — never substitute Primary for Status Amber even though they're visually close |

**Never use pure `#000` or `#fff` for a new surface** — Page and Surface 1/2 above are deliberately tinted, not pure black.

### Typography — four families, one role each, loaded and wired

| Role | Family | Weight | Use |
| --- | --- | --- | --- |
| Primary Display | Syne | Heavy/Ultra-Bold | Logo/wordmark, hero statements |
| Secondary Display | Cabinet Grotesk | Light/Regular | Section titles, headline complements |
| Primary Subhead & Action | Plus Jakarta Sans | Bold | Headers, card titles, button labels |
| Secondary Body & UI | Inter | Regular/Medium | Body copy, descriptions, dense/numeric UI |

All four are loaded and wired today via CSS custom properties in `index.css` (`--font-display`, `--font-display-secondary`, `--font-heading`, `--font-sans`) — unchanged since DEC-057, since DEC-065 doesn't touch fonts at all.

### Cards and buttons

- **Card standard (corrected per DEC-066):** opaque Surface 1 (`bg-card`), no blur, no translucency — this is the actual majority pattern across shipped page-level card instances. `SubscriptionCard.tsx`'s individual list tile is the one deliberate exception, using a translucent `bg-card/70 backdrop-blur-md` treatment — don't generalize that exception to other card types. **8px corner radius is unchanged** — no brand kit to date has specified a radius.
- **Primary button**: `#A3E635` fill with **dark text** (`#050505`) — never Text Primary on this fill.
- **Secondary button**: outline/transparent fill — check `index.css`'s live `--secondary`/`--secondary-foreground` values rather than assuming a specific hex here.

### Pre-authentication screens (login/signup/forgot/reset password) — no exception anymore (DEC-066)

These three screens used to carry their own separate visual treatment (DEC-056: sparkle particle background, glass card, kinetic/typewriter text, custom hover button). **That exception was fully retired under DEC-066** — confirmed live: the sparkle background is gone with no replacement (flat `bg-background`, same Page token as every other screen), and the `@tsparticles/*` packages it depended on are no longer in `package.json` at all. These screens now follow the same Card, Background, and Button standards as everywhere else in the app — treat them like any other screen, not a carve-out.

## Reference components — none are drop-in yet

Background is settled (DEC-058): no dot-grid, no animated background component of any kind. The main app uses the flat Page background token (`#050505`) and nothing else. Do not port the dot-grid reference file — it was dropped, not deferred.

Four remaining externally-sourced components were supplied as candidates (a fifth, Border Beam, was added this session — see below). None run as-is. Do the listed fix before using any of them, and don't skip straight to wiring one in because it "looks done":

1. **Gradient pill button** — references a `rotatingGradient` class/keyframe that was never supplied. Write the `@keyframes` rule (rotating a `--r` custom property or conic-gradient angle) before assuming this button actually animates.
2. **Glowing-border card — scoped, not global (DEC-058).** Already compatible, uses `motion/react` like everything else here. Still has Aceternity placeholder demo content (fake headings, "Aceternity UI Pro" copy) — replace with real content before use. Critically: this must only render on Subscription Cards whose renewal urgency is Critical or Upcoming (`computeRenewalUrgency` in `subscription-utils.ts` returns anything other than Normal — i.e. 7 days or fewer out). Normal-tier cards get the plain glass card, no glow, full stop. This is a real conditional in the component, not a CSS default applied everywhere — the whole point is that it signals urgency, not decoration.
3. **Collapsible sidebar** — uses `framer-motion` and Next.js `next/link`, both wrong for this project. Swap `framer-motion` imports to `motion/react` (same API), and `next/link`'s `<Link href>` to react-router-dom's `<Link to>`. The existing Sidebar (Phase 3, already has real nav items, active-route highlighting, and auth wiring) is not something this replaces automatically — decide extend-vs-replace before writing code.
4. **Border Beam — new, outer shell only, single instance (DEC-058).** A CSS `offset-path` perimeter-tracing animation (user-supplied, not from the original DEC-057 batch). Pure CSS plus the existing `cn` utility, no new package. Before use: (a) drop the demo file's oversized `bg-clip-text` gradient-text heading entirely — gradient text is a banned pattern per the `impeccable` skill, and that heading is marketing demo copy, not the component; (b) check whether this project's Tailwind setup is v3 (`tailwind.config.js`, matching the supplied snippet's `theme.extend.animation`/`keyframes` shape) or v4 (CSS `@theme`) before wiring the keyframe in — don't assume the snippet's config format matches this project's; (c) recolor `colorFrom`/`colorTo` off the demo's default `#ffaa40`/`#9c40ff` to the brand Primary/Secondary tokens — shipping the defaults is a real regression, that exact gradient reads as generic component-library output; (d) mount it exactly once on the outer app shell (e.g. `AppLayout`'s outer wrapper), never per-card and never per-screen-section. Keep it slow and low-contrast — it's meant to be a quiet, persistent brand signature, not a focal effect, and must not visually compete with the amber Primary button.

Two-tier motion rule from DEC-058, worth internalizing before touching either of these: exactly one always-on ambient motion in the whole app (the shell Border Beam) and exactly one state-conveying motion (the renewal-urgency card glow). Don't add a third kind of ambient/decorative motion anywhere else without a matching decision recorded in doc 08 first — that's exactly the flourish-stacking DEC-058 was written to prevent.

No new npm packages are required for any of these — `motion`, `react-router-dom`, and `lucide-react` are already installed. Verify this yourself with a `package.json` check rather than assuming from this note alone.

## Animation library: Motion only

This project uses **Motion** (the current name for what was formerly Framer Motion) as its one and only animation library. Import it as:

import { motion } from "motion/react"

Never introduce GSAP, react-spring, anime.js, or any other animation library into this project, even if:
- A design-guidance skill (including `impeccable`) suggests GSAP code skeletons or patterns.
- A tutorial, example, or your own training data defaults to GSAP for a specific effect.
- It seems like it would produce a "better" result for a particular animation.
- A reference component (see above) was originally written with `framer-motion` — convert the import, don't add the package.

If a source suggests a GSAP-based pattern, translate the underlying design intent — variance, timing, easing — into an equivalent Motion implementation instead. Do not add GSAP as a dependency under any circumstance, and do not present it as an option to the user. This decision is final for this project.

### Why
Motion has far greater adoption in the React ecosystem (~35M weekly downloads vs. GSAP's ~3M) and its declarative, component-driven API matches this project's actual animation needs: button/card hover and press states, toast/dialog enter-exit, a capped staggered list entrance. Nothing in this project involves scroll-driven storytelling or complex timelines, which is where GSAP would actually earn its keep. Running two animation libraries in one small app adds bundle size and complexity for no benefit here.

### `@tsparticles/*` — removed, not an active exception (DEC-066)

The login page's `SparklesCore` particle background and its three `@tsparticles/*` packages were removed entirely under DEC-066, alongside the rest of the pre-authentication screens' DEC-056 exception (see above) — confirmed not present in `package.json` and no `sparkles.tsx` file in the tree. Don't reinstall this set or reintroduce a particle background without a fresh decision recorded in doc 08 first. The dot-grid background candidate (see Reference Components above) stays dropped per DEC-058 regardless.

## Design system reference

The project's exact design tokens (colors, spacing, radius, typography, motion timing) are defined in `src/index.css` and are the source of truth once the DEC-057 migration lands (see Migration status above for current gap). Do not invent new colors, spacing values, or timing values outside what's already defined there or in the Brand System section above. If a genuinely new value is needed and neither source covers it, ask before adding it rather than guessing — and say so explicitly, the same way `impeccable`'s inferred-value notes above are flagged rather than silently assumed.

## Session start: read BUILD_LOG.md first

Before starting any new task in this project — even if the user's prompt seems self-contained — read the most recent 1-2 entries at the top of `BUILD_LOG.md` (entries are most-recent-first, right under "## Entry template"). This tells you what was last built, how it was verified, and what phase/step is next, without the user needing to re-explain context. If the user's new prompt already states what to do, just do it — but still skim the log so you don't contradict or duplicate recent work (e.g. redoing something already done, or reintroducing something deliberately reverted). If BUILD_LOG.md's latest entry doesn't make the next step obvious, check `19_SubSense_Claude_Project_Instructions`, `16_Implementation_Roadmap`, and `NEXT_SESSION_AGENDA.md` in the IIT Capstone docs folder for the phase plan and the current setup checklist, rather than asking the user to repeat themselves.

## Traceability: update BUILD_LOG.md every task

Before committing the result of any non-trivial prompt (a new feature, a bug fix, a refactor — not a one-line typo fix), append an entry to `BUILD_LOG.md` at the repo root using the template already at the top of that file: the prompt you were given (or a faithful summary if very long), which skills you invoked and why (per the Skill discipline section above — e.g. "Used impeccable to audit the new card component against the absolute-bans list" or "Used superpowers to root-cause the hover bug before fixing it"), a bullet list of what you actually built/changed, and how you verified it (build/lint/test results, manual checks at real viewing scale, not just zoomed screenshots). Put the new entry directly under "## Entry template", above the most recent existing entry (most-recent-first order). This is a standing project requirement, not optional — the point is that every future session can reconstruct what happened, why, and under what discipline, without re-reading the whole chat history. A git `post-commit` hook separately appends a one-line commit record automatically; your fuller entry is the part that captures intent, reasoning, and skill usage, which the hook can't.
