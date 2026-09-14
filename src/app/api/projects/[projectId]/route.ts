import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectMembers, projects, workspaceMembers, workspaces } from "@/db/schema";
import { canMoveProject, HttpError, isAdmin, isSuperUser } from "@/lib/auth";
import { body, broadcast, clientIdOf, guard, json, ownerOnly, route, str } from "@/lib/api";

type Ctx = { params: Promise<{ projectId: string }> };

export const PATCH = route<Ctx>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const { user, membership } = await guard(projectId);

  const input = await body<{ name?: string; key?: string; workspaceId?: string; isPrivate?: boolean }>(req);
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined || input.key !== undefined) {
    ownerOnly(user, membership, "rename the project");
    if (input.name !== undefined) patch.name = str(input.name, "Project name", { max: 80 });
    if (input.key !== undefined) {
      const key = str(input.key, "Project key", { max: 6 })
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      if (!key) throw new HttpError(400, "The project key needs at least one letter or digit.");
      patch.key = key;
    }
  }

  if (input.isPrivate !== undefined) {
    ownerOnly(user, membership, "change project privacy");
    patch.isPrivate = Boolean(input.isPrivate);
  }

  if (input.workspaceId !== undefined) {
    const targetWsId = str(input.workspaceId, "Target workspace ID");
    const allowed = await canMoveProject(user.id, projectId);
    if (!allowed) {
      throw new HttpError(403, "Only workspace owners and super admins can move projects to other workspaces.");
    }

    const [destWs] = await db.select().from(workspaces).where(eq(workspaces.id, targetWsId)).limit(1);
    if (!destWs) throw new HttpError(404, "Destination workspace not found.");

    if (!(await isSuperUser(user.id))) {
      const [destMember] = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, targetWsId), eq(workspaceMembers.userId, user.id)))
        .limit(1);
      if (!destMember && destWs.ownerId !== user.id) {
        throw new HttpError(403, "You do not have access to the destination workspace.");
      }
    }

    patch.workspaceId = targetWsId;
  }

  if (Object.keys(patch).length === 0) return json({ ok: true });

  await db.update(projects).set(patch).where(eq(projects.id, projectId));

  // If project was made workspace-wide, sync existing workspace members into projectMembers
  if (patch.isPrivate === false) {
    const [proj] = await db.select({ workspaceId: projects.workspaceId }).from(projects).where(eq(projects.id, projectId)).limit(1);
    if (proj?.workspaceId) {
      const wsM = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, proj.workspaceId));
      if (wsM.length) {
        await db
          .insert(projectMembers)
          .values(wsM.map((m) => ({ projectId, userId: m.userId, role: "member" })))
          .onConflictDoNothing();
      }
    }
  }

  // If project was moved to another workspace, ensure all project members are added to target workspaceMembers
  if (patch.workspaceId) {
    const targetWsId = patch.workspaceId as string;
    const pMembers = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId));
    if (pMembers.length) {
      await db
        .insert(workspaceMembers)
        .values(pMembers.map((m) => ({ workspaceId: targetWsId, userId: m.userId, role: "member" })))
        .onConflictDoNothing();
    }
  }

  await broadcast({ projectId, scope: "project", clientId: clientIdOf(req) });
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const { user, membership } = await guard(projectId);
  ownerOnly(user, membership, "delete the project");
  await db.delete(projects).where(eq(projects.id, projectId));
  return json({ ok: true });
});
