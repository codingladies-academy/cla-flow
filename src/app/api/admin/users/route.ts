import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, hashPassword, HttpError, isAdmin } from "@/lib/auth";
import { body, json, route, str } from "@/lib/api";
import { pickAvatarColor } from "@/lib/colors";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) throw new HttpError(403, "Admin only.");
  return user;
}

/** List all human accounts. */
export const GET = route(async () => {
  await requireAdmin();
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, color: users.color, photoUrl: users.photoUrl, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.kind, "human"))
    .orderBy(users.createdAt);
  return json({ users: rows });
});

/** Create a new staff account. */
export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body<{ email?: string; name?: string; password?: string }>(req);

  const email = str(input.email, "Email", { max: 200 }).toLowerCase();
  const name = str(input.name, "Name", { max: 80 });

  if (!email.endsWith("@codingladies.org")) {
    throw new HttpError(400, "Only @codingladies.org emails are allowed.");
  }
  if (typeof input.password !== "string" || input.password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new HttpError(409, "An account with that email already exists.");

  const [user] = await db
    .insert(users)
    .values({ email, name, passwordHash: await hashPassword(input.password), color: pickAvatarColor(email) })
    .returning({ id: users.id, email: users.email, name: users.name });

  return json({ user });
});
