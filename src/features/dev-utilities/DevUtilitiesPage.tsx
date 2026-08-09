import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"

import { useAuth } from "@/features/auth/AuthContext"
import { isDevUtilitiesAllowed } from "./dev-allowlist"
import {
  IntegrationStatusPanel,
  SendReminderPanel,
  TestAiPanel,
  TestEmailPanel,
} from "./DevPanels"
import { RazorpayTestPanel } from "./RazorpayTestPanel"

// Hidden developer surface (Phase 11). Deliberately NOT in Sidebar's NAV_ITEMS —
// reachable only by typing /dev-utilities. It still renders inside ProtectedRoute +
// AppLayout, so it is authenticated and shares the app shell like every other route.
//
// Organizing principle: these five tools differ mainly in what they do to the outside
// world — one sends real email, one spends real OpenAI quota, one moves real (Test
// Mode) money, two are inert. That consequence is surfaced per section rather than
// buried in each tool's own copy, so the cost of clicking is legible before clicking.
// Sections are separated by rules rather than wrapped in cards: the page already sits
// inside AppLayout's own surface, and five same-shaped cards would flatten five
// genuinely different tools into one repeated template.

type Consequence = "inert" | "external"

// Text carries the meaning; color only reinforces it. Same rule the rest of the app
// follows for status (see RenewalUrgencyBadge's comment) — never color alone.
const CONSEQUENCE_CLASSES: Record<Consequence, string> = {
  inert: "text-muted-foreground",
  external: "text-[var(--chart-2)]",
}

interface UtilitySectionProps {
  title: string
  description: string
  consequence: string
  consequenceLevel: Consequence
  children: ReactNode
}

function UtilitySection({
  title,
  description,
  consequence,
  consequenceLevel,
  children,
}: UtilitySectionProps) {
  return (
    <section className="py-8 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
        <p className={`text-xs ${CONSEQUENCE_CLASSES[consequenceLevel]}`}>{consequence}</p>
      </div>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function DevUtilitiesPage() {
  const { session } = useAuth()

  // Read from the session rather than appUser: ProtectedRoute guarantees a session
  // exists before this component ever renders, so the address is available on the
  // FIRST render pass. appUser is loaded by a separate query and can still be null for
  // a tick, which would flash the panels before the redirect landed.
  //
  // This gate is inside the page component rather than wrapped around its <Route> so it
  // travels with the component — a second route pointing here later cannot forget it.
  //
  // Presentation only. The real boundary is the identical check inside the dev-utilities
  // Edge Function: a valid session JWT can POST to that URL directly without ever
  // loading this page, so removing the server check would leave the endpoint open no
  // matter what this returns.
  if (!isDevUtilitiesAllowed(session?.user?.email)) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Developer Utilities
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Not part of normal navigation. Everything here runs against the live project —
          the services these call are real, not mocked.
        </p>

        <div className="mt-10 divide-y divide-border">
          <UtilitySection
            title="Send Reminder Now"
            description="Creates a due reminder for one of your subscriptions and sends it immediately, instead of waiting for the hourly schedule."
            consequence="Sends real email"
            consequenceLevel="external"
          >
            <SendReminderPanel />
          </UtilitySection>

          <UtilitySection
            title="Test AI Response"
            description="Shows the exact prompt built for a subscription. Calling the model for real is a separate, explicit action."
            consequence="Free in dry run"
            consequenceLevel="inert"
          >
            <TestAiPanel />
          </UtilitySection>

          <UtilitySection
            title="Test Email Payload"
            description="Renders a notification template through the same code path that produces sent mail. Nothing is delivered."
            consequence="No side effects"
            consequenceLevel="inert"
          >
            <TestEmailPanel />
          </UtilitySection>

          <UtilitySection
            title="Test Razorpay Payment"
            description="The same upgrade flow as the Profile page, reachable from here. Test Mode only — no real charge is possible."
            consequence="Moves Test Mode money"
            consequenceLevel="external"
          >
            <RazorpayTestPanel />
          </UtilitySection>

          <UtilitySection
            title="Integration Status"
            description="Checks that Supabase, OpenAI, Resend and Razorpay each answer with the credentials this project holds."
            consequence="Read-only"
            consequenceLevel="inert"
          >
            <IntegrationStatusPanel />
          </UtilitySection>
        </div>
      </div>
    </div>
  )
}
