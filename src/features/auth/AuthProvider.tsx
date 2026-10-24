import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/types';
import { AccessDenied } from '@/components/feedback/Pages';

type Auth = { status: 'loading' | 'out' | 'in'; session: Session | null; profile: Profile | null; notice: string | null; signOut: () => Promise<void> };
const Ctx = createContext<Auth | null>(null);
export const useAuth = () => { const c = useContext(Ctx); if (!c) throw new Error('AuthProvider missing'); return c; };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Pick<Auth, 'status' | 'session' | 'profile' | 'notice'>>({ status: 'loading', session: null, profile: null, notice: null });
  const manual = useRef(false);

  const load = useCallback(async (session: Session | null) => {
    if (!session) return setState((s) => ({ ...s, status: 'out', session: null, profile: null }));
    const { data } = await supabase.from('profiles').select('id,email,display_name,role').eq('id', session.user.id).maybeSingle();
    setState({ status: data ? 'in' : 'out', session, profile: (data as Profile | null), notice: null });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !manual.current) setState({ status: 'out', session: null, profile: null, notice: 'Your session ended. Please sign in again.' });
      else if (event !== 'TOKEN_REFRESHED') void load(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const signOut = useCallback(async () => { manual.current = true; await supabase.auth.signOut(); manual.current = false; }, []);
  return <Ctx.Provider value={{ ...state, signOut }}>{children}</Ctx.Provider>;
}

// UI convenience only. Real enforcement is RLS + Edge Functions.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <div className="grid min-h-screen place-items-center text-muted" role="status">Loading…</div>;
  if (status === 'out') return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { profile } = useAuth();
  return profile && roles.includes(profile.role) ? <>{children}</> : <AccessDenied />;
}
