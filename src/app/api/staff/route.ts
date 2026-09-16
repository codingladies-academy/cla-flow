import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Sign in first.");

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      color: users.color,
      photoUrl: users.photoUrl,
      userType: users.userType,
      lastActiveAt: users.lastActiveAt,
    })
    .from(users)
    .where(eq(users.kind, "human"))
    .orderBy(users.name);

  const now = Date.now();
  const staff = rows.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    color: s.color,
    photoUrl: s.photoUrl,
    userType: (s.userType as "staff" | "volunteer") || "staff",
    lastActiveAt: s.lastActiveAt ? s.lastActiveAt.toISOString() : null,
    isOnline: s.lastActiveAt ? now - new Date(s.lastActiveAt).getTime() < 3 * 60 * 1000 : false,
  }));

  return json({ staff });
});
