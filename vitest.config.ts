import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // Stub env vars so the app can boot in test mode without real credentials.
    // These values are fake — no real services are called (services are mocked).
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost/bpos_test',
      JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-chars-padding!!',
      JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-chars-padding!',
      JWT_ACCESS_EXPIRY: '15m',
      R2_ACCOUNT_ID: 'test-account-id',
      R2_ACCESS_KEY_ID: 'test-access-key',
      R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
      R2_BUCKET_NAME: 'test-bucket',
      R2_PUBLIC_URL: 'https://test.r2.example.com',
      PAYSTACK_SECRET_KEY: 'sk_test_placeholder',
      PAYSTACK_PUBLIC_KEY: 'pk_test_placeholder',
      TERMII_API_KEY: 'test-termii-key',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/**/*.d.ts'],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
    setupFiles: ['test/helpers/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
