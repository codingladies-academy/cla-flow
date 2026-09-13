import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { projectMembers, projects, sessions, users, workspaceMembers, workspaces } from "@/db/schema";
import { bearerToken, holderOfToken } from "./agents";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SESSION_COOKIE = "ushabti_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  if (expected.length !== key.length) return false;
  return timingSafeEqual(key, expected);
}

export async function createSession(userId: string): Promise<void> {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

/** The id of the session cookie on this request, if there is one. */
export async function currentSessionId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  color: string;
  photoUrl: string | null;
};

/**
 * Whether this instance still takes new accounts. A board on the open internet
 * wants to stop after the team has signed up; there is no rate limit yet.
 */
export function signupIsOpen(): boolean {
  return (process.env.USHABTI_SIGNUP ?? "open").toLowerCase() !== "closed";
}

/** True when the logged-in user is the configured super admin. */
export function isAdmin(user: CurrentUser | null): boolean {
  const adminEmail = process.env.CLA_ADMIN_EMAIL?.toLowerCase();
  return !!adminEmail && !!user && user.email.toLowerCase() === adminEmail;
}

/**
 * Whoever is behind a request: a person with a session cookie, or an agent
 * with a token. From here down the two are treated the same, which is the
 * whole point: an agent is a member of the project like anybody else.
 */
export type Actor = {
  id: string;
  name: string;
  color: string;
  kind: "human" | "agent";
  /** Set for an agent. The token opens this project and no other. */
  tokenProjectId?: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      color: users.color,
      photoUrl: users.photoUrl,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  // An agent has no email and never holds a session, so the fallback is dead
  // code that keeps the type honest.
  return row ? { ...row, email: row.email ?? "", photoUrl: row.photoUrl ?? null } : null;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Sign in first.");
  return user;
}

/** The token first, then the cookie. Null when the request carries neither. */
export async function getActor(): Promise<Actor | null> {
  const token = bearerToken((await headers()).get("authorization"));
  if (token) {
    const holder = await holderOfToken(token);
    if (!holder) throw new HttpError(401, "That token is not valid any more.");
    return {
      id: holder.id,
      name: holder.name,
      color: holder.color,
      kind: "agent",
      tokenProjectId: holder.projectId,
    };
  }

  const user = await getCurrentUser();
  if (!user) return null;
  return { id: user.id, name: user.name, color: user.color, kind: "human" };
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new HttpError(401, "Sign in first, or send an agent token.");
  return actor;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Membership = {
  projectId: string;
  projectName: string;
  projectKey: string;
  ownerId: string;
  role: string;
};

/** Throws unless the user is a member of the project or has access through the workspace. */
export async function requireMembership(userId: string, projectId: string): Promise<Membership> {
  const rows = await db
    .select({
      projectId: projects.id,
      projectName: projects.name,
      projectKey: projects.key,
      ownerId: projects.ownerId,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);

  if (rows[0]) return rows[0];

  // If not explicitly in project_members, check if project is public to the workspace
  const projRows = await db
    .select({
      projectId: projects.id,
      projectName: projects.name,
      projectKey: projects.key,
      ownerId: projects.ownerId,
      workspaceId: projects.workspaceId,
      isPrivate: projects.isPrivate,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const proj = projRows[0];
  if (!proj) throw new HttpError(404, "Project not found.");

  // Super Admins have administrative owner access to all projects
  const [userRow] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const isSuper = userRow && isAdmin({ email: userRow.email } as any);

  // Workspace owners have administrative owner access to projects in their workspace
  let isWsOwner = false;
  if (proj.workspaceId) {
    const [ws] = await db
      .select({ ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, proj.workspaceId))
      .limit(1);
    if (ws && ws.ownerId === userId) isWsOwner = true;
    if (!isWsOwner) {
      const [wm] = await db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, proj.workspaceId), eq(workspaceMembers.userId, userId)))
        .limit(1);
      if (wm && wm.role === "owner") isWsOwner = true;
    }
  }

  if (isSuper || isWsOwner) {
    await db
      .insert(projectMembers)
      .values({
        projectId: proj.projectId,
        userId,
        role: "owner",
      })
      .onConflictDoNothing();

    return {
      projectId: proj.projectId,
      projectName: proj.projectName,
      projectKey: proj.projectKey,
      ownerId: proj.ownerId,
      role: "owner",
    };
  }

  if (!proj.isPrivate && proj.workspaceId) {
    const wsMember = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, proj.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);

    if (wsMember[0]) {
      await db
        .insert(projectMembers)
        .values({
          projectId: proj.projectId,
          userId,
          role: wsMember[0].role === "owner" ? "owner" : "member",
        })
        .onConflictDoNothing();

      return {
        projectId: proj.projectId,
        projectName: proj.projectName,
        projectKey: proj.projectKey,
        ownerId: proj.ownerId,
        role: wsMember[0].role === "owner" ? "owner" : "member",
      };
    }
  }

  throw new HttpError(404, "Project not found.");
}

export async function requireWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<{ workspaceId: string; role: string }> {
  const rows = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new HttpError(404, "Workspace not found.");
  return row;
}

export async function canCreateWorkspace(user: CurrentUser | null): Promise<boolean> {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const owned = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.ownerId, user.id))
    .limit(1);
  return owned.length > 0;
}

export async function isSuperUser(userId: string): Promise<boolean> {
  const [userRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return !!userRow && isAdmin({ email: userRow.email } as any);
}

/** Workspace owners and Super Admins can move projects between workspaces. */
export async function canMoveProject(userId: string, projectId: string): Promise<boolean> {
  if (await isSuperUser(userId)) return true;

  const [proj] = await db
    .select({ workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!proj || !proj.workspaceId) return false;

  const [ws] = await db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, proj.workspaceId))
    .limit(1);

  if (ws && ws.ownerId === userId) return true;

  const [wm] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, proj.workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);

  return wm?.role === "owner";
}

