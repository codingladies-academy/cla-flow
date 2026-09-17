import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { users } from "@/db/schema";
import {
  generateBackupCodes,
  generateTotpSecret,
  getTotpUri,
  verifyTotpCode,
} from "@/lib/totp";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const [dbUser] = await db
    .select({
      twoFactorEnabled: users.twoFactorEnabled,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (dbUser?.twoFactorEnabled) {
    return NextResponse.json({
      enabled: true,
    });
  }

  // Generate a secret for setup
  const secret = generateTotpSecret();
  const uri = getTotpUri({
    secret,
    accountName: user.email,
  });

  return NextResponse.json({
    enabled: false,
    secret,
    uri,
  });
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const { secret, code } = body;

    if (!secret || !code) {
      return NextResponse.json({ error: "Secret and 6-digit code are required" }, { status: 400 });
    }

    const isValid = verifyTotpCode(secret, code);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid verification code. Please check your Authenticator app." }, { status: 400 });
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes(8);

    await db
      .update(users)
      .set({
        twoFactorSecret: secret,
        twoFactorEnabled: true,
        twoFactorBackupCodes: backupCodes,
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      backupCodes,
    });
  } catch (err) {
    console.error("Failed to setup 2FA:", err);
    return NextResponse.json({ error: "Failed to setup 2FA" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await db
      .update(users)
      .set({
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: [],
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to disable 2FA:", err);
    return NextResponse.json({ error: "Failed to disable 2FA" }, { status: 500 });
  }
}
