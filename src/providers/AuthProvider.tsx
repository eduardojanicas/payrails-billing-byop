import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;

    if (!supabase) {
      setLoading(false);
      setSession(null);
      return;
    }
    const client = supabase;

    const bootstrap = async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!mounted) return;
        setSession(data.session ?? null);

        if (!data.session) {
          const { data: signInData } = await client.auth.signInAnonymously();
          if (!mounted) return;
          setSession(signInData.session ?? null);
        }
      } catch {
        if (!mounted) return;
        setSession(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void bootstrap();

    const { data: sub } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    session,
    user: session?.user ?? null,
    accessToken: session?.access_token ?? null,
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuthSession(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthSession must be used within AuthProvider');
  return ctx;
}
