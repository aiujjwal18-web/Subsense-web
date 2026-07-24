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

  const applySession = useCallback(async (nextSession: Session | null) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setSession(nextSession)

    if (!nextSession) {
      setAppUser(null)
      setProfile(null)
      setPreferences(null)
      setLoading(false)
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
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      applySession(initialSession)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [applySession])

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
