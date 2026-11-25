function unsupportedPushMessage(): string {
  return "Web push is not available in this browser. On iPhone or iPad, add CampusConnect to your Home Screen (iOS/iPadOS 16.4+) and open it there.";
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    throw new Error(unsupportedPushMessage());
  }
  if (window.isSecureContext === false) {
    throw new Error("Browser push notifications require HTTPS (localhost is supported for development).");
  }
  return Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;
}
