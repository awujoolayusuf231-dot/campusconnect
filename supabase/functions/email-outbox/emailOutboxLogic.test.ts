import { describe, expect, it, vi } from "vitest";
import {
  activityEmailCopy,
  appUrl,
  brandedEmailHtml,
  emailPreferenceForNotification,
  isImportantPlatformEmail,
  sendWithResend,
  shouldSendActivityEmail,
} from "./emailOutboxLogic";

describe("email outbox logic", () => {
  it("maps notification types to the existing category preferences", () => {
    expect(emailPreferenceForNotification("message")).toBe("notify_messages");
    expect(emailPreferenceForNotification("followed_post")).toBe("notify_followed_posts");
    expect(emailPreferenceForNotification("celebration_published")).toBe("notify_celebrations");
    expect(emailPreferenceForNotification("announcement")).toBeNull();
    expect(isImportantPlatformEmail("moderation_warning")).toBe(true);
    expect(isImportantPlatformEmail("like")).toBe(false);
  });

  it("opts out normal activity by default but still allows important account/platform notices", () => {
    const regular = {
      emailEnabled: false,
      categoryEnabled: true,
      accountStatus: "active",
      blocked: false,
      importantPlatformNotice: false,
    };
    expect(shouldSendActivityEmail(regular)).toBe(false);
    expect(shouldSendActivityEmail({ ...regular, emailEnabled: true })).toBe(true);
    expect(shouldSendActivityEmail({ ...regular, emailEnabled: true, blocked: true })).toBe(false);
    expect(shouldSendActivityEmail({ ...regular, importantPlatformNotice: true, accountStatus: "suspended" })).toBe(true);
  });

  it("builds private-safe activity copy and escapes HTML content", () => {
    expect(activityEmailCopy({
      type: "message",
      actorName: "Amina <script>alert(1)</script>",
      entityType: "conversation",
      entityId: "conversation-1",
    })).toEqual({
      subject: "New message",
      heading: "New message",
      body: "Amina <script>alert(1)</script> sent you a message",
      path: "/app/messages/conversation-1",
    });

    const html = brandedEmailHtml({
      recipientName: "<Student>",
      heading: "Welcome",
      body: "Your account is ready.",
      buttonLabel: "Open CampusConnect",
      buttonUrl: "https://campusconnect.example/app",
    });
    expect(html).toContain("Hi &lt;Student&gt;");
    expect(html).not.toContain("<Student>");
    expect(appUrl("https://campusconnect.example", "/app/notifications"))
      .toBe("https://campusconnect.example/app/notifications");
    expect(appUrl("https://campusconnect.example", "//evil.example"))
      .toBe("https://campusconnect.example/app/notifications");
    expect(() => appUrl("http://campusconnect.example", "/app")).toThrow("invalid_app_origin");
  });

  it("uses a stable Resend idempotency key and accepts successful delivery", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    const result = await sendWithResend({
      apiKey: "test_key",
      from: "CampusConnect <notifications@example.com>",
      to: "student@example.com",
      subject: "Welcome",
      html: "<p>Welcome</p>",
      idempotencyKey: "email-outbox-42",
      outboxId: 42,
      fetcher,
    });

    expect(result).toEqual({ result: "accepted", providerEmailId: "email_123", errorCode: null });
    expect(fetcher).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      headers: expect.objectContaining({ "Idempotency-Key": "email-outbox-42" }),
      body: expect.stringContaining('"email_outbox_id","value":"42"'),
    }));
  });

  it("retries temporary provider failures and fails permanent rejections", async () => {
    const temporary = await sendWithResend({
      apiKey: "test_key", from: "sender@example.com", to: "recipient@example.com",
      subject: "Notice", html: "<p>Notice</p>", idempotencyKey: "outbox-1",
      outboxId: 1,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 503 })),
    });
    const permanent = await sendWithResend({
      apiKey: "test_key", from: "sender@example.com", to: "recipient@example.com",
      subject: "Notice", html: "<p>Notice</p>", idempotencyKey: "outbox-2",
      outboxId: 2,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 422 })),
    });

    expect(temporary).toMatchObject({ result: "retry", errorCode: "resend_http_503" });
    expect(permanent).toMatchObject({ result: "failed", errorCode: "resend_http_422" });
  });
});
