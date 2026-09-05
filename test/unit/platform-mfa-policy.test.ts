import { describe, it, expect } from 'vitest';
import { mfaRequiredForRole } from '../../src/modules/platform/service.js';

describe('MFA enforcement policy', () => {
  it('enforces MFA for admin and super_admin', () => {
    expect(mfaRequiredForRole('admin')).toBe(true);
    expect(mfaRequiredForRole('super_admin')).toBe(true);
  });

  it('does not block support (recommended, not enforced)', () => {
    expect(mfaRequiredForRole('support')).toBe(false);
  });
});
