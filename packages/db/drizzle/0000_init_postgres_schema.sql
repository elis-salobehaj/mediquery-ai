CREATE TABLE IF NOT EXISTS "alembic_version" (
	"version_num" varchar(32) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid,
	"user_id" uuid,
	"role" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"agent_type" varchar(50),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"title" varchar(255),
	"pinned" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_blacklist" (
	"token" varchar PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"request_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"model" varchar(255) NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"total_tokens" integer GENERATED ALWAYS AS ((input_tokens + output_tokens)) STORED,
	"cost_usd" numeric(10, 6),
	"request_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"agent_type" varchar(50)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(255) NOT NULL,
	"email" varchar(255),
	"hashed_password" varchar(255) NOT NULL,
	"full_name" varchar(255),
	"role" varchar(50) DEFAULT 'user',
	"is_active" boolean DEFAULT true,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"monthly_token_limit" integer DEFAULT 1000000,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "users_username_key" UNIQUE("username"),
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE MATERIALIZED VIEW IF NOT EXISTS "user_monthly_usage" AS (
	SELECT
		user_id,
		to_char((created_at AT TIME ZONE 'UTC'::text), 'YYYY-MM'::text) AS calendar_month,
		provider,
		sum(input_tokens) AS total_input_tokens,
		sum(output_tokens) AS total_output_tokens,
		sum(total_tokens) AS total_tokens,
		sum(cost_usd) AS total_cost,
		count(*) AS request_count,
		max(created_at) AS last_updated
	FROM token_usage
	GROUP BY user_id, (to_char((created_at AT TIME ZONE 'UTC'::text), 'YYYY-MM'::text)), provider
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_thread" ON "chat_messages" USING btree ("thread_id" uuid_ops, "created_at" timestamptz_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_user" ON "chat_messages" USING btree ("user_id" uuid_ops, "created_at" timestamptz_ops DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_request" ON "token_usage" USING btree ("request_id" uuid_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_user_month" ON "token_usage" USING btree ("user_id" uuid_ops, "created_at" timestamptz_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" USING btree ("email" text_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_username" ON "users" USING btree ("username" text_ops);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "fk_thread_msg" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
