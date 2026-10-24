import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Provide via: eval "$(bash scripts/load-local-env.sh)"
export const URL_ = process.env.TV_URL ?? 'http://127.0.0.1:54321';
export const ANON = process.env.TV_ANON_KEY ?? '';
export const SERVICE = process.env.TV_SERVICE_KEY ?? '';
export const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

export type TestUser = { id: string; email: string; token: string; client: SupabaseClient };
const run = Date.now().toString(36);

export async function makeUser(label: string, role?: 'admin' | 'viewer'): Promise<TestUser> {
  const email = `${label}.${run}@tv-test.local`;
  const password = 'Test-Password-123!';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error;
  if (role) await admin.from('profiles').update({ role }).eq('id', data.user.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error || !s.data.session) throw s.error;
  return { id: data.user.id, email, token: s.data.session.access_token, client };
}

export const PDF = () => new TextEncoder().encode(`%PDF-1.4\n% ${Math.random()}\ntrailer<<>>\n%%EOF\n`);

export async function fn(name: string, opts: { token?: string; json?: unknown; form?: FormData; query?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${URL_}/functions/v1/${name}${opts.query ?? ''}`, {
    method: 'POST', headers, body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.form,
  });
  const buf = new Uint8Array(await res.arrayBuffer());
  let body: any = null;
  try { body = JSON.parse(new TextDecoder().decode(buf)); } catch { /* binary */ }
  return { status: res.status, body, bytes: buf, headers: res.headers };
}

export async function upload(u: TestUser, title = 'Test doc', bytes = PDF(), mime = 'application/pdf', name = 'a.pdf') {
  const form = new FormData();
  form.set('file', new File([bytes], name, { type: mime }));
  form.set('title', title); form.set('category', 'contract');
  return fn('document-upload', { token: u.token, form });
}

export const auditCount = async (where: Record<string, string>) => {
  let q = admin.from('audit_events').select('id', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
  return (await q).count ?? 0;
};
