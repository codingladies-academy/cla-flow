import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Heartbeat to report online presence */
export const POST = route(async () => {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Sign in first.");

  const now = new Date();
  await db
    .update(users)
    .set({ lastActiveAt: now })
    .where(eq(users.id, user.id));

  return json({ ok: true, lastActiveAt: now.toISOString() });
});
