import { beforeEach, describe, expect, it } from "vitest";
import {
  catchUpPresentation,
  claimNotificationForDisplay,
  clearShownNotificationsForTests,
  notificationAllowedByPreferences,
  pushNotificationAllowedByPreferences,
} from "./realtimeNotificationLogic";

beforeEach(() => {
  clearShownNotificationsForTests();
});

describe("notification display deduplication", () => {
  it("deduplicates by notification id, or by tag when no id is available", () => {
    expect(claimNotificationForDisplay("notification-1", "message:conversation-1")).toBe(true);
    expect(claimNotificationForDisplay("notification-1", "message:conversation-1")).toBe(false);
    expect(claimNotificationForDisplay(null, "message:conversation-2")).toBe(true);
    expect(claimNotificationForDisplay(undefined, "message:conversation-2")).toBe(false);
  });

  it("evicts the oldest key after reaching the 200-notification cap", () => {
    for (let id = 1; id <= 200; id += 1) {
      expect(claimNotificationForDisplay(id)).toBe(true);
    }

    expect(claimNotificationForDisplay(201)).toBe(true);
    expect(claimNotificationForDisplay(1)).toBe(true);
  });
});

describe("notification catch-up", () => {
  it("shows one to three notifications individually and summarizes larger batches", () => {
    expect(catchUpPresentation(0)).toBe("none");
    expect(catchUpPresentation(1)).toBe("individual");
    expect(catchUpPresentation(3)).toBe("individual");
    expect(catchUpPresentation(4)).toBe("summary");
  });
});

describe("notification preferences", () => {
  it("honors the global push setting and notification category settings", () => {
    expect(notificationAllowedByPreferences("message", { notify_push: false })).toBe(true);
    expect(notificationAllowedByPreferences("message", { notify_messages: false })).toBe(false);
    expect(notificationAllowedByPreferences("follow", { notify_follows: false })).toBe(false);
    expect(notificationAllowedByPreferences("message", { notify_push: true, notify_messages: true })).toBe(true);
  });

  it("honors the master switch and voice/collaboration notification categories", () => {
    expect(notificationAllowedByPreferences("voice_invitation", { notify_enabled: false })).toBe(false);
    expect(notificationAllowedByPreferences("voice_invitation", { notify_voice: false })).toBe(false);
    expect(notificationAllowedByPreferences("project_application", { notify_collaboration: false })).toBe(false);
    expect(notificationAllowedByPreferences("voice_invitation", { notify_enabled: true, notify_voice: true })).toBe(true);
  });

  it("uses the push preference only for background push delivery", () => {
    expect(pushNotificationAllowedByPreferences({ notify_push: false })).toBe(false);
    expect(pushNotificationAllowedByPreferences({ notify_enabled: false, notify_push: true })).toBe(false);
    expect(pushNotificationAllowedByPreferences({ notify_enabled: true, notify_push: true })).toBe(true);
  });
});
