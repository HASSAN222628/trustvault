import { beforeAll, describe, expect, it } from 'vitest';
import { admin, auditCount, fn, makeUser, PDF, TestUser, upload } from './helpers';

let A: TestUser, X: TestUser, E: TestUser;
let docId: string, key: string;

beforeAll(async () => {
  [A, X, E] = await Promise.all([makeUser('au-a'), makeUser('au-x'), makeUser('au-e', 'admin')]);
  docId = (await upload(A, 'Audit doc')).body.data.id;
  key = (await admin.from('documents').select('storage_key').eq('id', docId).single()).data!.storage_key;
});

describe('audit trail', () => {
  it('records upload, download success and denial with trusted actor', async () => {
    await fn('document-download', { token: A.token, json: { document_id: docId } });
    await fn('document-download', { token: X.token, json: { document_id: docId } });
    expect(await auditCount({ actor_id: A.id, document_id: docId, action: 'document.upload' })).toBe(1);
    expect(await auditCount({ actor_id: A.id, document_id: docId, action: 'document.download', outcome: 'success' })).toBe(1);
    expect(await auditCount({ actor_id: X.id, document_id: docId, action: 'document.download', outcome: 'denied' })).toBe(1);
  });
  it('clients cannot insert, update or delete audit rows', async () => {
    const ins = await X.client.from('audit_events').insert({ actor_id: A.id, action: 'document.download', outcome: 'success', request_id: 'x', prev_hash: '0', event_hash: '0' });
    expect(ins.error?.code).toBe('42501');
    expect((await A.client.from('audit_events').update({ outcome: 'denied' }).eq('actor_id', A.id)).error?.code).toBe('42501');
    expect((await A.client.from('audit_events').delete().eq('actor_id', A.id)).error?.code).toBe('42501');
  });
  it('even the service role cannot update audit rows (append-only trigger)', async () => {
    const r = await admin.from('audit_events').update({ outcome: 'success' }).eq('actor_id', A.id);
    expect(r.error).not.toBeNull();
  });
  it('hash chain verifies and no secrets are logged', async () => {
    const v = await fn('admin-audit-query', { token: E.token, json: { verify_chain: true } });
    expect(v.body.data.verification.ok).toBe(true);
    const { data } = await admin.from('audit_events').select('details').order('seq', { ascending: false }).limit(200);
    expect(JSON.stringify(data)).not.toMatch(/eyJ|service_role|password/i);
  });
});

describe('direct Storage API (bypass attempts)', () => {
  it('outsider/anon cannot read, list, overwrite or delete the object', async () => {
    expect((await X.client.storage.from('documents').download(key)).error).not.toBeNull();
    expect((await X.client.storage.from('documents').list(A.id)).data ?? []).toEqual([]);
    expect((await X.client.storage.from('documents').upload(key, PDF(), { upsert: true })).error).not.toBeNull();
    expect((await X.client.storage.from('documents').remove([key])).data ?? []).toEqual([]);
    expect((await X.client.storage.from('documents').createSignedUrl(key, 60)).error).not.toBeNull();
  });
  it('even the OWNER cannot bypass the function path via Storage API', async () => {
    expect((await A.client.storage.from('documents').download(key)).error).not.toBeNull();
    expect((await A.client.storage.from('documents').upload(`${A.id}/x/y`, PDF())).error).not.toBeNull();
  });
  it('no public URL works', async () => {
    const res = await fetch(`${process.env.TV_URL}/storage/v1/object/public/documents/${key}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
  it('object still intact after attacks', async () => {
    expect((await admin.storage.from('documents').download(key)).error).toBeNull();
  });
});

describe('upload validation', () => {
  it('rejects forged MIME (html as pdf), wrong signature, oversize, unsupported', async () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    expect((await upload(A, 't', html, 'application/pdf')).body.error.code).toBe('unsupported_type');
    expect((await upload(A, 't', PDF(), 'image/png', 'a.png')).body.error.code).toBe('unsupported_type');
    const big = new Uint8Array(6 * 1024 * 1024); big.set(PDF());
    expect((await upload(A, 't', big)).status).toBe(413);
    expect((await upload(A, 't', new TextEncoder().encode('MZ\x90\x00'), 'application/x-msdownload', 'a.exe')).status).toBe(415);
  });
  it('unsafe filenames never control the storage key', async () => {
    const r = await upload(A, 'Traversal', PDF(), 'application/pdf', '../../../etc/passwd.pdf');
    expect(r.status).toBe(201);
    const row = (await admin.from('documents').select('storage_key,original_filename').eq('id', r.body.data.id).single()).data!;
    expect(row.storage_key).toMatch(new RegExp(`^${A.id}/${r.body.data.id}/[0-9a-f-]{36}$`));
    expect(row.original_filename).toBe('passwd.pdf');
  });
  it('viewer-role accounts cannot upload', async () => {
    const V = await makeUser('au-v', 'viewer');
    expect((await upload(V)).body.error.code).toBe('forbidden');
  });
});
