CREATE TABLE IF NOT EXISTS "chat_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'direct' NOT NULL,
	"workspace_id" uuid,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "chat_room_members" (
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_room_members_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);

CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_rooms_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_room_members_room_id_chat_rooms_id_fk'
  ) THEN
    ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_room_members_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_room_id_chat_rooms_id_fk'
  ) THEN
    ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_sender_id_users_id_fk'
  ) THEN
    ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "chat_rooms_workspace_idx" ON "chat_rooms" ("workspace_id");
CREATE INDEX IF NOT EXISTS "chat_rooms_kind_idx" ON "chat_rooms" ("kind");
CREATE INDEX IF NOT EXISTS "chat_room_members_user_idx" ON "chat_room_members" ("user_id");
CREATE INDEX IF NOT EXISTS "chat_messages_room_created_idx" ON "chat_messages" ("room_id", "created_at");
CREATE INDEX IF NOT EXISTS "chat_messages_sender_idx" ON "chat_messages" ("sender_id");
