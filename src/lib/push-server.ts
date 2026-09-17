import "server-only";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

// Generate or retrieve VAPID keys
let vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@flow.codingladies.org";

// Fallback in-memory VAPID keys if not specified in env (auto-configured for zero hassle)
if (!vapidPublicKey || !vapidPrivateKey) {
  const generated = webpush.generateVAPIDKeys();
  vapidPublicKey = vapidPublicKey || generated.publicKey;
  vapidPrivateKey = vapidPrivateKey || generated.privateKey;
}

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

export function getVapidPublicKey(): string {
  return vapidPublicKey!;
}

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  data?: Record<string, unknown>;
};

/**
 * Send a web push notification to all active devices of a user.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    if (subscriptions.length === 0) return;

    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/icon.svg",
      badge: payload.badge || "/icon.svg",
      url: payload.url || "/",
      ...payload.data,
    });

    const sendPromises = subscriptions.map(async (sub) => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSub, payloadString);
      } catch (err: unknown) {
        const error = err as { statusCode?: number };
        // If subscription has expired or is gone (404/410), clean it up from DB
        if (error.statusCode === 404 || error.statusCode === 410) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id))
            .catch(() => {});
        } else {
          console.error("Push notification send error:", err);
        }
      }
    });

    await Promise.allSettled(sendPromises);
  } catch (err) {
    console.error("Failed to send push notification to user:", userId, err);
  }
}
