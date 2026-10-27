import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type AppRole = "student" | "moderator" | "admin" | "owner";
interface AuthState { session: Session | null; role: AppRole; loading: boolean }

const AuthContext = createContext<AuthState>({ session: null, role: "student", loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>("student");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setRole("student"); setLoading(false); } });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Role is read from the database (current_app_role RPC). UI use only: RLS/RPCs enforce the real rules.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    supabase.rpc("current_app_role").then(({ data }) => {
      if (!cancelled) { setRole((data as AppRole | null) ?? "student"); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [session?.user.id]);

  const value = useMemo(() => ({ session, role, loading }), [session, role, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
