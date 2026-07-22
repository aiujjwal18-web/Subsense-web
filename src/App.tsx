import { BrowserRouter, Route, Routes } from "react-router-dom"

import { AppLayout } from "@/components/shell/AppLayout"
import { AuthProvider } from "@/features/auth/AuthContext"
import { AuthPage } from "@/features/auth/AuthPage"
import { ProtectedRoute } from "@/features/auth/ProtectedRoute"
import { DecisionWorkspacePage } from "@/features/decision-workspace/DecisionWorkspacePage"
import { InsightsPage } from "@/features/insights/InsightsPage"
import { ProfilePage } from "@/features/profile/ProfilePage"
import { SharedSubscriptionsPage } from "@/features/shared-subscriptions/SharedSubscriptionsPage"
import { AddSubscriptionPage } from "@/features/subscriptions/AddSubscriptionPage"
import { SubscriptionDetailsPage } from "@/features/subscriptions/SubscriptionDetailsPage"
import { SubscriptionsListPage } from "@/features/subscriptions/SubscriptionsListPage"

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DecisionWorkspacePage />} />
            <Route path="/subscriptions" element={<SubscriptionsListPage />} />
            <Route path="/subscriptions/add" element={<AddSubscriptionPage />} />
            <Route path="/subscriptions/:id" element={<SubscriptionDetailsPage />} />
            <Route path="/shared" element={<SharedSubscriptionsPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
