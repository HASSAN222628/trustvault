import { describe, expect, it } from 'vitest';
import { detectMime, sanitizeFilename, sha256Hex, validateUpload } from '../../supabase/functions/_shared/files.ts';

const enc = (s: string) => new TextEncoder().encode(s);
const PDF = enc('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

describe('detectMime (magic bytes)', () => {
  it('accepts PDF, PNG, JPEG', () => {
    expect(detectMime(PDF)).toBe('application/pdf');
    expect(detectMime(PNG)).toBe('image/png');
    expect(detectMime(JPG)).toBe('image/jpeg');
  });
  it('rejects scripts, HTML, executables and truncated files', () => {
    expect(detectMime(enc('<script>alert(1)</script>'))).toBeNull();
    expect(detectMime(enc('<html></html>'))).toBeNull();
    expect(detectMime(Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3]))).toBeNull(); // Windows PE
    expect(detectMime(enc('%PDF-1.4 no end marker'))).toBeNull();
    expect(detectMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1]))).toBeNull();
    expect(detectMime(new Uint8Array(0))).toBeNull();
  });
});

describe('validateUpload', () => {
  it('accepts a valid PDF and hashes it', async () => {
    const r = await validateUpload({ bytes: PDF, declaredMime: 'application/pdf', filename: 'a.pdf' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sha256).toBe(await sha256Hex(PDF));
  });
  it('rejects a forged MIME type', async () => {
    const r = await validateUpload({ bytes: enc('<html>'), declaredMime: 'application/pdf', filename: 'x.pdf' });
    expect(r).toMatchObject({ ok: false, code: 'unsupported_type' });
  });
  it('rejects declared/actual mismatch', async () => {
    const r = await validateUpload({ bytes: PNG, declaredMime: 'application/pdf', filename: 'x.pdf' });
    expect(r).toMatchObject({ ok: false, code: 'mime_mismatch' });
  });
  it('rejects oversize and empty files', async () => {
    expect(await validateUpload({ bytes: PDF, declaredMime: 'application/pdf', filename: 'a.pdf', maxBytes: 10 }))
      .toMatchObject({ ok: false, code: 'too_large' });
    expect(await validateUpload({ bytes: new Uint8Array(0), declaredMime: 'application/pdf', filename: 'a.pdf' }))
      .toMatchObject({ ok: false, code: 'empty' });
  });
});

describe('sanitizeFilename', () => {
  it('removes path traversal and control characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\x\\evil.pdf')).toBe('evil.pdf');
    expect(sanitizeFilename('a\u0000b<script>.pdf')).toBe('abscript.pdf');
    expect(sanitizeFilename('...')).toBe('document');
    expect(sanitizeFilename('')).toBe('document');
    expect(sanitizeFilename('x'.repeat(500)).length).toBe(120);
  });
});
