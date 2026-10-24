import {
  adminClient,
  ApiError,
  E,
  failFromRpc,
  handle,
  ok,
  parseJson,
  requireUser,
  rpc,
  uuid,
  z,
} from '../_shared/http.ts';

handle(async (ctx) => {
  const actor = await requireUser(ctx);
  const { data: profile } = await actor.client
    .from('profiles')
    .select('role,is_active')
    .eq('id', actor.id)
    .maybeSingle();
  if (profile?.role !== 'admin' || !profile.is_active) throw E.forbidden();

  const body = await parseJson(
    ctx,
    z.object({
      user_id: uuid,
      action: z.enum(['ban', 'unban', 'delete']),
    }),
  );
  if (body.user_id === actor.id) throw E.bad('You cannot manage your own account.');

  const admin = adminClient();
  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', body.user_id)
    .maybeSingle();
  if (targetError) throw E.internal();
  if (!target) throw new ApiError(404, 'user_not_found', 'User account not found.');
  if (target.role === 'admin') throw E.forbidden();

  if (body.action === 'ban') {
    const result = await rpc(ctx, 'rpc_admin_set_user_active', {
      p_actor: actor.id,
      p_target: target.id,
      p_is_active: false,
    });
    if (!result.ok) failFromRpc(result);

    const { error } = await admin.auth.admin.updateUserById(target.id, { ban_duration: '876000h' });
    if (error) {
      await rpc(ctx, 'rpc_admin_set_user_active', {
        p_actor: actor.id,
        p_target: target.id,
        p_is_active: true,
      });
      console.error(JSON.stringify({ requestId: ctx.requestId, user_ban_failed: error.message }));
      throw E.internal();
    }
    return ok(ctx, { action: body.action, user_id: target.id });
  }

  if (body.action === 'unban') {
    const { error } = await admin.auth.admin.updateUserById(target.id, { ban_duration: 'none' });
    if (error) throw E.internal();
    const result = await rpc(ctx, 'rpc_admin_set_user_active', {
      p_actor: actor.id,
      p_target: target.id,
      p_is_active: true,
    });
    if (!result.ok) {
      await admin.auth.admin.updateUserById(target.id, { ban_duration: '876000h' });
      failFromRpc(result);
    }
    return ok(ctx, { action: body.action, user_id: target.id });
  }

  const { count: ownedDocuments, error: documentsError } = await admin
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', target.id);
  if (documentsError) throw E.internal();
  if (ownedDocuments) {
    throw new ApiError(
      409,
      'owned_documents',
      'This account owns documents. Delete or transfer those documents before deleting the account.',
    );
  }

  const { count: grantHistory, error: grantsError } = await admin
    .from('document_permissions')
    .select('id', { count: 'exact', head: true })
    .or(`granted_by.eq.${target.id},revoked_by.eq.${target.id}`);
  if (grantsError) throw E.internal();
  if (grantHistory) {
    throw new ApiError(
      409,
      'grant_history',
      'This account is referenced by document-sharing history and cannot be permanently deleted. Ban it to block access while preserving the audit trail.',
    );
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(target.id);
  if (deleteError) {
    console.error(
      JSON.stringify({ requestId: ctx.requestId, user_delete_failed: deleteError.message }),
    );
    throw E.internal();
  }
  const result = await rpc(ctx, 'rpc_admin_audit_user_delete', {
    p_actor: actor.id,
    p_target: target.id,
  });
  if (!result.ok) failFromRpc(result);
  return ok(ctx, { action: body.action, user_id: target.id });
});
