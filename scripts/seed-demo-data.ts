// Creates demo documents through the REAL upload/grant functions (local only).
// Run after `supabase db reset`:  eval "$(bash scripts/load-local-env.sh)" && npm run seed:demo
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.TV_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.TV_ANON_KEY ?? '';
const PASSWORD = 'TrustVault-Demo-1!';
const PDF = (t: string) => new TextEncoder().encode(`%PDF-1.4\n% ${t}\ntrailer<<>>\n%%EOF\n`);

async function login(email: string) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return data.session.access_token;
}
async function call(name: string, token: string, body: BodyInit, json = false) {
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: 'POST', body, headers: { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) } });
  const out = await res.json();
  if (!res.ok) throw new Error(`${name}: ${JSON.stringify(out)}`);
  return out.data;
}
async function upload(token: string, title: string, category: string) {
  const f = new FormData();
  f.set('file', new File([PDF(title)], `${title.replace(/\W+/g, '-').toLowerCase()}.pdf`, { type: 'application/pdf' }));
  f.set('title', title); f.set('category', category); f.set('description', 'Fictional demo document');
  return (await call('document-upload', token, f)).id as string;
}
const grant = (token: string, id: string, email: string, permission: string) =>
  call('document-grant', token, JSON.stringify({ document_id: id, grantee_email: email, permission }), true);

const a = await login('owner.a@trustvault.test');
const b = await login('owner.b@trustvault.test');
const salary = await upload(a, 'Salary letter - Q4', 'salary');
const contract = await upload(a, 'Vendor contract 2026', 'contract');
await upload(b, 'Audit findings - Plant 2', 'audit');
await grant(a, salary, 'viewer.c@trustvault.test', 'read');
await grant(a, contract, 'editor.d@trustvault.test', 'edit');
console.log('Seeded demo documents and grants.');
