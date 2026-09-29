/**
 * Access to the namespaced platform JWT signer.
 *
 * @fastify/jwt exposes a second, namespaced signer at `app.jwt.<namespace>`
 * (registered in app.ts as 'platform'), but its published types describe only
 * the default namespace. Rather than scatter casts through the auth service,
 * the single unavoidable cast lives here, behind a typed function.
 */

import type { FastifyInstance } from 'fastify';
import type { PlatformJwtPayload } from '../../../shared/types/index.js';

interface NamespacedSigner {
  sign(payload: PlatformJwtPayload, options?: { expiresIn?: string | number }): string;
}

export function signPlatformToken(
  app: FastifyInstance,
  payload: PlatformJwtPayload,
  expiresIn: string,
): string {
  const namespaced = (app.jwt as unknown as Record<string, NamespacedSigner | undefined>)[
    'platform'
  ];

  if (!namespaced) {
    // Only reachable if the platform routes were mounted without the matching
    // JWT registration — fail loudly rather than mint an unsigned-plane token.
    throw new Error('Platform JWT namespace is not registered. JWT_PLATFORM_SECRET must be set.');
  }

  return namespaced.sign(payload, { expiresIn });
}
