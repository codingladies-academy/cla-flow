import { requireUser } from "@/lib/auth";
import { body, json, route, str } from "@/lib/api";
import { createProject, listProjects } from "@/lib/queries";
import { suggestProjectKey } from "@/lib/defaults";

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
  return json({ projects: await listProjects(user.id, workspaceId) });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = await body<{ name?: string; key?: string; workspaceId?: string; isPrivate?: boolean }>(req);
  const name = str(input.name, "Project name", { max: 80 });
  const rawKey =
    typeof input.key === "string" && input.key.trim() ? input.key : suggestProjectKey(name);
  const key =
    rawKey
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6) || "TSK";

  const workspaceId = typeof input.workspaceId === "string" && input.workspaceId ? input.workspaceId : undefined;
  const isPrivate = Boolean(input.isPrivate);

  const project = await createProject(user.id, name, key, workspaceId, isPrivate);
  return json({ project }, 201);
});
