// Who may invoke the dev-utilities function.
//
// THIS FILE IS THE REAL SECURITY BOUNDARY. The client-side twin at
// src/features/dev-utilities/dev-allowlist.ts only decides what renders; anyone with a
// valid session JWT can POST to this function's URL directly and never load the page at
// all. A client-only check would leave the endpoint fully open.
//
// ⚠ KEEP IN SYNC with src/features/dev-utilities/dev-allowlist.ts. There is no shared
// import path between the two: tsconfig.app.json includes "src" only, while this runs on
// Deno with .ts-extension and jsr: specifiers. Neither runtime can import the other's
// modules, so this is a deliberate duplication — the same accepted tradeoff already
// documented for _shared/urgency.ts and WORKSPACE_BATCH_LIMIT. If you edit one list,
// edit both.
//
// Lowercase entries only — comparison lowercases the incoming address, so an entry with
// capitals here could never match.
const ALLOWED_EMAILS: readonly string[] = [
  "ai.ujjwal18@gmail.com",
  "ujjwal.chakrabarti18@gmail.com",
  "crazy.anu2008@gmail.com",
]

// Exact match after lowercasing — deliberately not a domain or prefix rule. A "@gmail.com
// endsWith" check would hand these utilities to every Gmail account on earth, and a
// startsWith check would match ai.ujjwal18@evil.example. Address normalisation (stripping
// dots or +tags) is intentionally NOT done: it would widen access beyond the three
// addresses actually approved.
export function isDevUtilitiesAllowed(email: string | null | undefined): boolean {
  if (!email) return false
  return ALLOWED_EMAILS.includes(email.trim().toLowerCase())
}
