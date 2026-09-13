import { body, json, route, str } from "@/lib/api";
import { canCreateWorkspace, HttpError, isAdmin, requireUser } from "@/lib/auth";
import { createWorkspace, listWorkspaces } from "@/lib/queries";

export const GET = route(async () => {
  const user = await requireUser();
  const isSuper = isAdmin(user);
  const workspaces = await listWorkspaces(user.id, isSuper);
  const canCreate = await canCreateWorkspace(user);
  return json({ workspaces, canCreate, isSuperAdmin: isSuper });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const allowed = await canCreateWorkspace(user);
  if (!allowed) {
    throw new HttpError(403, "Only Super Admins and Workspace Owners can create workspaces.");
  }

  const input = await body<{ name?: string; iconUrl?: string }>(req);
  const name = str(input.name, "Workspace name", { min: 2, max: 60 });
  const iconUrl = typeof input.iconUrl === "string" ? input.iconUrl.trim() : null;

  const workspace = await createWorkspace(user.id, name, iconUrl);
  return json({ workspace }, 201);
});
