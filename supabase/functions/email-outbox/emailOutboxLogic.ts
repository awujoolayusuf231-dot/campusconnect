import { notificationRoute } from "../_shared/notificationRoute.ts";
import { pushCopy } from "../process-outbox/pushOutboxLogic.ts";

export type EmailDeliveryResult = {
  result: "accepted" | "retry" | "failed";
  providerEmailId: string | null;
  errorCode: string | null;
};

export type ActivityEmail = {
  subject: string;
  heading: string;
  body: string;
  path: string;
};

export function emailPreferenceForNotification(type: string): string | null {
  switch (type) {
    case "follow":
      return "notify_follows";
    case "like":
    case "repost":
      return "notify_likes";
    case "comment":
      return "notify_comments";
    case "community_join":
      return "notify_community";
    case "message":
      return "notify_messages";
    case "discussion_reply":
      return "notify_discussions";
    case "followed_post":
      return "notify_followed_posts";
    case "celebration_reminder":
    case "celebration_published":
      return "notify_celebrations";
    default:
      return null;
  }
}

export function isImportantPlatformEmail(type: string): boolean {
  return type === "announcement" || type === "moderation_warning";
}

export function shouldSendActivityEmail(input: {
  emailEnabled: boolean;
  categoryEnabled: boolean;
  accountStatus: string | null;
  blocked: boolean;
  importantPlatformNotice: boolean;
}): boolean {
  if (!input.categoryEnabled) return false;
  if (input.importantPlatformNotice) return true;
  return input.emailEnabled
    && !input.blocked
    && (input.accountStatus === "active" || input.accountStatus === "restricted");
}

export function activityEmailCopy(input: {
  type: string;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  actorUsername?: string | null;
  data?: Record<string, unknown> | null;
}): ActivityEmail {
  const path = notificationRoute({
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    actorUsername: input.actorUsername,
    data: input.data,
  });
  if (input.type === "announcement") {
    return {
      subject: "A CampusConnect announcement",
      heading: "An update from CampusConnect",
      body: "There’s an important campus update waiting for you.",
      path,
    };
  }
  if (input.type === "moderation_warning") {
    return {
      subject: "An important account notice",
      heading: "An important account notice",
      body: "CampusConnect has sent you an account notice. Sign in to review the details.",
      path,
    };
  }
  const copy = pushCopy(
    input.type,
    input.actorName,
    input.entityType,
    input.entityId,
    input.actorUsername,
    input.data,
  );
  return { subject: copy.title, heading: copy.title, body: copy.body, path: copy.url };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function appUrl(baseUrl: string, path: string): string {
  const base = new URL(baseUrl);
  const hostname = base.hostname.toLowerCase();
  const localHttp = base.protocol === "http:"
    && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]");
  if (base.protocol !== "https:" && !localHttp) throw new Error("invalid_app_origin");
  const safePath = path.startsWith("/app/") ? path : "/app/notifications";
  return new URL(safePath, base.origin).toString();
}

export function brandedEmailHtml(input: {
  recipientName: string;
  heading: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
}): string {
  const name = escapeHtml(input.recipientName);
  const heading = escapeHtml(input.heading);
  const body = escapeHtml(input.body);
  const buttonLabel = escapeHtml(input.buttonLabel);
  const buttonUrl = escapeHtml(input.buttonUrl);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#f7f5f4;color:#241f20;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden">A CampusConnect update for ${name}.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f5f4;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e8e1df;border-radius:20px;overflow:hidden">
        <tr><td style="height:6px;background:#c52b3a;font-size:0">&nbsp;</td></tr>
        <tr><td style="padding:32px 28px">
          <p style="margin:0 0 28px;color:#241f20;font-size:18px;font-weight:700">Campus<span style="color:#c52b3a">Connect</span></p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3">${heading}</h1>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.7">Hi ${name},</p>
          <p style="margin:0 0 24px;color:#625b5d;font-size:15px;line-height:1.7">${body}</p>
          <p style="margin:0 0 28px"><a href="${buttonUrl}" style="display:inline-block;background:#c52b3a;border-radius:10px;color:#fff;font-size:14px;font-weight:700;padding:13px 20px;text-decoration:none">${buttonLabel}</a></p>
          <p style="margin:0;color:#756e70;font-size:12px;line-height:1.6">If the button doesn’t work, copy this link into your browser:<br><a href="${buttonUrl}" style="color:#a82331;word-break:break-all">${buttonUrl}</a></p>
        </td></tr>
        <tr><td style="border-top:1px solid #eee8e6;padding:18px 28px;color:#756e70;font-size:12px;line-height:1.6">CampusConnect · Your campus community, connected.<br>You’re receiving this email because it relates to your CampusConnect account.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendWithResend(input: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
  outboxId: number;
  fetcher?: typeof fetch;
}): Promise<EmailDeliveryResult> {
  try {
    const response = await (input.fetcher ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        tags: [{ name: "email_outbox_id", value: String(input.outboxId) }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const result: unknown = await response.json().catch(() => null);
    if (response.ok && typeof result === "object" && result !== null && "id" in result && typeof result.id === "string") {
      return { result: "accepted", providerEmailId: result.id, errorCode: null };
    }
    const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
    return {
      result: retryable ? "retry" : "failed",
      providerEmailId: null,
      errorCode: `resend_http_${response.status}`,
    };
  } catch (error) {
    return {
      result: "retry",
      providerEmailId: null,
      errorCode: error instanceof Error && error.name === "TimeoutError" ? "resend_timeout" : "resend_network_error",
    };
  }
}
