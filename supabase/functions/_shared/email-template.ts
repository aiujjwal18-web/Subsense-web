export type TemplateContext = Record<string, string | number>

// Collapses runs of repeated spaces/tabs left behind by an interpolated empty token
// (e.g. monthly_digest/lapsed_reengagement's `currency: ""` — see buildContext in
// send-reminder-email/index.ts) — a general robustness fix, not a one-off special case,
// since any future template/context combination producing an empty substitution would
// hit the same artifact.
function collapseWhitespace(text: string): string {
  return text.replace(/[ \t]{2,}/g, " ")
}

function interpolate(text: string, context: TemplateContext): string {
  const substituted = text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = context[key]
    return value === undefined ? match : String(value)
  })
  return collapseWhitespace(substituted)
}

export interface RenderedEmail {
  subject: string
  html: string
}

const DEFAULT_CTA_LABEL = "Open SubSense"
const DEFAULT_FOOTER_TEXT =
  "You're receiving this because you have an active SubSense account. Manage your notification preferences in Settings."

// Sourced verbatim from doc 25's 7 actual template blocks (25_SubSense_Resend_Notification_
// Templates_v1.1.html) — each reminder_type has its own CTA label and footer copy, not a
// single shared pair. reminder_dev_test is intentionally absent (doc 25 omits it — internal
// payload, never brand-styled — falls through to the DEFAULT_* pair above). Footer text for
// subscription-linked types embeds {{subscription_name}}, so it's run through interpolate()
// same as subject/body, not used as a raw literal.
const CTA_LABEL_BY_TYPE: Record<string, string> = {
  seven_day: "Review in SubSense",
  two_day: "Review in SubSense",
  renewal_day: "Review in SubSense",
  post_renewal_checkin: "Review in SubSense",
  shared_payment: "Mark as paid",
  monthly_digest: "Open Decision Workspace",
  lapsed_reengagement: "Take a look",
}

const FOOTER_TEXT_BY_TYPE: Record<string, string> = {
  seven_day:
    "You're getting this because you have reminders on for {{subscription_name}}. Manage reminder settings anytime in SubSense.",
  two_day:
    "You're getting this because you have reminders on for {{subscription_name}}. Manage reminder settings anytime in SubSense.",
  renewal_day:
    "You're getting this because you have reminders on for {{subscription_name}}. Manage reminder settings anytime in SubSense.",
  post_renewal_checkin:
    "You're getting this because you have reminders on for {{subscription_name}}. Manage reminder settings anytime in SubSense.",
  shared_payment: "You're getting this because you're a shared member on {{subscription_name}}. Manage this in SubSense.",
  monthly_digest: "You're getting this monthly digest because it's on by default. Turn it off anytime in SubSense settings.",
  lapsed_reengagement:
    "You're getting this because it's been a while since your last visit. Manage this anytime in SubSense settings.",
}

// Doc 25 (25_SubSense_Resend_Notification_Templates_v1.2.html) shell, reused verbatim —
// light-mode Cyber Lime tokens (DEC-073): #4D7C0F wordmark, #A3E635 button fill,
// #0F172A button text. IBM Plex Sans. notification_templates has no persistent Resend
// template object; subject/body (plain text, {{var}} tokens) are rendered into this
// shell at send time.
export function renderEmail(
  templateSubject: string,
  templateBody: string,
  context: TemplateContext,
  appUrl: string,
  reminderType: string
): RenderedEmail {
  const subject = interpolate(templateSubject, context)
  const body = interpolate(templateBody, context)
  const ctaLabel = CTA_LABEL_BY_TYPE[reminderType] ?? DEFAULT_CTA_LABEL
  const footerText = interpolate(FOOTER_TEXT_BY_TYPE[reminderType] ?? DEFAULT_FOOTER_TEXT, context)

  const html = `<div style="background-color:#F1F5F9; padding:40px 16px; font-family:'IBM Plex Sans', Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto; background-color:#FFFFFF; border:1px solid #E2E8F0; border-radius:8px; overflow:hidden;">
    <tr>
      <td style="padding:32px 32px 24px 32px;">
        <span style="font-family:'IBM Plex Sans', Helvetica, Arial, sans-serif; font-size:18px; font-weight:600; color:#4D7C0F; letter-spacing:-0.01em;">SubSense</span>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 8px 32px;">
        <h1 style="font-family:'IBM Plex Sans', Helvetica, Arial, sans-serif; font-size:20px; font-weight:600; color:#0F172A; margin:0 0 12px 0;">${subject}</h1>
        <p style="font-family:'IBM Plex Sans', Helvetica, Arial, sans-serif; font-size:15px; line-height:1.6; color:#0F172A; margin:0 0 24px 0;">${body}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 28px 32px;">
        <a href="${appUrl}" style="display:inline-block; font-family:'IBM Plex Sans', Helvetica, Arial, sans-serif; font-size:15px; font-weight:600; color:#0F172A; background-color:#A3E635; text-decoration:none; padding:12px 24px; border-radius:8px;">${ctaLabel}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 32px 32px; border-top:1px solid #E2E8F0; padding-top:20px;">
        <p style="font-family:'IBM Plex Sans', Helvetica, Arial, sans-serif; font-size:13px; line-height:1.6; color:#64748B; margin:0;">${footerText}</p>
      </td>
    </tr>
  </table>
</div>`

  return { subject, html }
}
