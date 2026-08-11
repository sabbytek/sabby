import { env } from '../../config/env.js';

const QSTASH_API_URL = 'https://qstash.upstash.io/v2';

export const QUEUES = {
  NOTIFICATIONS: 'notifications',
  DOCUMENTS: 'documents',
  PAYMENTS: 'payments',
  SUBSCRIPTIONS: 'subscriptions',
  LOGISTICS: 'logistics',
  INVENTORY: 'inventory',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

interface PublishOptions {
  queue: QueueName;
  jobName: string;
  data: unknown;
  delay?: number; // seconds
  retries?: number;
}

/**
 * Publish a job to QStash. It will POST to /webhooks/queue/:queue
 */
export async function publishJob(options: PublishOptions): Promise<string> {
  const { queue, jobName, data, delay, retries = 3 } = options;
  const destination = `${env.PLATFORM_BASE_URL}/webhooks/queue/${queue}`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${env.QSTASH_TOKEN}`,
    'Content-Type': 'application/json',
    'Upstash-Retries': String(retries),
    'Upstash-Forward-X-Job-Name': jobName,
  };

  if (delay && delay > 0) {
    headers['Upstash-Delay'] = `${delay}s`;
  }

  const response = await fetch(`${QSTASH_API_URL}/publish/${destination}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`QStash publish failed: ${response.status} ${error}`);
  }

  const result = (await response.json()) as { messageId: string };
  return result.messageId;
}

/**
 * Verify QStash webhook signature
 */
export async function verifyQStashSignature(
  signature: string,
  body: string,
  url: string,
): Promise<boolean> {
  const encoder = new TextEncoder();

  for (const key of [env.QSTASH_CURRENT_SIGNING_KEY, env.QSTASH_NEXT_SIGNING_KEY]) {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signaturePayload = `${url}\n${body}`;
    const expectedSig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(signaturePayload));
    const expectedBase64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)));

    if (signature === expectedBase64) {
      return true;
    }
  }

  return false;
}

// Convenience functions for each queue
export const notificationsQueue = {
  add: (jobName: string, data: unknown, delay?: number) =>
    publishJob({ queue: QUEUES.NOTIFICATIONS, jobName, data, delay }),
};

export const documentsQueue = {
  add: (jobName: string, data: unknown, delay?: number) =>
    publishJob({ queue: QUEUES.DOCUMENTS, jobName, data, delay }),
};

export const paymentsQueue = {
  add: (jobName: string, data: unknown, delay?: number) =>
    publishJob({ queue: QUEUES.PAYMENTS, jobName, data, delay }),
};

export const subscriptionsQueue = {
  add: (jobName: string, data: unknown, delay?: number) =>
    publishJob({ queue: QUEUES.SUBSCRIPTIONS, jobName, data, delay }),
};

export const logisticsQueue = {
  add: (jobName: string, data: unknown, delay?: number) =>
    publishJob({ queue: QUEUES.LOGISTICS, jobName, data, delay }),
};

export const inventoryQueue = {
  add: (jobName: string, data: unknown, delay?: number) =>
    publishJob({ queue: QUEUES.INVENTORY, jobName, data, delay }),
};
