import React, { createContext, useContext, useEffect, useState, forwardRef } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getUserProfile, getUserRoles, UserProfile, UserRole, AppRole } from "@/lib/supabase-helpers";
import { useDemo } from "@/contexts/DemoContext";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  roles: UserRole[];
  loading: boolean;
  isPasswordRecovery: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  primaryRole: AppRole | null;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = forwardRef<HTMLElement, { children: React.ReactNode }>(
  function AuthProvider({ children }, _ref) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const { isDemoMode, demoProfile, demoRoles, exitDemo } = useDemo();

  const loadUserData = async (userId: string) => {
    const [p, r] = await Promise.all([getUserProfile(userId), getUserRoles(userId)]);
    setProfile(p);
    setRoles(r);
  };

  const refreshProfile = async () => {
    if (user) await loadUserData(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        // Persist recovery flag so it survives page navigations / redirects
        try { sessionStorage.setItem('pw_recovery', '1'); } catch {}
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => loadUserData(session.user.id).finally(() => setLoading(false)), 0);
      } else {
        setProfile(null);
        setRoles([]);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      // Restore recovery flag from sessionStorage (survives Supabase redirect dance)
      try {
        if (sessionStorage.getItem('pw_recovery') === '1') {
          setIsPasswordRecovery(true);
        }
      } catch {}
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (isDemoMode) {
      exitDemo();
      return;
    }
    await supabase.auth.signOut();
  };

  // Use demo data when in demo mode
  const effectiveProfile = isDemoMode ? demoProfile : profile;
  const effectiveRoles = isDemoMode ? demoRoles : roles;
  const effectiveUser = isDemoMode ? ({ id: demoProfile?.id } as User) : user;
  const effectiveLoading = isDemoMode ? false : loading;

  const hasRole = (role: AppRole) => effectiveRoles.some((r) => r.role === role);

  const rolePriority: AppRole[] = ['agency_admin', 'scheduler', 'requester', 'interpreter'];
  const primaryRole = effectiveRoles.length > 0
    ? rolePriority.find((r) => hasRole(r)) ?? effectiveRoles[0].role
    : null;

  return (
    <AuthContext.Provider value={{
      session: isDemoMode ? ({} as Session) : session,
      user: effectiveUser,
      profile: effectiveProfile,
      roles: effectiveRoles,
      loading: effectiveLoading,
      isPasswordRecovery,
      signOut,
      refreshProfile,
      hasRole,
      primaryRole,
      isDemoMode,
    }}>
      {children}
    </AuthContext.Provider>
  );
});

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
