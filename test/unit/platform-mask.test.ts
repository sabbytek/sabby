import { describe, it, expect } from 'vitest';
import { maskEmail, maskPhone } from '../../src/modules/platform/mask.js';

describe('maskEmail', () => {
  it('keeps the first character and domain', () => {
    expect(maskEmail('john.doe@example.com')).toBe('j***@example.com');
  });

  it('never leaks the local part beyond the first character', () => {
    const masked = maskEmail('sensitive.owner@shop.ng');
    expect(masked).toBe('s***@shop.ng');
    expect(masked).not.toContain('ensitive');
  });

  it('handles malformed input safely', () => {
    expect(maskEmail('notanemail')).toBe('***');
    expect(maskEmail('@nolocal.com')).toBe('***');
  });

  it('passes through null/undefined', () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail(undefined)).toBeNull();
  });
});

describe('maskPhone', () => {
  it('reveals only the last four digits', () => {
    expect(maskPhone('+2348012345678')).toBe('***5678');
  });

  it('strips non-digits before masking', () => {
    expect(maskPhone('0801-234-5678')).toBe('***5678');
  });

  it('masks fully when too short to keep four digits', () => {
    expect(maskPhone('123')).toBe('***');
  });

  it('passes through null/undefined', () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
  });
});
