import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { pushSubscriptions } from "@/db/schema";
import { getVapidPublicKey } from "@/lib/push-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return NextResponse.json({
    vapidPublicKey: getVapidPublicKey(),
  });
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const { endpoint, p256dh, auth, userAgent } = body;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Invalid subscription details" }, { status: 400 });
    }

    // Insert or update subscription
    await db
      .insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint,
        p256dh,
        auth,
        userAgent,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: user.id,
          p256dh,
          auth,
          userAgent,
        },
      });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to save push subscription:", err);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get("endpoint");

    if (endpoint) {
      await db
        .delete(pushSubscriptions)
        .where(
          and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint))
        );
    } else {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete push subscription:", err);
    return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
  }
}
