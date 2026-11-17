export const PUSH_PROMPT_DISMISSED_KEY = "campusconnect-push-prompt-dismissed-at";
export const PUSH_PROMPT_SESSION_KEY = "campusconnect-push-prompt-shown";
export const PUSH_PROMPT_DISMISSAL_MS = 7 * 24 * 60 * 60 * 1000;

export type PushPermissionPromptMode = "enable" | "ios-install" | null;

export function getPushPermissionPromptMode(input: {
  permission: NotificationPermission | "unsupported";
  supported: boolean;
  pushEnabled: boolean;
  isIOS: boolean;
  standalone: boolean;
  dismissedAt: number | null;
  shownThisSession: boolean;
  now: number;
}): PushPermissionPromptMode {
  const iosInstallRequired = input.isIOS && !input.standalone;
  if (
    (input.permission !== "default" && !(iosInstallRequired && input.permission === "unsupported"))
    || !input.pushEnabled
    || input.shownThisSession
    || (input.dismissedAt !== null && input.now < input.dismissedAt + PUSH_PROMPT_DISMISSAL_MS)
  ) return null;

  if (iosInstallRequired) return "ios-install";
  if (!input.supported) return null;
  return "enable";
}
