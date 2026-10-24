import { audit, E, handle, ok, requireUser, rpc, failFromRpc, z, category } from '../_shared/http.ts';
import { BUCKET, putObject, readFile, removeObject } from '../_shared/upload.ts';

const Fields = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  category,
});

handle(async (ctx) => {
  const user = await requireUser(ctx);
  // Role pre-check BEFORE accepting any bytes (the RPC re-checks atomically).
  const { data: me } = await user.client.from('profiles').select('role').eq('id', user.id).single();
  if (!me || !['owner', 'admin'].includes(me.role)) {
    await audit(ctx, user.id, null, 'document.upload', 'denied', { reason: 'role_not_allowed' });
    throw E.forbidden();
  }
  const { form, bytes, check } = await readFile(ctx);
  const f = Fields.safeParse({
    title: form.get('title'), description: form.get('description') ?? '', category: form.get('category') ?? 'general',
  });
  if (!f.success) throw E.bad('Invalid document fields');

  const id = crypto.randomUUID();
  const key = `${user.id}/${id}/${crypto.randomUUID()}`; // server-generated; client path ignored
  await putObject(key, bytes, check.mime);
  try {
    const r = await rpc(ctx, 'rpc_document_create', {
      p_actor: user.id, p_id: id, p_title: f.data.title, p_description: f.data.description,
      p_filename: check.filename, p_storage_key: key, p_category: f.data.category,
      p_mime: check.mime, p_size: bytes.length, p_sha256: check.sha256,
    });
    if (!r.ok) failFromRpc(r);
  } catch (e) {
    // Compensation: never leave an object that has no metadata row.
    if (!(await removeObject(key))) await audit(ctx, user.id, id, 'storage.cleanup_failed', 'error', { bucket: BUCKET }, false);
    throw e;
  }
  return ok(ctx, { id, title: f.data.title, mime_type: check.mime, size_bytes: bytes.length, sha256: check.sha256 }, 201);
});
