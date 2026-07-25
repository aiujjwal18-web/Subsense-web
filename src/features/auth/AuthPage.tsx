import { useState, type FormEvent } from "react"
import { Link, Navigate } from "react-router-dom"

import { KineticText } from "@/components/brand/KineticText"
import { LogoIcon } from "@/components/brand/LogoIcon"
import { SparklesCore } from "@/components/ui/sparkles"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getAuthErrorMessage } from "@/features/auth/auth-error"
import { useAuth } from "@/features/auth/AuthContext"

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
      <div className="pointer-events-none absolute inset-0">
        <SparklesCore id="auth-sparkles" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center gap-16 lg:flex-row lg:items-center lg:justify-between">
        {/* Hero — standalone brand messaging, not a card header */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <div className="flex items-center gap-4">
            <LogoIcon className="size-16 shrink-0" />
            <KineticText
              text="SubSense"
              className="font-heading text-5xl font-semibold text-foreground"
            />
          </div>
          <p className="mt-5 max-w-sm text-base text-muted-foreground">
            Sign in to track your subscriptions.
          </p>
        </div>

        {/* Sign-in card — offset right, with real breathing room from the edge */}
        <div className="w-full max-w-sm shrink-0 lg:mr-8 xl:mr-16">
          <div className="rounded-lg border border-border bg-card/85 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-md">
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
                  <TabsList className="w-full">
                    <TabsTrigger value="signin">Sign in</TabsTrigger>
                    <TabsTrigger value="signup">Create account</TabsTrigger>
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
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="signin-password">Password</Label>
                        <Input
                          id="signin-password"
                          type="password"
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          className="mt-1.5"
                        />
                        <Link
                          to="/auth/forgot-password"
                          className="mt-1.5 inline-block text-xs text-primary hover:underline"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      {formError && <p className="text-sm text-destructive">{formError}</p>}
                      <Button type="submit" disabled={submitting} className="w-full">
                        {submitting ? "Signing in…" : "Sign in"}
                      </Button>
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
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="signup-password">Password</Label>
                        <Input
                          id="signup-password"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="signup-confirm-password">Confirm password</Label>
                        <Input
                          id="signup-confirm-password"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                      {formError && <p className="text-sm text-destructive">{formError}</p>}
                      <Button type="submit" disabled={submitting} className="w-full">
                        {submitting ? "Creating account…" : "Create account"}
                      </Button>
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
                  className="mt-6 w-full"
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
  )
}
