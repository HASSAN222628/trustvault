import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { Button, Field, useToast } from '@/components/ui/ui';
import { loginSchema, registerSchema } from '@/schemas';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

type F = z.infer<typeof registerSchema>;

export default function LoginPage() {
  const { status, notice } = useAuth();
  const loc = useLocation();
  const toast = useToast();
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const schemaFor = (m: typeof mode) => m === 'up' ? registerSchema : m === 'reset' ? loginSchema.pick({ email: true }).extend({ password: z.string().optional(), display_name: z.string().optional() }) : loginSchema.extend({ display_name: z.string().optional() });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<F>({
    resolver: (values, ctx, opts) => zodResolver(schemaFor(mode))(values, ctx, opts) as never,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (status === 'in') return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/'} replace />;

  const submit = handleSubmit(async (v) => {
    setMsg(null);
    setError(null);
    if (!supabaseConfigured) {
      setError('Supabase is not configured. Start your local Supabase project and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env, then restart the dev server.');
      return;
    }
    try {
      if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(v.email, { redirectTo: window.location.origin });
        if (resetError) setError(resetError.message);
        else setMsg('If that account exists, a reset link has been sent.');
        return;
      }
      const r = mode === 'up'
        ? await supabase.auth.signUp({ email: v.email, password: v.password, options: { data: { display_name: v.display_name } } })
        : await supabase.auth.signInWithPassword({ email: v.email, password: v.password });
      if (r.error) {
        if (mode === 'in') toast('err', 'Invalid email or password.');
        else if (/database error saving new user/i.test(r.error.message)) {
          setError('Supabase could not finish creating the account in the database. Apply all project migrations, especially the account trigger migration, then try again.');
        } else setError(r.error.message);
        return;
      }
      if (mode === 'up' && !r.data.session) {
        setMsg('Your account was submitted. This project requires email confirmation before you can sign in. Check your inbox and spam folder; if no message arrives, ask the project administrator to check Supabase SMTP settings.');
      }
    } catch {
      setError('Could not reach Supabase. Check that the configured Supabase URL is running and accessible, then try again.');
    }
  });

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6" noValidate>
        <div className="flex items-center gap-2 text-accent"><ShieldCheck className="h-6 w-6" /><span className="text-lg font-semibold text-ink">TrustVault</span></div>
        <h1 className="text-xl">{mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Reset password'}</h1>
        {notice && <p className="rounded-md bg-warn-soft p-2 text-sm text-warn" role="alert">{notice}</p>}
        {!supabaseConfigured && <p className="rounded-md bg-warn-soft p-2 text-sm text-warn" role="alert">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart the dev server.</p>}
        {error && <p className="rounded-md bg-danger-soft p-2 text-sm text-danger" role="alert">{error}</p>}
        {msg && <p className="rounded-md bg-ok-soft p-2 text-sm text-ok" role="status">{msg}</p>}
        {mode === 'up' && <Field id="dn" label="Display name" error={errors.display_name?.message}><input id="dn" className="field" {...register('display_name')} /></Field>}
        <Field id="em" label="Email" error={errors.email?.message}><input id="em" type="email" autoComplete="email" className="field" {...register('email')} /></Field>
        {mode !== 'reset' && <Field id="pw" label="Password" error={errors.password?.message}><input id="pw" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} className="field" {...register('password')} /></Field>}
        <Button type="submit" className="w-full" loading={isSubmitting} disabled={!supabaseConfigured}>{mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}</Button>
        <div className="flex justify-between text-sm text-accent">
          <button type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Create an account' : 'Back to sign in'}</button>
          {mode === 'in' && <button type="button" onClick={() => setMode('reset')}>Forgot password?</button>}
        </div>
      </form>
    </div>
  );
}
