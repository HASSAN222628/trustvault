import { audit, failFromRpc, handle, ok, parseJson, requireUser, rpc, uuid, z } from '../_shared/http.ts';
import { removeObject } from '../_shared/upload.ts';

handle(async (ctx) => {
  const user = await requireUser(ctx);
  const { document_id } = await parseJson(ctx, z.object({ document_id: uuid }));
  const r = await rpc(ctx, 'rpc_document_delete', { p_actor: user.id, p_document: document_id });
  if (!r.ok) failFromRpc(r);
  if (!(await removeObject(String(r.storage_key)))) {
    await audit(ctx, user.id, document_id, 'storage.cleanup_failed', 'error', {}, false);
  }
  return ok(ctx, { deleted: true });
});
