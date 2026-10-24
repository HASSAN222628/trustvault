import { audit, E, failFromRpc, handle, ok, parseJson, requireUser, rpc, uuid, z, category } from '../_shared/http.ts';
import { putObject, readFile, removeObject } from '../_shared/upload.ts';

const Meta = z.object({
  document_id: uuid,
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  category: category.optional(),
}).refine((v) => v.title !== undefined || v.description !== undefined || v.category !== undefined);

handle(async (ctx) => {
  const user = await requireUser(ctx);
  if ((ctx.req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    // ---- replace content (owner or active edit grant)
    const docId = uuid.safeParse(new URL(ctx.req.url).searchParams.get('document_id'));
    if (!docId.success) throw E.bad();
    // Authorise BEFORE reading/storing bytes (denials audited; success audited by final RPC).
    const pre = await rpc(ctx, 'rpc_authorize_document', {
      p_actor: user.id, p_document: docId.data, p_action: 'replace', p_audit_allowed: false });
    if (!pre.ok) failFromRpc(pre);
    const { bytes, check } = await readFile(ctx);
    const key = `${user.id}/${docId.data}/${crypto.randomUUID()}`;
    await putObject(key, bytes, check.mime);
    let old: string;
    try {
      const r = await rpc(ctx, 'rpc_document_replace', {
        p_actor: user.id, p_document: docId.data, p_new_key: key, p_filename: check.filename,
        p_mime: check.mime, p_size: bytes.length, p_sha256: check.sha256 });
      if (!r.ok) failFromRpc(r);
      old = String(r.old_storage_key);
    } catch (e) {
      await removeObject(key);
      throw e;
    }
    if (!(await removeObject(old))) await audit(ctx, user.id, docId.data, 'storage.cleanup_failed', 'error', {}, false);
    return ok(ctx, { id: docId.data, sha256: check.sha256, size_bytes: bytes.length });
  }
  // ---- metadata edit
  const b = await parseJson(ctx, Meta);
  const r = await rpc(ctx, 'rpc_document_update_metadata', {
    p_actor: user.id, p_document: b.document_id, p_title: b.title ?? null,
    p_description: b.description ?? null, p_category: b.category ?? null });
  if (!r.ok) failFromRpc(r);
  return ok(ctx, { id: b.document_id });
});
