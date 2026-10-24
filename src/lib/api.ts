import { supabase } from './supabase';

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call(name: string, init: { json?: unknown; form?: FormData; query?: string }) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token)
    throw new ApiFailure(401, 'unauthenticated', 'Your session has expired. Please sign in again.');
  const base = import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  let res: Response;
  try {
    res = await fetch(`${base}/functions/v1/${name}${init.query ?? ''}`, {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
        Authorization: `Bearer ${token}`,
        ...(init.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.form,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ApiFailure(
        0,
        'function_unreachable',
        'Could not reach the Supabase Edge Function. Deploy the project functions and allow this app origin in ALLOWED_ORIGINS.',
      );
    }
    throw error;
  }
  if (res.status === 401) await supabase.auth.signOut();
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (res.status === 404 && body?.code === 'NOT_FOUND') {
    throw new ApiFailure(
      res.status,
      'function_not_deployed',
      'This Supabase Edge Function is not deployed. Deploy the project functions with the Supabase CLI, then try again.',
    );
  }
  if (!res.ok)
    throw new ApiFailure(
      res.status,
      body?.error?.code ?? 'error',
      body?.error?.message ?? 'Request failed',
    );
  return body.data as T;
}

export const api = {
  json: async <T>(fn: string, json: unknown) => parse<T>(await call(fn, { json })),
  form: async <T>(fn: string, form: FormData, query?: string) =>
    parse<T>(await call(fn, { form, query })),
  async preview(documentId: string) {
    const res = await call('document-download', {
      json: { document_id: documentId, disposition: 'inline' },
    });
    if (!res.ok) await parse(res);
    return URL.createObjectURL(await res.blob());
  },
  async download(documentId: string) {
    const res = await call('document-download', {
      json: { document_id: documentId, disposition: 'attachment' },
    });
    if (!res.ok) await parse(res);
    const name =
      /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'document';
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
