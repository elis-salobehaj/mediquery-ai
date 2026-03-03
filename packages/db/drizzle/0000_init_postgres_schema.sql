CREATE SCHEMA IF NOT EXISTS "mediquery_app";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mediquery_app"."chat_messages" (
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
CREATE TABLE IF NOT EXISTS "mediquery_app"."chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"title" varchar(255),
	"pinned" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mediquery_app"."token_blacklist" (
	"token" varchar PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mediquery_app"."token_usage" (
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
CREATE TABLE IF NOT EXISTS "mediquery_app"."user_memory_preferences" (
	"user_id" uuid NOT NULL,
	"preferred_units" varchar(64),
	"preferred_chart_style" varchar(64),
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "user_memory_preferences_user_id_key" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mediquery_app"."users" (
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
ALTER TABLE "mediquery_app"."chat_messages" ADD CONSTRAINT "chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "mediquery_app"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediquery_app"."chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "mediquery_app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediquery_app"."chat_messages" ADD CONSTRAINT "fk_thread_msg" FOREIGN KEY ("thread_id") REFERENCES "mediquery_app"."chat_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediquery_app"."chat_threads" ADD CONSTRAINT "chat_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "mediquery_app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediquery_app"."token_usage" ADD CONSTRAINT "token_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "mediquery_app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediquery_app"."user_memory_preferences" ADD CONSTRAINT "user_memory_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "mediquery_app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_thread" ON "mediquery_app"."chat_messages" USING btree ("thread_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_user" ON "mediquery_app"."chat_messages" USING btree ("user_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_request" ON "mediquery_app"."token_usage" USING btree ("request_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_user_month" ON "mediquery_app"."token_usage" USING btree ("user_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "mediquery_app"."users" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_username" ON "mediquery_app"."users" USING btree ("username" text_ops);--> statement-breakpoint
CREATE MATERIALIZED VIEW IF NOT EXISTS "mediquery_app"."user_monthly_usage" AS (SELECT user_id, to_char((created_at AT TIME ZONE 'UTC'::text), 'YYYY-MM'::text) AS calendar_month, provider, sum(input_tokens) AS total_input_tokens, sum(output_tokens) AS total_output_tokens, sum(total_tokens) AS total_tokens, sum(cost_usd) AS total_cost, count(*) AS request_count, max(created_at) AS last_updated FROM "mediquery_app"."token_usage" GROUP BY user_id, (to_char((created_at AT TIME ZONE 'UTC'::text), 'YYYY-MM'::text)), provider);