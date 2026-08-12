import { notificationsWorker } from '../shared/queue/workers/notifications.worker.js';
import { documentsWorker } from '../shared/queue/workers/documents.worker.js';
import { paymentsWorker } from '../shared/queue/workers/payments.worker.js';
import { subscriptionsWorker } from '../shared/queue/workers/subscriptions.worker.js';
import { logisticsWorker } from '../shared/queue/workers/logistics.worker.js';
import { inventoryWorker } from '../shared/queue/workers/inventory.worker.js';

const workers = [
  notificationsWorker,
  documentsWorker,
  paymentsWorker,
  subscriptionsWorker,
  logisticsWorker,
  inventoryWorker,
];

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] Received ${signal}, closing workers`);

  const forceExitTimer = setTimeout(() => {
    console.error('[worker] Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    await Promise.allSettled(workers.map((w) => w.close()));
    console.log('[worker] All workers closed');
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    console.error('[worker] Error during shutdown', err);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

console.log(`[worker] Started ${workers.length} BullMQ workers`);
for (const worker of workers) {
  worker.on('error', (err) => {
    console.error(`[worker:${worker.name}] error:`, err.message);
  });
}
