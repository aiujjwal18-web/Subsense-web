# CLAUDE.md — Subsense-web

Project-level instructions for Claude Code. Follow these with no deviations.

## Animation library: Motion only

This project uses **Motion** (the current name for what was formerly Framer Motion) as its one and only animation library. Import it as:

import { motion } from "motion/react"

Never introduce GSAP, react-spring, anime.js, or any other animation library into this project, even if:
- The `taste-skill` design-guidance skill suggests GSAP code skeletons or patterns.
- A tutorial, example, or your own training data defaults to GSAP for a specific effect.
- It seems like it would produce a "better" result for a particular animation.

If `taste-skill` (or any other source) suggests a GSAP-based pattern, translate the underlying design intent — variance, timing, easing — into an equivalent Motion implementation instead. Do not add GSAP as a dependency under any circumstance, and do not present it as an option to the user. This decision is final for this project.

### Why
Motion has far greater adoption in the React ecosystem (~35M weekly downloads vs. GSAP's ~3M) and its declarative, component-driven API matches this project's actual animation needs: button/card hover and press states, toast/dialog enter-exit, a capped staggered list entrance. Nothing in this project involves scroll-driven storytelling or complex timelines, which is where GSAP would actually earn its keep. Running two animation libraries in one small app adds bundle size and complexity for no benefit here.

## Design system reference

The project's exact design tokens (colors, spacing, radius, typography, motion timing) are defined in `src/index.css` and are the source of truth. Do not invent new colors, spacing values, or timing values outside what's already defined there. If a genuinely new value is needed, ask before adding it rather than guessing.

## Session start: read BUILD_LOG.md first

Before starting any new task in this project — even if the user's prompt seems self-contained — read the most recent 1-2 entries at the top of `BUILD_LOG.md` (entries are most-recent-first, right under "## Entry template"). This tells you what was last built, how it was verified, and what phase/step is next, without the user needing to re-explain context. If the user's new prompt already states what to do, just do it — but still skim the log so you don't contradict or duplicate recent work (e.g. redoing something already done, or reintroducing something deliberately reverted). If BUILD_LOG.md's latest entry doesn't make the next step obvious, check `19_SubSense_Claude_Project_Instructions` and `16_Implementation_Roadmap` in the IIT Capstone docs folder for the phase plan, rather than asking the user to repeat themselves.

## Traceability: update BUILD_LOG.md every task

Before committing the result of any non-trivial prompt (a new feature, a bug fix, a refactor — not a one-line typo fix), append an entry to `BUILD_LOG.md` at the repo root using the template already at the top of that file: the prompt you were given (or a faithful summary if very long), a bullet list of what you actually built/changed, and how you verified it (build/lint/test results, manual checks). Put the new entry directly under "## Entry template", above the most recent existing entry (most-recent-first order). This is a standing project requirement, not optional — the point is that every future session can reconstruct what happened and why without re-reading the whole chat history. A git `post-commit` hook separately appends a one-line commit record automatically; your fuller entry is the part that captures intent and reasoning, which the hook can't.