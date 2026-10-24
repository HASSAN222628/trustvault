import { defineConfig } from 'vitest/config';

// Integration + security tests against a LOCAL Supabase stack.
// Files run sequentially because they share one database.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/security/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
