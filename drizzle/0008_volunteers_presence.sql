ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "user_type" text DEFAULT 'staff' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp with time zone;
