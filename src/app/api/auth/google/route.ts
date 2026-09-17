import { randomBytes } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { twoFactorChallenges, users } from "@/db/schema";
import { createSession, HttpError } from "@/lib/auth";
import { body, json, route } from "@/lib/api";

export const POST = route(async (req: Request) => {
  const input = await body<{ credential?: string }>(req);
  const credential = typeof input.credential === "string" ? input.credential.trim() : "";

  if (!credential) {
    throw new HttpError(400, "Google credential is required.");
  }

  // 1. Verify token with Google
  const verifyRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );

  if (!verifyRes.ok) {
    throw new HttpError(401, "Invalid Google credential.");
  }

  const payload = await verifyRes.json();
  const email = (payload.email || "").toLowerCase().trim();
  const googleId = payload.sub;
  const name = payload.name || email.split("@")[0];
  const picture = payload.picture;

  if (!email || !email.endsWith("@codingladies.org")) {
    throw new HttpError(403, "Only @codingladies.org accounts are allowed.");
  }

  // 2. Find user by email or googleId
  let [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, email), eq(users.googleId, googleId)))
    .limit(1);

  if (!user) {
    // Create new user
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        name,
        googleId,
        photoUrl: picture,
        kind: "human",
        userType: "staff",
      })
      .returning();
    user = newUser;
  } else if (!user.googleId) {
    // Link Google ID
    await db
      .update(users)
      .set({ googleId, photoUrl: user.photoUrl || picture })
      .where(eq(users.id, user.id));
  }

  // 3. Check 2FA
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const challengeId = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

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

  // 4. Create session
  await createSession(user.id);
  return json({
    user: { id: user.id, email: user.email, name: user.name, color: user.color },
  });
});
