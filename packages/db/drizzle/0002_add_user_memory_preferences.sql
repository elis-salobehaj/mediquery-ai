CREATE TABLE IF NOT EXISTS "user_memory_preferences" (
	"user_id" uuid NOT NULL,
	"preferred_units" varchar(64),
	"preferred_chart_style" varchar(64),
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "user_memory_preferences_user_id_key" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_memory_preferences" ADD CONSTRAINT "user_memory_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
