// Multipart reading + validated storage helpers shared by upload/replace.
import { adminClient, Ctx, E, maxUploadBytes } from './http.ts';
import { validateUpload } from './files.ts';

export const BUCKET = 'documents';

export async function readFile(ctx: Ctx) {
  const max = maxUploadBytes();
  const len = Number(ctx.req.headers.get('content-length') ?? 0);
  if (len > max + 64 * 1024) throw E.tooLarge(); // reject before buffering
  let form: FormData;
  try { form = await ctx.req.formData(); } catch { throw E.bad('Expected multipart form data'); }
  const file = form.get('file');
  if (!(file instanceof File)) throw E.bad('Missing file');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = await validateUpload({ bytes, declaredMime: file.type, filename: file.name, maxBytes: max });
  if (!check.ok) {
    if (check.code === 'too_large') throw E.tooLarge();
    throw E.unsupported(check.message);
  }
  return { form, bytes, check };
}

export async function putObject(key: string, bytes: Uint8Array, mime: string) {
  const { error } = await adminClient().storage.from(BUCKET).upload(key, bytes, { contentType: mime, upsert: false });
  if (error) throw E.internal();
}

export async function removeObject(key: string): Promise<boolean> {
  const { error } = await adminClient().storage.from(BUCKET).remove([key]);
  return !error;
}
