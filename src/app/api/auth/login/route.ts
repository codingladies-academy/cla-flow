import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { twoFactorChallenges, users } from "@/db/schema";
import { createSession, HttpError, verifyPassword } from "@/lib/auth";
import { body, json, route } from "@/lib/api";

export const POST = route(async (req: Request) => {
  const input = await body<{ email?: string; password?: string }>(req);
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!email.endsWith("@codingladies.org")) {
    throw new HttpError(403, "Only @codingladies.org accounts are allowed.");
  }
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) throw new HttpError(401, "Wrong email or password.");

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const challengeId = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await db.insert(twoFactorChallenges).values({
      id: challengeId,
      userId: user.id,
      expiresAt,
    });

    return json({
      requires2FA: true,
      challengeId,
    });
  }

  await createSession(user.id);
  return json({ user: { id: user.id, email, name: user.name, color: user.color } });
});
