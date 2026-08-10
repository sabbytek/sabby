import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  FeatureGatedError,
  LedgerImbalanceError,
  ValidationError,
  ConflictError,
} from '../../src/shared/errors/types.js';

describe('AppError hierarchy', () => {
  it('NotFoundError has correct code and status', () => {
    const err = new NotFoundError('Product', '123');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('123');
    expect(err instanceof AppError).toBe(true);
  });

  it('UnauthorizedError defaults to 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('ForbiddenError defaults to 403', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('FeatureGatedError returns 402 with feature name', () => {
    const err = new FeatureGatedError('reporting:pl');
    expect(err.statusCode).toBe(402);
    expect(err.code).toBe('FEATURE_GATED');
    expect(err.message).toContain('reporting:pl');
  });

  it('LedgerImbalanceError includes debit and credit values', () => {
    const err = new LedgerImbalanceError(10000, 9500);
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('LEDGER_IMBALANCE');
    expect(err.message).toContain('10000');
    expect(err.message).toContain('9500');
  });

  it('ValidationError carries details', () => {
    const err = new ValidationError('Bad input', { field: 'email' });
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: 'email' });
  });

  it('ConflictError returns 409', () => {
    const err = new ConflictError('Slug taken');
    expect(err.statusCode).toBe(409);
  });
});
