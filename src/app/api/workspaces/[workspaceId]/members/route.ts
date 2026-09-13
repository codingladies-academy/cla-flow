import { body, json, route, str } from "@/lib/api";
import { HttpError, requireUser, requireWorkspaceMembership } from "@/lib/auth";
import { listWorkspaceMembers } from "@/lib/queries";
import { db } from "@/db";
import { workspaceMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ workspaceId: string }> }) => {
  const user = await requireUser();
  const { workspaceId } = await ctx.params;
  await requireWorkspaceMembership(user.id, workspaceId);

  const members = await listWorkspaceMembers(workspaceId);
  return json({ members });
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ workspaceId: string }> }) => {
  const user = await requireUser();
  const { workspaceId } = await ctx.params;
  const current = await requireWorkspaceMembership(user.id, workspaceId);
  if (current.role !== "owner" && current.role !== "admin") {
    throw new HttpError(403, "Only workspace owners or admins can add members.");
  }

  const input = await body<{ userId?: string; role?: string }>(req);
  const targetUserId = str(input.userId, "User ID");
  const role = input.role === "admin" ? "admin" : "member";

  await db
    .insert(workspaceMembers)
    .values({
      workspaceId,
      userId: targetUserId,
      role,
    })
    .onConflictDoNothing();

  return json({ ok: true }, 201);
});

export const DELETE = route(async (req: Request, ctx: { params: Promise<{ workspaceId: string }> }) => {
  const user = await requireUser();
  const { workspaceId } = await ctx.params;
  const current = await requireWorkspaceMembership(user.id, workspaceId);
  if (current.role !== "owner" && current.role !== "admin") {
    throw new HttpError(403, "Only workspace owners or admins can remove members.");
  }

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("userId");
  if (!targetUserId) throw new HttpError(400, "userId parameter required.");

  if (targetUserId === user.id) {
    throw new HttpError(400, "Cannot remove yourself from the workspace.");
  }

  await db
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId)));

  return json({ ok: true });
});
