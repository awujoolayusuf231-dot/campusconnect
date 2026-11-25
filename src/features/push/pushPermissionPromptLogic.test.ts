import { describe, expect, it } from "vitest";
import {
  getPushPermissionPromptMode,
  PUSH_PROMPT_DISMISSAL_MS,
} from "./pushPermissionPromptLogic";

const now = Date.parse("2026-11-17T12:00:00.000Z");
const eligible = {
  permission: "default" as NotificationPermission,
  supported: true,
  pushEnabled: true,
  isIOS: false,
  standalone: false,
  dismissedAt: null,
  shownThisSession: false,
  now,
};

describe("push permission prompt visibility", () => {
  it("only offers activation for a supported browser with default permission", () => {
    expect(getPushPermissionPromptMode(eligible)).toBe("enable");
    expect(getPushPermissionPromptMode({ ...eligible, permission: "granted" })).toBeNull();
    expect(getPushPermissionPromptMode({ ...eligible, permission: "denied" })).toBeNull();
    expect(getPushPermissionPromptMode({ ...eligible, supported: false })).toBeNull();
    expect(getPushPermissionPromptMode({ ...eligible, permission: "unsupported" })).toBeNull();
  });

  it("honors push opt-out, seven-day dismissal, and once-per-session state", () => {
    expect(getPushPermissionPromptMode({ ...eligible, pushEnabled: false })).toBeNull();
    expect(getPushPermissionPromptMode({ ...eligible, dismissedAt: now - PUSH_PROMPT_DISMISSAL_MS + 1 })).toBeNull();
    expect(getPushPermissionPromptMode({ ...eligible, dismissedAt: now - PUSH_PROMPT_DISMISSAL_MS - 1 })).toBe("enable");
    expect(getPushPermissionPromptMode({ ...eligible, shownThisSession: true })).toBeNull();
  });

  it("shows Home Screen instructions for non-standalone iOS instead of requesting permission", () => {
    expect(getPushPermissionPromptMode({ ...eligible, isIOS: true })).toBe("ios-install");
    expect(getPushPermissionPromptMode({ ...eligible, isIOS: true, permission: "unsupported" })).toBe("ios-install");
    expect(getPushPermissionPromptMode({ ...eligible, isIOS: true, standalone: true })).toBe("enable");
    expect(getPushPermissionPromptMode({ ...eligible, isIOS: true, permission: "denied" })).toBeNull();
  });
});
