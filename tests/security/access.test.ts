import { beforeAll, describe, expect, it } from 'vitest';
import { admin, auditCount, fn, makeUser, PDF, TestUser, upload } from './helpers';

let A: TestUser, B: TestUser, C: TestUser, D: TestUser, E: TestUser, X: TestUser;
let docA: string;
const code = (r: { body: any }) => r.body?.error?.code;

beforeAll(async () => {
  [A, B, C, D, E, X] = await Promise.all([
    makeUser('ownera'), makeUser('ownerb'), makeUser('viewerc'), makeUser('editord'), makeUser('admine', 'admin'), makeUser('outsider'),
  ]);
  const up = await upload(A, 'Salary letter A');
  docA = up.body.data.id;
  expect((await fn('document-grant', { token: A.token, json: { document_id: docA, grantee_email: C.email, permission: 'read' } })).status).toBe(200);
  expect((await fn('document-grant', { token: A.token, json: { document_id: docA, grantee_email: D.email, permission: 'edit' } })).status).toBe(200);
});

describe('authentication', () => {
  it('rejects missing token', async () => expect(code(await fn('document-download', { json: { document_id: docA } }))).toBe('unauthenticated'));
  it('rejects garbage token', async () => expect((await fn('document-download', { token: 'a.b.c', json: { document_id: docA } })).status).toBe(401));
  it('rejects the anon key used as a bearer', async () => expect((await fn('document-download', { token: process.env.TV_ANON_KEY, json: { document_id: docA } })).status).toBe(401));
  it('ignores a forged actor in the body', async () => {
    const r = await fn('document-download', { token: X.token, json: { document_id: docA, actor_id: A.id, user_id: A.id } });
    expect(r.status).toBe(404);
    expect(await auditCount({ actor_id: A.id, outcome: 'denied', action: 'document.download' })).toBe(0);
  });
  it('cannot self-promote via profile update or signup metadata', async () => {
    const r = await X.client.from('profiles').update({ role: 'admin' }).eq('id', X.id);
    expect(r.error?.code).toBe('42501');
    const { data } = await admin.from('profiles').select('role').eq('id', X.id).single();
    expect(data?.role).toBe('owner');
    const s = await (await import('@supabase/supabase-js')).createClient(process.env.TV_URL!, process.env.TV_ANON_KEY!)
      .auth.signUp({ email: `meta.${Date.now()}@tv-test.local`, password: 'Test-Password-123!', options: { data: { role: 'admin' } } });
    const p = await admin.from('profiles').select('role').eq('id', s.data.user!.id).single();
    expect(p.data?.role).toBe('owner');
  });
});

describe('cross-user access (IDOR)', () => {
  it('outsider cannot read metadata directly via PostgREST', async () => {
    const r = await X.client.from('documents').select('*').eq('id', docA);
    expect(r.data).toEqual([]);
  });
  it('outsider/other owner download -> 404 not_found', async () => {
    for (const u of [X, B]) expect(code(await fn('document-download', { token: u.token, json: { document_id: docA } }))).toBe('not_found');
  });
  it('admin cannot download or read metadata', async () => {
    expect(code(await fn('document-download', { token: E.token, json: { document_id: docA } }))).toBe('not_found');
    expect((await E.client.from('documents').select('id').eq('id', docA)).data).toEqual([]);
  });
  it('edit / delete / grant / revoke by non-owners are refused', async () => {
    expect(code(await fn('document-edit', { token: X.token, json: { document_id: docA, title: 'pwn' } }))).toBe('not_found');
    expect(code(await fn('document-delete', { token: B.token, json: { document_id: docA } }))).toBe('not_found');
    expect(code(await fn('document-grant', { token: X.token, json: { document_id: docA, grantee_email: X.email, permission: 'edit' } }))).toBe('not_found');
    expect(code(await fn('document-revoke', { token: X.token, json: { document_id: docA, user_id: C.id } }))).toBe('not_found');
  });
  it('guessed ids and malformed ids do not leak', async () => {
    expect(code(await fn('document-download', { token: X.token, json: { document_id: crypto.randomUUID() } }))).toBe('not_found');
    expect(code(await fn('document-download', { token: X.token, json: { document_id: "1' or 1=1--" } }))).toBe('invalid_request');
  });
  it('search returns nothing for outsiders', async () => {
    const r = await X.client.rpc('search_documents', { p_query: 'Salary' });
    expect(r.data).toEqual([]);
  });
  it("cannot read another user's grants", async () => {
    expect((await X.client.from('document_permissions').select('*')).data).toEqual([]);
    expect((await C.client.from('document_permissions').select('*')).data?.length).toBe(1); // own grant only
  });
  it('clients cannot call trusted RPCs directly', async () => {
    const r = await X.client.rpc('rpc_document_delete', { p_actor: A.id, p_document: docA, p_request_id: 'x' });
    expect(r.error).not.toBeNull();
  });
});

