import { describe, expect, it } from 'vitest';
import { formatBytes, isUuid } from './utils';

describe('utils', () => {
  it('formats bytes', () => { expect(formatBytes(512)).toBe('512 B'); expect(formatBytes(2048)).toBe('2.0 KB'); });
  it('validates uuids (route param safety)', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isUuid("1' or 1=1")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
