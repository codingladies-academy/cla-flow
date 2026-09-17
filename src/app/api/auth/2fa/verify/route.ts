import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { twoFactorChallenges, users } from "@/db/schema";
import { createSession, HttpError } from "@/lib/auth";
import { body, json, route } from "@/lib/api";
import { verifyTotpCode } from "@/lib/totp";

export const POST = route(async (req: Request) => {
  const input = await body<{ challengeId?: string; code?: string }>(req);
  const challengeId = typeof input.challengeId === "string" ? input.challengeId.trim() : "";
  const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";

  if (!challengeId || !code) {
    throw new HttpError(400, "Challenge ID and verification code are required.");
  }

  // Find valid challenge
  const [challenge] = await db
    .select()
    .from(twoFactorChallenges)
    .where(
      and(
        eq(twoFactorChallenges.id, challengeId),
        gt(twoFactorChallenges.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!challenge) {
    throw new HttpError(400, "Verification session expired. Please sign in again.");
  }

  // Fetch user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, challenge.userId))
    .limit(1);

  if (!user || !user.twoFactorSecret) {
    throw new HttpError(400, "2FA is not configured for this account.");
  }

  let isValid = false;

  // 1. Check if it's a 6-digit TOTP code
  if (/^\d{6}$/.test(code)) {
    isValid = verifyTotpCode(user.twoFactorSecret, code);
  }

  // 2. Check if it matches an emergency backup code
  if (!isValid && user.twoFactorBackupCodes && Array.isArray(user.twoFactorBackupCodes)) {
    const backupIndex = user.twoFactorBackupCodes.findIndex(
      (bc: string) => bc.toUpperCase() === code
    );

    if (backupIndex !== -1) {
      isValid = true;
      // Consume the backup code (single-use)
      const updatedBackupCodes = [...user.twoFactorBackupCodes];
      updatedBackupCodes.splice(backupIndex, 1);

      await db
        .update(users)
        .set({ twoFactorBackupCodes: updatedBackupCodes })
        .where(eq(users.id, user.id));
    }
  }

  if (!isValid) {
    throw new HttpError(400, "Invalid 2FA code or backup recovery code.");
  }

  // Delete challenge after successful verification
  await db
    .delete(twoFactorChallenges)
    .where(eq(twoFactorChallenges.id, challengeId))
    .catch(() => {});

  // Create session
  await createSession(user.id);

  return json({
    user: { id: user.id, email: user.email, name: user.name, color: user.color },
  });
});
