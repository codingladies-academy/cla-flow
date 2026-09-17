/**
 * Client-side helper for browser Web Push notification registration.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function isPushSupported(): Promise<boolean> {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushPermissionState(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  return Notification.permission;
}

export async function subscribeToPushNotifications(): Promise<boolean> {
  try {
    if (!(await isPushSupported())) return false;

    // 1. Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    // 2. Ensure service worker is ready
    const registration = await navigator.serviceWorker.ready;

    // 3. Get VAPID public key from backend
    const res = await fetch("/api/notifications/push");
    if (!res.ok) return false;
    const { vapidPublicKey } = await res.json();
    if (!vapidPublicKey) return false;

    // 4. Subscribe to PushManager
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as ArrayBuffer,
      });
    }

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return false;
    }

    // 5. Send subscription to server
    const saveRes = await fetch("/api/notifications/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
        userAgent: navigator.userAgent,
      }),
    });

    return saveRes.ok;
  } catch (err) {
    console.error("Failed to subscribe to push notifications:", err);
    return false;
  }
}
