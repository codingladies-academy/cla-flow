import { body, json, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getWorkspace, updateWorkspace } from "@/lib/queries";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ workspaceId: string }> }) => {
  const user = await requireUser();
  const { workspaceId } = await ctx.params;
  const workspace = await getWorkspace(workspaceId, user.id);
  return json({ workspace });
});

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ workspaceId: string }> }) => {
  const user = await requireUser();
  const { workspaceId } = await ctx.params;
  const input = await body<{ name?: string; iconUrl?: string | null }>(req);

  const updated = await updateWorkspace(workspaceId, user.id, {
    name: input.name,
    iconUrl: input.iconUrl,
  });

  return json({ workspace: updated });
});
