import { failFromRpc, handle, ok, parseJson, requireUser, rpc, uuid, z } from '../_shared/http.ts';

handle(async (ctx) => {
  const user = await requireUser(ctx);
  const b = await parseJson(ctx, z.object({ document_id: uuid, user_id: uuid }));
  const r = await rpc(ctx, 'rpc_document_revoke', { p_actor: user.id, p_document: b.document_id, p_user: b.user_id });
  if (!r.ok) failFromRpc(r);
  return ok(ctx, { revoked: true }); // effective for every NEW request from this moment
});
