import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Sign in first.");

  const staff = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      color: users.color,
      photoUrl: users.photoUrl,
    })
    .from(users)
    .where(eq(users.kind, "human"))
    .orderBy(users.name);

  return json({ staff });
});
