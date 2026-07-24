import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"

import { Logo } from "@/components/brand/Logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/features/auth/AuthContext"

export function ForgotPasswordPage() {
  const { resetPasswordForEmail } = useAuth()

  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    await resetPasswordForEmail(email)
    setSubmitting(false)
    // Always show the same confirmation regardless of outcome, so this
    // endpoint can't be used to enumerate which emails have accounts.
    setSubmitted(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center">
        <Logo className="justify-center" />

        {submitted ? (
          <p className="mt-8 text-sm text-muted-foreground">
            If an account exists for that email, we've sent a reset link.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your email and we'll send you a reset link.
            </p>
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4 text-left">
              <div>
                <Label htmlFor="forgot-password-email">Email</Label>
                <Input
                  id="forgot-password-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </>
        )}

        <Link
          to="/auth"
          className="mt-6 inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to sign in
        </Link>
      </div>
    </div>
  )
}
