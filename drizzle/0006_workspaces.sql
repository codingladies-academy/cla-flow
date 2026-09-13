CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"icon_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "is_private" boolean DEFAULT false NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_owner_id_users_id_fk'
  ) THEN
    ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_slug_idx" ON "workspaces" ("slug");
CREATE INDEX IF NOT EXISTS "workspace_members_user_idx" ON "workspace_members" ("user_id");

-- Backfill: create default workspace if none exists and link existing projects/users
DO $$
DECLARE
  def_ws_id uuid;
  first_admin_id uuid;
BEGIN
  SELECT "id" INTO def_ws_id FROM "workspaces" LIMIT 1;

  IF def_ws_id IS NULL THEN
    SELECT "id" INTO first_admin_id FROM "users" WHERE "kind" = 'human' ORDER BY "created_at" ASC LIMIT 1;
    IF first_admin_id IS NULL THEN
      SELECT "id" INTO first_admin_id FROM "users" ORDER BY "created_at" ASC LIMIT 1;
    END IF;

    IF first_admin_id IS NOT NULL THEN
      INSERT INTO "workspaces" ("name", "slug", "owner_id")
      VALUES ('Coding Ladies Academy', 'cla', first_admin_id)
      RETURNING "id" INTO def_ws_id;

      INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
      SELECT def_ws_id, "id", CASE WHEN "id" = first_admin_id THEN 'owner' ELSE 'member' END
      FROM "users" WHERE "kind" = 'human'
      ON CONFLICT DO NOTHING;

      UPDATE "projects" SET "workspace_id" = def_ws_id WHERE "workspace_id" IS NULL;
    END IF;
  ELSE
    UPDATE "projects" SET "workspace_id" = def_ws_id WHERE "workspace_id" IS NULL;
  END IF;
END $$;
