import { failFromRpc, handle, ok, parseJson, requireUser, rpc, uuid, z } from '../_shared/http.ts';

handle(async (ctx) => {
  const user = await requireUser(ctx);
  const b = await parseJson(ctx, z.object({
    document_id: uuid, grantee_email: z.string().trim().email().max(320), permission: z.enum(['read', 'edit']),
  }));
  const r = await rpc(ctx, 'rpc_document_grant', {
    p_actor: user.id, p_document: b.document_id, p_grantee_email: b.grantee_email, p_permission: b.permission });
  if (!r.ok) failFromRpc(r);
  return ok(ctx, { user_id: r.user_id, permission: b.permission, unchanged: r.unchanged ?? false });
});
