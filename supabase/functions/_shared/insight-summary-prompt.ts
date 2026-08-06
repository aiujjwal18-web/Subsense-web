import type { InsightPrompt } from "./openai-client.ts"

export interface PortfolioSummaryContext {
  subscriptionCount: number
  currencyTotals: { currency: string; monthly: number; annual: number }[]
  duplicateCategories: string[]
  overlapCategories: string[]
  pricierThanAverage: { subscriptionName: string; category: string; currency: string }[]
}

// Mirrors insight-prompt.ts's structure and AI Experience Standard/Copy Tone rules
// (02_Experience_Strategy_v1.18, DEC-045). The spend total sentence is now templated
// directly from real numbers server-side (insights-generate-summary/index.ts's
// buildSpendLeadSentence) rather than asked of the model — a prior version had the
// model restate the currency totals itself and it would non-deterministically drop
// one when a portfolio had 2+ currencies. The model's only job here is a short
// qualitative framing sentence over the duplicate/overlap/pricier-than-average
// signals, and it is explicitly told never to restate a figure, currency symbol, or
// subscription count — insights-generate-summary/index.ts additionally enforces this
// with a code-level guard (never trusting the instruction alone), discarding the
// model's text and substituting a generic fallback sentence if it slips through.
const SYSTEM_PROMPT = `You are the AI Insight writer for SubSense, a personal subscription-tracking app. You write one short, grounded observation about a subscription portfolio's duplicate/overlap/pricing signals to help the user decide what's worth a look, not to decide for them.

AI Experience Standard — output must feel like guidance, not command:
Preferred tone: "Two of your subscriptions overlap in category." / "One of these is priced above the rest." / "You may want to review it."
Avoid: "Cancel this." / "This is bad." / "You must switch." / "We will cancel for you."

AI Copy Tone rules (apply all of these):
- Use only the facts given to you below — never invent a signal, category, or subscription name not present in the context.
- **Never state a number, currency symbol, or subscription count, even in passing** — a separate sentence elsewhere already states the exact spend total, and restating it yourself risks getting it wrong. Describe the duplicate/overlap/pricing signal in words only (e.g. "your Music subscriptions overlap" not "2 Music subscriptions overlap").
- Vary sentence opening and structure — do not reuse a generic template.
- Contractions are fine ("you're," "it's").
- No manufactured urgency — do not add words like "urgent," "act now," or exclamation points.
- Avoid corporate filler ("leverage," "simply," "seamless") and throat-clearing openers ("I have analyzed your portfolio and determined that..."). Lead with the fact.
- Never tell the user what to do in commanding language, and never claim you will take an action on their behalf.

Respond with strict JSON only, no markdown, no code fences, exactly this shape:
{"recommendation": "one short sentence framing the portfolio's duplicate/overlap/pricing signal in your own words, no numbers or currency symbols", "reason": "one short closing sentence highlighting the single most useful thing to look at, or noting there's nothing notable if that's true — same rule, no numbers or currency symbols"}`

export function buildPortfolioSummaryPrompt(context: PortfolioSummaryContext): InsightPrompt {
  // Spend totals are still given as context (so the model's framing can be
  // consistent with reality) but the model is explicitly told above never to restate
  // them — the actual figures reach the user via the templated lead sentence instead.
  const totalsLine = context.currencyTotals.length
    ? context.currencyTotals
        .map((t) => `${t.monthly.toFixed(2)} ${t.currency} per month (${t.annual.toFixed(2)} ${t.currency} per year)`)
        .join("; ")
    : "no active subscriptions"

  const duplicateLine = context.duplicateCategories.length
    ? `Exact duplicate subscriptions (same catalog entry) exist in: ${context.duplicateCategories.join(", ")}.`
    : "No exact duplicate subscriptions."

  const overlapLine = context.overlapCategories.length
    ? `Category overlap (2+ subscriptions in the same category) exists in: ${context.overlapCategories.join(", ")}.`
    : "No category overlap."

  const pricierLine = context.pricierThanAverage.length
    ? `Subscriptions priced above their own category's average: ${context.pricierThanAverage
        .map((p) => `${p.subscriptionName} (${p.category})`)
        .join(", ")}.`
    : "No subscription is priced notably above its category average."

  const user = `Portfolio: ${context.subscriptionCount} active subscription${context.subscriptionCount === 1 ? "" : "s"}.
Spend (context only — do not restate this in your response): ${totalsLine}.
${duplicateLine}
${overlapLine}
${pricierLine}

Write the JSON response described in your instructions for this portfolio.`

  return { system: SYSTEM_PROMPT, user }
}
