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
