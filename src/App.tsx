import { BrowserRouter, Route, Routes } from "react-router-dom"

import { SubscriptionsDemo } from "@/components/subscriptions/SubscriptionsDemo"
import { Button } from "@/components/ui/button"
import { AuthPage } from "@/features/auth/AuthPage"
import { AuthProvider, useAuth } from "@/features/auth/AuthContext"
import { ProtectedRoute } from "@/features/auth/ProtectedRoute"

function SignOutControl() {
  const { session, signOut } = useAuth()

  if (!session) return null

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="fixed top-4 right-4 z-50"
      onClick={() => signOut()}
    >
      Sign out
    </Button>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SignOutControl />
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <SubscriptionsDemo />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
