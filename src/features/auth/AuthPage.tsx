import { useState, type FormEvent } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Link, Navigate } from "react-router-dom"

import { LogoIcon } from "@/components/brand/LogoIcon"
import { Button } from "@/components/ui/button"
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getAuthErrorMessage } from "@/features/auth/auth-error"
import { useAuth } from "@/features/auth/AuthContext"
import { cn } from "@/lib/utils"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.6 5.6 0 0 1-2.4 3.68v3h3.86c2.26-2.09 3.56-5.17 3.56-8.92Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.86-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.39l3.98-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l3.98 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}

// Shared shape for all 3 password fields (sign-in, sign-up, sign-up
// confirm) — same input + show/hide-eye-button pattern each time, only the
// id/value/visibility state differ. `placeholder` is optional since the
// confirm-password field isn't in scope for placeholder copy.
function PasswordField({
  id,
  autoComplete,
  value,
  onChange,
  placeholder,
  visible,
  onToggleVisible,
}: {
  id: string
  autoComplete: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  visible: boolean
  onToggleVisible: () => void
}) {
  return (
    <div className="relative mt-1.5">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pr-9"
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

// Two independent pill buttons rather than one shared-track segmented
// control — beats the shared Tabs primitive's own baked-in data-active
// styling (bg-background / dark:bg-input etc.) by targeting the exact same
// variant-chain slots so tailwind-merge actually dedupes them, rather than
// letting both sets of classes coexist and fight over specificity.
function pillTabTriggerClass() {
  return cn(
    "flex-1 rounded-full border border-border/60 bg-transparent px-4 text-foreground/60",
    "data-active:border-primary/40 data-active:bg-primary/15 data-active:text-foreground data-active:shadow-none",
    "dark:border-border/60 dark:data-active:border-primary/40 dark:data-active:bg-primary/15 dark:data-active:text-foreground"
  )
}

export function AuthPage() {
  const { session, loading, signInWithGoogle, signInWithPassword, signUpWithPassword } =
    useAuth()

  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  const [showSigninPassword, setShowSigninPassword] = useState(false)
  const [showSignupPassword, setShowSignupPassword] = useState(false)
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false)

  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (mode === "signup" && password !== confirmPassword) {
      setFormError("Passwords don't match.")
      return
    }

    setSubmitting(true)
    const { data, error } =
      mode === "signin"
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password)
    setSubmitting(false)

    if (error) {
      setFormError(getAuthErrorMessage(error))
      return
    }

    if (mode === "signup" && !data.session) {
      setCheckEmail(true)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center overflow-hidden bg-background px-6 py-16 sm:px-10 lg:px-16 xl:px-20">
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center gap-16 lg:flex-row lg:items-center lg:justify-between">
        {/* Hero — standalone brand messaging, not a card header. LogoIcon
            sits outside the centered column so the wordmark and tagline
            center against each other's own width, not the icon+wordmark
            row's combined width. */}
        <div className="flex items-center gap-4">
          <LogoIcon className="size-16 shrink-0 self-start" />
          <div className="flex flex-col items-center">
            <span className="whitespace-nowrap font-heading text-5xl font-semibold">
              <span className="text-primary">Sub</span>
              <span className="bg-[linear-gradient(45deg,var(--primary),var(--secondary-accent))] bg-clip-text text-transparent">
                Sense
              </span>
            </span>
            <p className="mt-5 max-w-sm text-center text-base">
              <span className="text-foreground/70">Think wiser.</span>{" "}
              <span className="text-primary">Choose smarter.</span>
            </p>
          </div>
        </div>

        {/* Sign-in card — offset right, with real breathing room from the edge */}
        <div className="w-full max-w-sm shrink-0 lg:mr-8 xl:mr-16">
          <div className="relative">
            {/* Corner glow — the actual "glass" cue; blur alone barely reads
                against this dark a background. Sits outside the card's own
                overflow-hidden so it can bleed past the rounded edge. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-10 -left-10 -z-10 size-56 rounded-full bg-primary/30 blur-3xl"
            />

            {/* rounded-[28px]: a deliberate, one-off departure from the
                app's 8px radius standard (DEC-049) for this card only —
                not routed through --radius, so it won't drift if that
                token ever changes. To be recorded as a login-page visual
                exception, not applied anywhere else. */}
            <div className="relative overflow-hidden rounded-[28px] border border-border-strong bg-card/15 p-8 text-center shadow-2xl shadow-black/40">
              {/* Crisp top-edge highlight, separate from the ambient corner
                  glow above — a thin bright line fading toward both
                  corners, the classic "glass pane" edge cue. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent"
              />

              {/* Diagonal glass sheen */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent"
              />

              {/* text-shadow-lg compensates for the much lower card alpha
                  above — inherited by every descendant text node (labels,
                  tab text, button labels) rather than annotated one by
                  one, since text-shadow is an inherited CSS property. */}
              <div className="relative z-10 text-shadow-lg">
                {checkEmail ? (
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Check your email to confirm your account.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCheckEmail(false)
                        setMode("signin")
                        setPassword("")
                        setConfirmPassword("")
                        setFormError(null)
                      }}
                      className="mt-4 text-sm text-primary hover:underline"
                    >
                      ← Back to sign in
                    </button>
                  </div>
                ) : (
                  <>
                    <Tabs
                      value={mode}
                      onValueChange={(value) => {
                        setMode(value as "signin" | "signup")
                        setFormError(null)
                      }}
                    >
                      <TabsList className="w-full gap-2 bg-transparent p-0">
                        <TabsTrigger value="signin" className={pillTabTriggerClass()}>
                          Sign in
                        </TabsTrigger>
                        <TabsTrigger value="signup" className={pillTabTriggerClass()}>
                          Create account
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="signin" className="mt-4">
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
                          <div>
                            <Label htmlFor="signin-email">Email</Label>
                            <Input
                              id="signin-email"
                              type="email"
                              autoComplete="email"
                              required
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                              placeholder="Enter your email"
                              className="mt-1.5"
                            />
                          </div>
                          <div>
                            <Label htmlFor="signin-password">Password</Label>
                            <PasswordField
                              id="signin-password"
                              autoComplete="current-password"
                              value={password}
                              onChange={setPassword}
                              placeholder="Enter your password"
                              visible={showSigninPassword}
                              onToggleVisible={() => setShowSigninPassword((v) => !v)}
                            />
                            <Link
                              to="/auth/forgot-password"
                              className="mt-1.5 inline-block text-xs text-primary hover:underline"
                            >
                              Forgot password?
                            </Link>
                          </div>
                          {formError && <p className="text-sm text-destructive">{formError}</p>}
                          <InteractiveHoverButton
                            type="submit"
                            disabled={submitting}
                            text={submitting ? "Signing in…" : "Sign in"}
                            className="w-full"
                          />
                        </form>
                      </TabsContent>

                      <TabsContent value="signup" className="mt-4">
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
                          <div>
                            <Label htmlFor="signup-email">Email</Label>
                            <Input
                              id="signup-email"
                              type="email"
                              autoComplete="email"
                              required
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                              placeholder="Enter your email"
                              className="mt-1.5"
                            />
                          </div>
                          <div>
                            <Label htmlFor="signup-password">Password</Label>
                            <PasswordField
                              id="signup-password"
                              autoComplete="new-password"
                              value={password}
                              onChange={setPassword}
                              placeholder="Enter your password"
                              visible={showSignupPassword}
                              onToggleVisible={() => setShowSignupPassword((v) => !v)}
                            />
                          </div>
                          <div>
                            <Label htmlFor="signup-confirm-password">Confirm password</Label>
                            <PasswordField
                              id="signup-confirm-password"
                              autoComplete="new-password"
                              value={confirmPassword}
                              onChange={setConfirmPassword}
                              visible={showSignupConfirmPassword}
                              onToggleVisible={() => setShowSignupConfirmPassword((v) => !v)}
                            />
                          </div>
                          {formError && <p className="text-sm text-destructive">{formError}</p>}
                          <InteractiveHoverButton
                            type="submit"
                            disabled={submitting}
                            text={submitting ? "Creating account…" : "Create account"}
                            className="w-full"
                          />
                        </form>
                      </TabsContent>
                    </Tabs>

                    <div className="mt-6 flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">or</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="mt-6 w-full rounded-full"
                      onClick={() => signInWithGoogle()}
                    >
                      <GoogleIcon />
                      Continue with Google
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
