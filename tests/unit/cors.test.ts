import { describe, expect, it } from 'vitest';
import { corsDecision, parseAllowedOrigins } from '../../supabase/functions/_shared/cors.ts';

const allowed = parseAllowedOrigins(' https://app.example.com , http://localhost:5173 ,');
describe('cors', () => {
  it('parses the allow-list', () =>
    expect(allowed).toEqual(['https://app.example.com', 'http://localhost:5173']));
  it('allows listed origins and echoes exactly that origin', () => {
    const d = corsDecision('https://app.example.com', allowed);
    expect(d.allowed).toBe(true);
    expect(d.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(d.headers['Access-Control-Allow-Headers']).toContain('apikey');
  });
  it('rejects unlisted origins (no wildcard)', () => {
    const d = corsDecision('https://evil.example', allowed);
    expect(d.allowed).toBe(false);
    expect(d.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
  it('allows non-browser callers without CORS headers', () =>
    expect(corsDecision(null, allowed).allowed).toBe(true));
  it('empty allow-list denies every browser origin', () =>
    expect(corsDecision('http://localhost:5173', []).allowed).toBe(false));
});
