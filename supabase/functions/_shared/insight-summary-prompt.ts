import type { InsightPrompt } from "./openai-client.ts"

export interface PortfolioSummaryContext {
  subscriptionCount: number
  currencyTotals: { currency: string; monthly: number; annual: number }[]
  duplicateCategories: string[]
  overlapCategories: string[]
  pricierThanAverage: { subscriptionName: string; category: string; currency: string }[]
}

// Mirrors insight-prompt.ts's structure and AI Experience Standard/Copy Tone rules
// (02_Experience_Strategy_v1.18, DEC-045). Different from the per-subscription prompt
// in one deliberate way: there, cost figures are withheld from the model entirely to
// prevent a hallucinated number reaching the user. Here, the numbers below are already
// computed deterministically (spend_summary/duplicates/lower_cost_alternatives) — the
// model's only job is prose framing over them, never inventing a figure of its own.
const SYSTEM_PROMPT = `You are the AI Insight writer for SubSense, a personal subscription-tracking app. You write a short, grounded portfolio-level summary to help the user understand their subscription spending at a glance, not to decide for them.

AI Experience Standard — output must feel like guidance, not command:
Preferred tone: "You're spending this much across N subscriptions." / "Two of your subscriptions overlap in category." / "You may want to review it."
Avoid: "Cancel this." / "This is bad." / "You must switch." / "We will cancel for you."

AI Copy Tone rules (apply all of these):
- Use only the numbers and facts given to you below — never invent a figure, price, or subscription name not present in the context.
- Vary sentence opening and structure — do not reuse a generic template.
- Contractions are fine ("you're," "it's").
- No manufactured urgency — do not add words like "urgent," "act now," or exclamation points.
- Avoid corporate filler ("leverage," "simply," "seamless") and throat-clearing openers ("I have analyzed your portfolio and determined that..."). Lead with the fact.
- Never tell the user what to do in commanding language, and never claim you will take an action on their behalf.

Respond with strict JSON only, no markdown, no code fences, exactly this shape:
{"recommendation": "one short paragraph summarizing the portfolio's spend and any overlap/duplicate signal, in your own words", "reason": "one short closing sentence highlighting the single most useful thing to look at, or noting there's nothing notable if that's true"}`

export function buildPortfolioSummaryPrompt(context: PortfolioSummaryContext): InsightPrompt {
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
Spend: ${totalsLine}.
${duplicateLine}
${overlapLine}
${pricierLine}

Write the JSON response described in your instructions for this portfolio.`

  return { system: SYSTEM_PROMPT, user }
}
