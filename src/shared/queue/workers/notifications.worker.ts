import { createWorker, QUEUES } from '../client.js';
import { sendSMS } from '../../sms/index.js';

interface SmsJobData {
  to: string;
  message: string;
  tenantId: string;
}

interface EmailJobData {
  to: string;
  subject: string;
  body: string;
  tenantId: string;
}

type NotificationJobData = SmsJobData | EmailJobData;

export const notificationsWorker = createWorker<NotificationJobData>(
  QUEUES.NOTIFICATIONS,
  async (job) => {
    if (job.name === 'send-sms') {
      const data = job.data as SmsJobData;
      await sendSMS(data.to, data.message);
      await job.log(`SMS sent to ${data.to}`);
    } else if (job.name === 'send-email') {
      const data = job.data as EmailJobData;
      // TODO: Implement email sending via Resend
      await job.log(`Email queued to ${data.to}: ${data.subject}`);
    }
  },
);

notificationsWorker.on('failed', (job, err: Error) => {
  console.error(`Notification job ${job?.id ?? 'unknown'} failed:`, err.message);
});
