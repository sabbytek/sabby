import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET_NAME: z.string(),
  R2_PUBLIC_URL: z.string().url(),

  // Paystack
  PAYSTACK_SECRET_KEY: z.string(),
  PAYSTACK_PUBLIC_KEY: z.string(),

  // SMS provider (termii | vtpass)
  SMS_PROVIDER: z.enum(['termii', 'vtpass']).default('termii'),
  TERMII_API_KEY: z.string(),
  TERMII_SENDER_ID: z.string().default('BPOS'),
  VTPASS_API_KEY: z.string().optional(),
  VTPASS_SENDER_ID: z.string().optional(),

  // Flutterwave (Phase 2 — alternative gateway)
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_PUBLIC_KEY: z.string().optional(),
  FLUTTERWAVE_WEBHOOK_SECRET: z.string().optional(),
  DEFAULT_PAYMENT_GATEWAY: z.enum(['paystack', 'flutterwave']).default('paystack'),

  // WhatsApp (Phase 2 — optional at launch)
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),

  // Logistics (optional — enables dispatch module when set)
  PLATFORM_ENCRYPTION_KEY: z.string().min(64).optional(), // 32-byte hex = 64 hex chars

  // Platform
  PLATFORM_BASE_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3001,http://localhost:3002'),

  // Feature flags
  SWAGGER_ENABLED: z.coerce.boolean().default(true),

  // Uploads
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024), // 10MB raw cap pre-compression

  // Alerting (optional — Slack notifications for server errors)
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // Sentry (optional — exception tracking)
  SENTRY_DSN: z.string().url().optional(),

  // Axiom (optional — structured log drain)
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().default('bpos-production'),

  // Email (optional — invoice delivery via Resend; emails skipped when not set)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    console.error('Invalid environment configuration:', JSON.stringify(formatted, null, 2));
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
