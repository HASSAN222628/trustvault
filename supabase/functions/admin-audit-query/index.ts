import { adminClient, audit, E, handle, ok, parseJson, requireUser, uuid, z } from '../_shared/http.ts';

const Q = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).max(100000).default(0),
  action: z.string().regex(/^[a-z_.]+$/).max(60).optional(),
  outcome: z.enum(['success', 'denied', 'error']).optional(),
  document_id: uuid.optional(),
  actor_id: uuid.optional(),
  verify_chain: z.boolean().default(false),
});

handle(async (ctx) => {
  const user = await requireUser(ctx);
  // Role is read from the database (never from JWT claims) with the caller's own RLS context.
  const { data: me } = await user.client.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    await audit(ctx, user.id, null, 'admin.audit_query', 'denied', { reason: 'not_admin' });
    throw E.forbidden();
  }
  const q = await parseJson(ctx, Q);
  if (q.verify_chain) {
    const { data, error } = await adminClient().rpc('rpc_audit_verify');
    if (error) throw E.internal();
    await audit(ctx, user.id, null, 'admin.audit_verify', 'success', { ok: data?.[0]?.ok }, false);
    return ok(ctx, { verification: data?.[0] });
  }
  // READ-ONLY query through the caller's client: RLS (admin policy) applies.
  let query = user.client.from('audit_events')
    .select('seq,id,actor_id,document_id,action,outcome,occurred_at,request_id,details', { count: 'exact' })
    .order('seq', { ascending: false }).range(q.offset, q.offset + q.limit - 1);
  if (q.action) query = query.eq('action', q.action);
  if (q.outcome) query = query.eq('outcome', q.outcome);
  if (q.document_id) query = query.eq('document_id', q.document_id);
  if (q.actor_id) query = query.eq('actor_id', q.actor_id);
  const { data, error, count } = await query;
  if (error) throw E.internal();
  return ok(ctx, { events: data, total: count });
});
