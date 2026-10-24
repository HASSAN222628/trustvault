// Shared HTTP plumbing for every Edge Function (Deno).
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { corsDecision, parseAllowedOrigins } from './cors.ts';
import { z } from 'npm:zod@3.23.8';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const E = {
  unauthenticated: () => new ApiError(401, 'unauthenticated', 'Authentication required'),
  forbidden: () => new ApiError(403, 'forbidden', 'You do not have permission for this action'),
  notFound: () => new ApiError(404, 'not_found', 'Document not found'), // same for "no access"
  bad: (m = 'Invalid request') => new ApiError(400, 'invalid_request', m),
  method: () => new ApiError(405, 'method_not_allowed', 'Method not allowed'),
  tooLarge: () => new ApiError(413, 'too_large', 'File exceeds the size limit'),
  unsupported: (m: string) => new ApiError(415, 'unsupported_type', m),
  auditDown: () =>
    new ApiError(503, 'audit_unavailable', 'Request could not be recorded; try again'),
  internal: () => new ApiError(500, 'internal_error', 'Unexpected error'),
};

export type Ctx = { req: Request; requestId: string };
export const env = (k: string) => Deno.env.get(k) ?? '';
export const maxUploadBytes = () => Number(env('MAX_UPLOAD_BYTES')) || 5 * 1024 * 1024;

/** Service-role client: BYPASSES RLS. Only use after explicit authorisation. */
export const adminClient = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

export type AuthedUser = { id: string; client: SupabaseClient };

export async function requireUser(ctx: Ctx): Promise<AuthedUser> {
  const m = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/.exec(ctx.req.headers.get('Authorization') ?? '');
  let user: { id: string } | null = null;
  let client: SupabaseClient | null = null;
  if (m) {
    client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: `Bearer ${m[1]}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(m[1]); // verified by the Auth server
    if (!error && data.user) user = data.user;
  }
  if (!user || !client) {
    await audit(
      ctx,
      null,
      null,
      'auth.failure',
      'denied',
      { reason: m ? 'invalid_token' : 'missing_token' },
      false,
    );
    throw E.unauthenticated();
  }
  const { data: profile, error } = await client
    .from('profiles')
    .select('is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !profile?.is_active) {
    await audit(
      ctx,
      user.id,
      null,
      'auth.failure',
      'denied',
      { reason: 'account_disabled' },
      false,
    );
    throw E.unauthenticated();
  }
  return { id: user.id, client };
}

/** Trusted audit write. mandatory=true => failure aborts the request (fail closed). */
export async function audit(
  ctx: Ctx,
  actor: string | null,
  doc: string | null,
  action: string,
  outcome: 'success' | 'denied' | 'error',
  details: Record<string, unknown> = {},
  mandatory = true,
) {
  try {
    const { error } = await adminClient().rpc('rpc_audit_log', {
      p_actor: actor,
      p_document: doc,
      p_action: action,
      p_outcome: outcome,
      p_request_id: ctx.requestId,
      p_details: details,
    });
    if (error) throw error;
  } catch (e) {
    console.error(JSON.stringify({ requestId: ctx.requestId, audit_failed: String(e) }));
    if (mandatory) throw E.auditDown();
  }
}

/** Calls a service-only RPC. DB errors (incl. audit failure) => 503, never data. */
export async function rpc(ctx: Ctx, fn: string, args: Record<string, unknown>) {
  const { data, error } = await adminClient().rpc(fn, { ...args, p_request_id: ctx.requestId });
  if (error) {
    console.error(JSON.stringify({ requestId: ctx.requestId, rpc: fn, error: error.message }));
    throw E.auditDown();
  }
  return data as Record<string, unknown>;
}

/** Maps an RPC denial result onto the HTTP contract. */
export function failFromRpc(r: Record<string, unknown>): never {
  switch (r.code) {
    case 'not_found':
      throw E.notFound();
    case 'forbidden':
      throw E.forbidden();
    case 'user_not_found':
      throw new ApiError(404, 'user_not_found', 'No registered user with that email');
    case 'no_active_grant':
      throw new ApiError(404, 'no_active_grant', 'No active grant for that user');
    case 'invalid_grantee':
    case 'invalid_permission':
    case 'invalid_role':
      throw E.bad();
    default:
      throw E.internal();
  }
}

export async function parseJson<T extends z.ZodTypeAny>(ctx: Ctx, schema: T): Promise<z.infer<T>> {
  if (!(ctx.req.headers.get('content-type') ?? '').includes('application/json')) throw E.bad();
  let body: unknown;
  try {
    body = await ctx.req.json();
  } catch {
    throw E.bad();
  }
  const r = schema.safeParse(body);
  if (!r.success) throw E.bad('Invalid request body');
  return r.data;
}

export function handle(fn: (ctx: Ctx) => Promise<Response>) {
  Deno.serve(async (req) => {
    const requestId =
      req.headers
        .get('x-request-id')
        ?.slice(0, 64)
        .replace(/[^\w-]/g, '') || crypto.randomUUID();
    const cors = corsDecision(
      req.headers.get('Origin'),
      parseAllowedOrigins(env('ALLOWED_ORIGINS')),
    );
    const headers = { ...cors.headers, 'x-request-id': requestId, 'Cache-Control': 'no-store' };
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    try {
      if (!cors.allowed)
        return reply(403, {
          error: {
            code: 'origin_not_allowed',
            message: 'Origin not allowed',
            request_id: requestId,
          },
        });
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (req.method !== 'POST') throw E.method();
      const res = await fn({ req, requestId });
      for (const [k, v] of Object.entries(headers)) if (!res.headers.has(k)) res.headers.set(k, v);
      return res;
    } catch (e) {
      const err = e instanceof ApiError ? e : (console.error(requestId, e), E.internal());
      return reply(err.status, {
        error: { code: err.code, message: err.message, request_id: requestId },
      });
    }
  });
}

export const ok = (ctx: Ctx, data: unknown, status = 200) =>
  new Response(JSON.stringify({ data, request_id: ctx.requestId }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const uuid = z.string().uuid();
export const category = z.enum(['contract', 'salary', 'technical', 'audit', 'customer', 'general']);
export { z };
