import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';

async function helmetPlugin(app: FastifyInstance) {
  await app.register(helmet, {
    // No HTML is served from this API, but headers protect any future surface
    contentSecurityPolicy: false,
    // HSTS: 1 year, include subdomains
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
    // Prevent MIME sniffing
    noSniff: true,
    // Prevent clickjacking (belt-and-suspenders alongside CSP)
    frameguard: { action: 'deny' },
    // Disable X-Powered-By
    hidePoweredBy: true,
    // XSS filter (legacy browsers)
    xssFilter: true,
    // Referrer policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Cross-Origin policies
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow API consumers
    // No DNS prefetch
    dnsPrefetchControl: { allow: false },
  });
}

export default fp(helmetPlugin, { name: 'helmet' });
