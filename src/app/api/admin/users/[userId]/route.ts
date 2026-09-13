import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, HttpError, isAdmin } from "@/lib/auth";
import { json, route } from "@/lib/api";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) throw new HttpError(403, "Admin only.");
  return user;
}

/** Delete a user account. Admin cannot delete themselves. */
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ userId: string }> }) => {
  const admin = await requireAdmin();
  const { userId } = await params;

  if (userId === admin.id) throw new HttpError(400, "You cannot delete your own account.");

  const deleted = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  if (!deleted.length) throw new HttpError(404, "User not found.");

  return json({ ok: true });
});

/** Update a staff account's details (photoUrl, name). */
export const PATCH = route(async (req: Request, { params }: { params: Promise<{ userId: string }> }) => {
  await requireAdmin();
  const { userId } = await params;
  const input = await (req.json ? req.json() : {}) as { photoUrl?: string | null; name?: string };

  const patch: { photoUrl?: string | null; name?: string } = {};

  if (input.photoUrl !== undefined) {
    if (input.photoUrl === null || input.photoUrl.trim() === "") {
      patch.photoUrl = null;
    } else {
      const trimmed = input.photoUrl.trim();
      if (!/^https?:\/\//i.test(trimmed)) {
        throw new HttpError(400, "Profile photo must be a valid URL starting with http:// or https://");
      }
      patch.photoUrl = trimmed;
    }
  }

  if (input.name !== undefined && typeof input.name === "string") {
    const trimmed = input.name.trim();
    if (trimmed) patch.name = trimmed;
  }

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning({ id: users.id, name: users.name, email: users.email, photoUrl: users.photoUrl, color: users.color });

  if (!updated) throw new HttpError(404, "User not found.");

  return json({ user: updated });
});
