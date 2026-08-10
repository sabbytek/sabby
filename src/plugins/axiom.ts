/**
 * Axiom plugin — structured log drain to Axiom.
 * Only active when AXIOM_TOKEN is configured.
 */

import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { env } from '../config/env.js';

export function createAxiomLogger() {
  if (!env.AXIOM_TOKEN || env.NODE_ENV === 'test') {
    return undefined;
  }

  return pino.transport({
    target: 'pino-axiom',
    options: {
      url: 'https://api.axiom.co/v1/datasets',
      token: env.AXIOM_TOKEN,
      dataset: env.AXIOM_DATASET,
    },
  });
}

export async function axiomPlugin(app: FastifyInstance) {
  if (!env.AXIOM_TOKEN) {
    app.log.info('Axiom token not configured, skipping log drain');
    return;
  }

  app.log.info({ dataset: env.AXIOM_DATASET }, 'Axiom log drain initialized');
}
