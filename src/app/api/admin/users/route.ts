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
  const input = await body<{ email?: string; name?: string; password?: string; photoUrl?: string }>(req);

  const email = str(input.email, "Email", { max: 200 }).toLowerCase();
  const name = str(input.name, "Name", { max: 80 });

  if (!email.endsWith("@codingladies.org")) {
    throw new HttpError(400, "Only @codingladies.org emails are allowed.");
  }
  if (typeof input.password !== "string" || input.password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }

  let photoUrl: string | null = null;
  if (input.photoUrl && typeof input.photoUrl === "string" && input.photoUrl.trim()) {
    const trimmed = input.photoUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      throw new HttpError(400, "Profile photo must be a valid URL starting with http:// or https://");
    }
    photoUrl = trimmed;
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new HttpError(409, "An account with that email already exists.");

  const [user] = await db
    .insert(users)
    .values({
      email,
      name,
      passwordHash: await hashPassword(input.password),
      color: pickAvatarColor(email),
      photoUrl,
    })
    .returning({ id: users.id, email: users.email, name: users.name, photoUrl: users.photoUrl });

  return json({ user });
});
