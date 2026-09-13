import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, hashPassword, HttpError, isAdmin } from "@/lib/auth";
import { body, json, route } from "@/lib/api";
import { emailSender } from "@/lib/emailSender";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) throw new HttpError(403, "Admin only.");
  return user;
}

function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let part1 = "";
  let part2 = "";
  for (let i = 0; i < 4; i++) {
    part1 += chars[crypto.randomInt(0, chars.length)];
    part2 += chars[crypto.randomInt(0, chars.length)];
  }
  return `CLA-${part1}-${part2}`;
}

export const POST = route(async (req: Request, { params }: { params: Promise<{ userId: string }> }) => {
  await requireAdmin();
  const { userId } = await params;
  const input = await body<{ password?: string; sendEmail?: boolean }>(req);

  const [targetUser] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!targetUser) throw new HttpError(404, "User not found.");

  let newPassword = input.password?.trim();
  if (!newPassword) {
    newPassword = generateTempPassword();
  } else if (newPassword.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }

  const passwordHash = await hashPassword(newPassword);

  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId));

  let emailSent = false;
  let emailError: string | null = null;

  if (input.sendEmail !== false && targetUser.email) {
    try {
      const loginUrl = process.env.NEXT_PUBLIC_APP_URL || "https://flow.codingladies.org/login";
      const res = await emailSender.sendEmail({
        to: targetUser.email,
        email: targetUser.email,
        subject: "Your CLA Flow Password Has Been Reset",
        first_name: targetUser.name.split(" ")[0] || targetUser.name,
        html: `
          <p>Hello <strong>${targetUser.name}</strong>,</p>
          <p>An administrator has reset your password for your <strong>CLA Flow</strong> staff account.</p>
          <div style="background: #e6fffa; border: 1px solid #00BFB3; border-radius: 8px; padding: 14px 18px; margin: 18px 0;">
            <p style="margin: 0 0 6px 0; font-size: 13px; color: #044e47;">Your new temporary password:</p>
            <code style="font-size: 18px; font-weight: bold; color: #00796B; font-family: monospace; letter-spacing: 1px;">${newPassword}</code>
          </div>
          <p>Please log in and update your password under your <strong>Account</strong> settings.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${loginUrl}" class="button" style="background-color: #00BFB3; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">Log in to CLA Flow</a>
          </div>
        `,
      });
      emailSent = res.success;
      if (!res.success) emailError = res.error || "Email delivery failed";
    } catch (err: any) {
      emailError = err?.message || "Email error";
    }
  }

  return json({
    success: true,
    password: newPassword,
    emailSent,
    emailError,
  });
});
