import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let testApp: FastifyInstance | null = null;

export async function getTestApp(): Promise<FastifyInstance> {
  if (!testApp) {
    testApp = buildApp();
    await testApp.ready();
  }
  return testApp;
}

export async function closeTestApp(): Promise<void> {
  if (testApp) {
    await testApp.close();
    testApp = null;
  }
}
