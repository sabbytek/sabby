DO $$ BEGIN
 CREATE TYPE "public"."grant_scope" AS ENUM('read', 'write');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."platform_role" AS ENUM('super_admin', 'admin', 'support', 'read_only');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"tenant_id" text,
	"reason" text,
	"ip_address" text,
	"user_agent" text,
	"request_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"role" "platform_role" DEFAULT 'read_only' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"mfa_secret_encrypted" text,
	"mfa_enabled_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_access_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"scope" "grant_scope" DEFAULT 'read' NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_platform_user_id_platform_users_id_fk" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_access_grants" ADD CONSTRAINT "tenant_access_grants_platform_user_id_platform_users_id_fk" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_access_grants" ADD CONSTRAINT "tenant_access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_audit_actor_idx" ON "platform_audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_audit_tenant_idx" ON "platform_audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_audit_action_idx" ON "platform_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_audit_created_idx" ON "platform_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_sessions_user_idx" ON "platform_sessions" USING btree ("platform_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_sessions_prefix_idx" ON "platform_sessions" USING btree ("token_prefix");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_sessions_expiry_idx" ON "platform_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_users_email_idx" ON "platform_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_users_active_idx" ON "platform_users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_access_grants_active_idx" ON "tenant_access_grants" USING btree ("platform_user_id","tenant_id","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_access_grants_tenant_idx" ON "tenant_access_grants" USING btree ("tenant_id");