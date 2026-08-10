import { vi } from 'vitest';

// Prevent actual env validation from failing in test environment
// Tests set their own env vars via vitest.config.ts or inline

// Suppress console.log in tests (keep warn/error)
vi.spyOn(console, 'log').mockImplementation(() => undefined);
