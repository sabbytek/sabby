import 'dotenv/config';
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

  // Platform (internal staff) JWT — a DISTINCT secret from the tenant plane, so
  // that a tenant-token compromise can never mint a platform token. Short-lived
  // by design: this console can reach across every tenant.
  //
  // Optional so dev/test boot without it; when unset the entire /v1/platform
  // plane is left unregistered. There is deliberately no default value — a
  // fallback secret would be equivalent to no authentication at all.
  // Required in production (enforced below).
  JWT_PLATFORM_SECRET: z.string().min(32).optional(),
  JWT_PLATFORM_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_PLATFORM_REFRESH_EXPIRY: z.string().default('8h'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET_NAME: z.string(),
  R2_PUBLIC_URL: z.string().url(),
  // Bucket for private files when PRIVATE_STORAGE_PROVIDER=r2. Give it no
  // public access or custom domain. Falls back to R2_BUCKET_NAME if unset.
  R2_PRIVATE_BUCKET_NAME: z.string().optional(),

  // Where private files (invoice PDFs, expense receipts) are stored.
  PRIVATE_STORAGE_PROVIDER: z.enum(['r2', 'neon']).default('r2'),

  // Neon object storage (S3-compatible) — private files. Optional so the app
  // boots without it; uploads that need it fail with a 502 until it is set.
  AWS_ENDPOINT_URL_S3: z.string().url().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-2'),
  NEON_STORAGE_BUCKET: z.string().default('assets'),

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
  MAX_UPLOAD_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024), // 10MB raw cap pre-compression

  // Alerting (optional — Slack notifications for server errors)
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // Sentry (optional — exception tracking)
  SENTRY_DSN: z.string().url().optional(),

  // Axiom (optional — structured log drain)
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().default('bpos-production'),

  // Email (optional — invoice delivery via Resend or Brevo; emails skipped when not set)
  EMAIL_PROVIDER: z.enum(['resend', 'brevo']).default('resend'),
  RESEND_API_KEY: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
});

/**
 * Secrets that are optional in dev/test but must be present in production.
 * Enforced here rather than at the field level so local development and the
 * test suite can boot without them, while a production deploy fails fast.
 */
const productionRequiredSchema = envSchema.superRefine((cfg, ctx) => {
  if (cfg.NODE_ENV !== 'production') return;
  if (!cfg.JWT_PLATFORM_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_PLATFORM_SECRET'],
      message:
        'JWT_PLATFORM_SECRET is required in production — the /v1/platform admin plane ' +
        'cannot run without its own signing secret.',
    });
  }
});

function parseEnv() {
  const result = productionRequiredSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    console.error('Invalid environment configuration:', JSON.stringify(formatted, null, 2));
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
