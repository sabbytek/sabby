#!/usr/bin/env tsx
/**
 * Export the OpenAPI spec from the running Fastify app to a JSON file.
 *
 * Usage:
 *   1. Start the dev server: npm run dev
 *   2. In another terminal: npm run docs:export
 *
 * Requires PLATFORM_BASE_URL to be set in .env (defaults to http://localhost:3000).
 * Output: docs/openapi.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = process.env.PLATFORM_BASE_URL || 'http://localhost:3000';
const OUTPUT_DIR = resolve(process.cwd(), 'docs');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'openapi.json');

async function main() {
  console.log(`Fetching OpenAPI spec from ${BASE_URL}/docs/json ...`);

  try {
    const res = await fetch(`${BASE_URL}/docs/json`);

    if (!res.ok) {
      console.error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
      console.error('Make sure the dev server is running (npm run dev) and SWAGGER_ENABLED=true');
      process.exit(1);
    }

    const spec = await res.json();

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_FILE, JSON.stringify(spec, null, 2) + '\n');

    const pathCount = Object.keys(spec.paths || {}).length;
    console.log(`✓ OpenAPI spec exported to ${OUTPUT_FILE}`);
    console.log(`  ${spec.info?.title} v${spec.info?.version}`);
    console.log(`  ${pathCount} paths documented`);
  } catch (err) {
    console.error('Error fetching OpenAPI spec:', err);
    console.error('Make sure the dev server is running (npm run dev)');
    process.exit(1);
  }
}

main();
