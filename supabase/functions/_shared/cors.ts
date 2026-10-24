// CORS is a browser convenience, NOT authorisation. Pure module (unit-tested).
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export type OriginDecision = { allowed: boolean; headers: Record<string, string> };

export function corsDecision(origin: string | null, allowed: string[]): OriginDecision {
  const base = { Vary: 'Origin' };
  if (!origin) return { allowed: true, headers: base }; // non-browser client
  if (!allowed.includes(origin)) return { allowed: false, headers: base };
  return {
    allowed: true,
    headers: {
      ...base,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-request-id',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Expose-Headers': 'content-disposition, x-content-sha256, x-request-id',
      'Access-Control-Max-Age': '600',
    },
  };
}
