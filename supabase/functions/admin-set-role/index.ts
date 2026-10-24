import { failFromRpc, handle, ok, parseJson, requireUser, rpc, uuid, z } from '../_shared/http.ts';

handle(async (ctx) => {
  const user = await requireUser(ctx);
  const b = await parseJson(ctx, z.object({ user_id: uuid, role: z.enum(['admin', 'owner', 'viewer']) }));
  // Admin check, self-change block and audit all happen inside the RPC.
  const r = await rpc(ctx, 'rpc_admin_set_role', { p_actor: user.id, p_target: b.user_id, p_role: b.role });
  if (!r.ok) failFromRpc(r);
  return ok(ctx, { updated: true });
});