describe('permission behaviour', () => {
  it('read grant: can download, cannot edit/delete/share', async () => {
    const d = await fn('document-download', { token: C.token, json: { document_id: docA } });
    expect(d.status).toBe(200);
    expect(d.headers.get('content-disposition')).toContain('attachment');
    expect(code(await fn('document-edit', { token: C.token, json: { document_id: docA, title: 'x' } }))).toBe('forbidden');
    expect(code(await fn('document-delete', { token: C.token, json: { document_id: docA } }))).toBe('forbidden');
    expect(code(await fn('document-grant', { token: C.token, json: { document_id: docA, grantee_email: X.email, permission: 'read' } }))).toBe('forbidden');
  });
  it('edit grant: can edit metadata + replace content, cannot delete', async () => {
    expect((await fn('document-edit', { token: D.token, json: { document_id: docA, title: 'Edited by D' } })).status).toBe(200);
    const form = new FormData(); form.set('file', new File([PDF()], 'n.pdf', { type: 'application/pdf' }));
    expect((await fn('document-edit', { token: D.token, form, query: `?document_id=${docA}` })).status).toBe(200);
    expect(code(await fn('document-delete', { token: D.token, json: { document_id: docA } }))).toBe('forbidden');
  });
  it('revocation blocks the very next download', async () => {
    expect((await fn('document-download', { token: C.token, json: { document_id: docA } })).status).toBe(200);
    expect((await fn('document-revoke', { token: A.token, json: { document_id: docA, user_id: C.id } })).status).toBe(200);
    const after = await fn('document-download', { token: C.token, json: { document_id: docA } });
    expect(after.status).toBe(404);
    expect(after.bytes.length).toBeLessThan(400); // JSON error, no file bytes
  });
  it('owner-only delete works and removes access', async () => {
    const up = await upload(A, 'To delete');
    expect((await fn('document-delete', { token: A.token, json: { document_id: up.body.data.id } })).status).toBe(200);
    expect(code(await fn('document-download', { token: A.token, json: { document_id: up.body.data.id } }))).toBe('not_found');
  });
});

describe('admin API', () => {
  it('non-admin cannot query audit or change roles', async () => {
    expect(code(await fn('admin-audit-query', { token: A.token, json: {} }))).toBe('forbidden');
    expect(code(await fn('admin-set-role', { token: A.token, json: { user_id: A.id, role: 'admin' } }))).toBe('forbidden');
  });
  it('admin can query audit but cannot change own role', async () => {
    expect((await fn('admin-audit-query', { token: E.token, json: { limit: 5 } })).status).toBe(200);
    expect(code(await fn('admin-set-role', { token: E.token, json: { user_id: E.id, role: 'viewer' } }))).toBe('forbidden');
    expect((await fn('admin-set-role', { token: E.token, json: { user_id: X.id, role: 'viewer' } })).status).toBe(200);
  });
});
