import type { InsightPrompt } from "./openai-client.ts"

export interface InsightContext {
  subscriptionName: string
  cost: number
  currency: string
  billingFrequency: string
  nextRenewalDate: string
  daysUntilRenewal: number
  lifecycleStatus: string
  isShared: boolean
  sharedMemberCount: number
}

// System prompt embeds doc 02's AI Experience Standard + AI Copy Tone rules
// (02_Experience_Strategy_v1.18, DEC-045) verbatim, plus BR-001's boundary
// ("AI never performs user actions" — guidance, not command, 00_Project_Governance).
// financial_impact is deliberately NOT requested here — it's computed server-side
// from real subscription columns in ai-generate-insight/index.ts, never asked of the
// model, so a hallucinated number can never reach a user.
const SYSTEM_PROMPT = `You are the AI Insight writer for SubSense, a personal subscription-tracking app. You write short, grounded observations about a single subscription to help the user decide whether to keep it, not to decide for them.

AI Experience Standard — output must feel like guidance, not command:
Preferred tone: "This subscription renews soon." / "You spend this amount annually." / "You may want to review it." / "Here is why this might matter."
Avoid: "Cancel this." / "This is bad." / "You must switch." / "We will cancel for you."

AI Copy Tone rules (apply all of these):
- Vary sentence opening and structure across cards — do not reuse the identical sentence skeleton every time (e.g. always "X renews on [date] for [cost]. You spend [annual] annually. You may want to review it.").
- State each figure once. Do not restate the same cost or date in a second phrasing within the same response.
- Contractions are fine ("you're," "it's").
- No manufactured urgency in the wording itself, even if the subscription is renewing very soon — do not add words like "urgent," "act now," or exclamation points to compensate. Any urgency signal is carried by the UI, not your text.
- Avoid corporate filler ("leverage," "simply," "seamless") and throat-clearing openers ("I have analyzed your subscription and determined that..."). Lead with the fact.
- Never tell the user what to do in commanding language, and never claim you will take an action on their behalf (you cannot cancel, pause, or modify anything — you only describe and suggest).

Respond with strict JSON only, no markdown, no code fences, exactly this shape:
{"recommendation": "one short paragraph covering the subscription's context and your insight, ending with a soft, non-commanding nudge toward reviewing it", "reason": "one short sentence explaining why this is worth a look"}`

export function buildInsightPrompt(context: InsightContext): InsightPrompt {
  const sharedLine = context.isShared
    ? `This subscription is shared with ${context.sharedMemberCount} other ${context.sharedMemberCount === 1 ? "person" : "people"}.`
    : "This subscription is not shared with anyone else."

  const timingLine =
    context.daysUntilRenewal < 0
      ? `It was due to renew ${Math.abs(context.daysUntilRenewal)} day${Math.abs(context.daysUntilRenewal) === 1 ? "" : "s"} ago.`
      : context.daysUntilRenewal === 0
        ? "It renews today."
        : `It renews in ${context.daysUntilRenewal} day${context.daysUntilRenewal === 1 ? "" : "s"}, on ${context.nextRenewalDate}.`

  const user = `Subscription: ${context.subscriptionName}
Cost: ${context.cost} ${context.currency} (${context.billingFrequency})
${timingLine}
Lifecycle status: ${context.lifecycleStatus}
${sharedLine}

Write the JSON response described in your instructions for this one subscription.`

  return { system: SYSTEM_PROMPT, user }
}
