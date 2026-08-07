import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"

import { useAuth } from "@/features/auth/AuthContext"
import { useIdleTimeout } from "@/features/auth/useIdleTimeout"

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  // This component is the app's single layout route around AppLayout, so it stays
  // mounted across every authenticated navigation — the idle timer arms once on
  // sign-in and tears down on sign-out, rather than restarting on each route change.
  // Public /auth/* routes render outside it and are never covered.
  useIdleTimeout(Boolean(session))

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          role="status"
          aria-label="Loading"
          className="size-6 animate-spin rounded-full border-2 border-border border-t-primary"
        />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth" replace />
  }

  return <>{children}</>
}
