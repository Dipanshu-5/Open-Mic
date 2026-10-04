import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // Only the test runner bypasses the RSC marker. Next.js enforces it in the app.
      'server-only': fileURLToPath(
        new URL('./tests/support/server-only.js', import.meta.url),
      ),
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
