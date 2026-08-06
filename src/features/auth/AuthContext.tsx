import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { Session } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"

export interface AppUser {
  id: string
  auth_user_id: string
  [key: string]: unknown
}

export interface UserProfile {
  id: string
  user_id: string
  is_premium: boolean
  premium_expires_at: string | null
  premium_source: "razorpay_test_mode" | "manual_grant"
  [key: string]: unknown
}

export interface UserPreferences {
  id: string
  user_id: string
  [key: string]: unknown
}

interface AuthContextValue {
  session: Session | null
  appUser: AppUser | null
  profile: UserProfile | null
  preferences: UserPreferences | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  signInWithPassword: (
    email: string,
    password: string
  ) => ReturnType<typeof supabase.auth.signInWithPassword>
  signUpWithPassword: (
    email: string,
    password: string
  ) => ReturnType<typeof supabase.auth.signUp>
  resetPasswordForEmail: (
    email: string
  ) => ReturnType<typeof supabase.auth.resetPasswordForEmail>
  updatePassword: (password: string) => ReturnType<typeof supabase.auth.updateUser>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [loading, setLoading] = useState(true)

  // Bumped on every session change so a slower, stale request can't overwrite
  // state set by a newer one (e.g. sign-out immediately followed by sign-in).
  const requestIdRef = useRef(0)
  // Tracks the identity (auth user id, or null if signed out) applySession last ran
  // for — lets the listener below tell a genuine identity change apart from Supabase
  // re-notifying the same session. See the listener's comment for why that
  // distinction matters.
  const appliedUserIdRef = useRef<string | null>(null)

  const applySession = useCallback(async (nextSession: Session | null) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setSession(nextSession)

    if (!nextSession) {
      setAppUser(null)
      setProfile(null)
      setPreferences(null)
      setLoading(false)
      appliedUserIdRef.current = null
      return
    }

    // public.users is provisioned server-side by the on_auth_user_created
    // trigger; this only ever reads, never writes (BR-006/BR-007).
    const { data: userRow } = await supabase
      .from("users")
      .select("*")
      .eq("auth_user_id", nextSession.user.id)
      .maybeSingle()

    if (requestIdRef.current !== requestId) return

    if (!userRow) {
      setAppUser(null)
      setProfile(null)
      setPreferences(null)
      setLoading(false)
      // Deliberately left unset (not nulled) — a users-row-provisioning race means
      // no identity actually resolved yet, so a later re-notification for this same
      // session should retry the full lookup above, not be treated as "unchanged".
      return
    }

    setAppUser(userRow)

    const [{ data: profileRow }, { data: preferencesRow }] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("user_id", userRow.id).maybeSingle(),
      supabase.from("user_preferences").select("*").eq("user_id", userRow.id).maybeSingle(),
    ])

    if (requestIdRef.current !== requestId) return

    setProfile(profileRow ?? null)
    setPreferences(preferencesRow ?? null)
    setLoading(false)
    appliedUserIdRef.current = nextSession.user.id
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      applySession(initialSession)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Supabase's own client re-notifies subscribers on every tab/window
      // visibilitychange-to-visible, not just on a real sign-in/out — confirmed via
      // @supabase/auth-js's GoTrueClient._onVisibilityChanged -> _recoverAndRefresh,
      // which fires SIGNED_IN (session not near expiry) or TOKEN_REFRESHED (session
      // near expiry) on essentially every tab refocus. Running the full applySession
      // reset for these blanked the entire app on every tab switch: setLoading(true)
      // makes ProtectedRoute render its full-screen spinner over everything, then
      // users/user_profiles/user_preferences get needlessly re-fetched — this was the
      // actual cause of the reported "full reload on navigation" (it's not a route
      // remount at all, and confirmed not to fire from in-app navigation). Only run
      // the full reset when the identity actually changed; otherwise just keep the
      // refreshed token current.
      const nextUserId = nextSession?.user.id ?? null
      if (nextUserId === appliedUserIdRef.current) {
        setSession(nextSession)
        return
      }
      applySession(nextSession)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [applySession])

  // Narrow additive re-fetch of just user_profiles, used after a successful premium
  // purchase so the tier reflects immediately without a full applySession/page reload.
  const refreshProfile = useCallback(async () => {
    if (!appUser) return
    const { data: profileRow } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", appUser.id)
      .maybeSingle()
    setProfile((profileRow as UserProfile | null) ?? null)
  }, [appUser])

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({ provider: "google" })
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password })
  }, [])

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    return supabase.auth.signUp({ email, password })
  }, [])

  const resetPasswordForEmail = useCallback(async (email: string) => {
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    return supabase.auth.updateUser({ password })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        appUser,
        profile,
        preferences,
        loading,
        refreshProfile,
        signInWithGoogle,
        signOut,
        signInWithPassword,
        signUpWithPassword,
        resetPasswordForEmail,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
