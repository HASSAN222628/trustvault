// Upload validation. Pure + dependency-free so it can be unit-tested in Node.
export type AllowedMime = 'application/pdf' | 'image/png' | 'image/jpeg';

export const ALLOWED_MIMES: readonly AllowedMime[] = ['application/pdf', 'image/png', 'image/jpeg'];
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** Detects type from magic bytes only. Never trusts extension or declared MIME. */
export function detectMime(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length >= 4 && startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    // %PDF- ... and an %%EOF marker near the end (rejects truncated/garbage files)
    const tail = new TextDecoder('latin1').decode(bytes.slice(Math.max(0, bytes.length - 1100)));
    return tail.includes('%%EOF') ? 'application/pdf' : null;
  }
  if (bytes.length >= 8 && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (bytes.length >= 4 && startsWith(bytes, [0xff, 0xd8, 0xff]) &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) {
    return 'image/jpeg';
  }
  return null;
}

export type UploadCheck =
  | { ok: true; mime: AllowedMime; sha256: string; filename: string }
  | { ok: false; code: 'empty' | 'too_large' | 'unsupported_type' | 'mime_mismatch'; message: string };

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Display-only filename: strips paths, control chars, and limits length. */
export function sanitizeFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/^\.+/, '')
    .trim();
  const cut = base.length > 120 ? base.slice(0, 120) : base;
  return cut || 'document';
}

export async function validateUpload(input: {
  bytes: Uint8Array; declaredMime: string; filename: string; maxBytes?: number;
}): Promise<UploadCheck> {
  const max = input.maxBytes ?? DEFAULT_MAX_BYTES;
  if (input.bytes.length === 0) return { ok: false, code: 'empty', message: 'File is empty' };
  if (input.bytes.length > max) return { ok: false, code: 'too_large', message: 'File exceeds the size limit' };
  const mime = detectMime(input.bytes);
  if (!mime) return { ok: false, code: 'unsupported_type', message: 'Only valid PDF, PNG or JPEG files are accepted' };
  if (input.declaredMime !== mime) {
    return { ok: false, code: 'mime_mismatch', message: 'File content does not match its declared type' };
  }
  return { ok: true, mime, sha256: await sha256Hex(input.bytes), filename: sanitizeFilename(input.filename) };
}
