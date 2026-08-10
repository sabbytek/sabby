import { describe, it, expect } from 'vitest';
import { tenantSchemaName, validateSchemaName } from '../../src/shared/db/tenant.js';

describe('Tenant schema utilities', () => {
  describe('tenantSchemaName', () => {
    it('prefixes with t_ and replaces hyphens with underscores', () => {
      const name = tenantSchemaName('550e8400-e29b-41d4-a716-446655440000');
      expect(name).toBe('t_550e8400_e29b_41d4_a716_446655440000');
    });

    it('produces a valid schema name', () => {
      const name = tenantSchemaName('550e8400-e29b-41d4-a716-446655440000');
      expect(validateSchemaName(name)).toBe(true);
    });
  });

  describe('validateSchemaName', () => {
    it('accepts valid schema names', () => {
      expect(validateSchemaName('t_abc123')).toBe(true);
      expect(validateSchemaName('tenant_schema_1')).toBe(true);
      expect(validateSchemaName('abc')).toBe(true);
    });

    it('rejects names starting with numbers', () => {
      expect(validateSchemaName('1abc')).toBe(false);
    });

    it('rejects names with uppercase letters', () => {
      expect(validateSchemaName('TenantSchema')).toBe(false);
    });

    it('rejects names with special characters', () => {
      expect(validateSchemaName('tenant-schema')).toBe(false);
      expect(validateSchemaName('tenant schema')).toBe(false);
    });

    it('rejects names longer than 63 characters', () => {
      const longName = 'a'.repeat(64);
      expect(validateSchemaName(longName)).toBe(false);
    });

    it('accepts names exactly 63 characters', () => {
      const name = 'a' + 'b'.repeat(62);
      expect(validateSchemaName(name)).toBe(true);
    });
  });
});
