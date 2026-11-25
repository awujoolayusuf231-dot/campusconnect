import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enablePushNotifications: vi.fn(),
  requestPushPermission: vi.fn(),
  showPushTestNotification: vi.fn(),
  isBrowserPushConfigured: vi.fn(() => true),
}));

vi.mock("./pushNotifications", () => ({
  enablePushNotifications: mocks.enablePushNotifications,
  showPushTestNotification: mocks.showPushTestNotification,
}));
vi.mock("./pushPermission", () => ({
  requestPushPermission: mocks.requestPushPermission,
}));
vi.mock("./pushConfig", () => ({
  isBrowserPushConfigured: mocks.isBrowserPushConfigured,
}));

import { PushPermissionPrompt } from "./PushPermissionPrompt";

const descriptors = {
  notification: Object.getOwnPropertyDescriptor(window, "Notification"),
  serviceWorker: Object.getOwnPropertyDescriptor(navigator, "serviceWorker"),
  pushManager: Object.getOwnPropertyDescriptor(window, "PushManager"),
  secureContext: Object.getOwnPropertyDescriptor(window, "isSecureContext"),
  matchMedia: Object.getOwnPropertyDescriptor(window, "matchMedia"),
  userAgent: Object.getOwnPropertyDescriptor(navigator, "userAgent"),
};

function renderPrompt(pushEnabled: boolean | null = true) {
  return render(<PushPermissionPrompt userId="user-1" pushEnabled={pushEnabled} />);
}

function advancePromptDelay() {
  act(() => {
    vi.advanceTimersByTime(3000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.isBrowserPushConfigured.mockReturnValue(true);
  mocks.requestPushPermission.mockResolvedValue("granted");
  mocks.enablePushNotifications.mockResolvedValue(undefined);
  mocks.showPushTestNotification.mockResolvedValue(undefined);
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { permission: "default" },
  });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
  Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false }),
  });
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0" });
});

afterEach(() => {
  vi.useRealTimers();
  for (const [key, descriptor] of Object.entries(descriptors)) {
    const target = key === "serviceWorker" || key === "userAgent" ? navigator : window;
    const property = key === "notification" ? "Notification"
      : key === "serviceWorker" ? "serviceWorker"
      : key === "pushManager" ? "PushManager"
      : key === "secureContext" ? "isSecureContext"
      : key === "matchMedia" ? "matchMedia"
      : "userAgent";
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else Reflect.deleteProperty(target, property);
  }
});

describe("push permission launch prompt", () => {
  it("waits three seconds and requests permission only from the enable button handler", async () => {
    renderPrompt();

    expect(mocks.requestPushPermission).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    advancePromptDelay();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(sessionStorage.getItem("campusconnect-push-prompt-shown:user-1")).toBe("1");
    expect(mocks.requestPushPermission).not.toHaveBeenCalled();

    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "Enable notifications" }));
    expect(mocks.requestPushPermission).toHaveBeenCalledOnce();
    await screen.findByText("Notifications enabled. A test notification was sent.");
    expect(mocks.enablePushNotifications).toHaveBeenCalledWith(expect.any(Promise), "user-1");
    expect(mocks.showPushTestNotification).toHaveBeenCalledOnce();
  });

  it("does not show when opted out, unsupported, or already shown this session", () => {
    const { unmount } = renderPrompt(false);
    advancePromptDelay();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();

    Object.defineProperty(window, "PushManager", { configurable: true, value: undefined });
    const unsupported = renderPrompt();
    advancePromptDelay();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unsupported.unmount();

    Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
    sessionStorage.setItem("campusconnect-push-prompt-shown:user-1", "1");
    renderPrompt();
    advancePromptDelay();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows Home Screen setup instructions rather than requesting permission on non-standalone iOS", () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone)" });
    Object.defineProperty(window, "PushManager", { configurable: true, value: undefined });
    renderPrompt();

    advancePromptDelay();

    expect(screen.getByRole("dialog")).toHaveTextContent("Add CampusConnect to your Home Screen");
    expect(screen.getByText(/Choose “Add to Home Screen”/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable notifications" })).not.toBeInTheDocument();
    expect(mocks.requestPushPermission).not.toHaveBeenCalled();
  });

  it("persists Not now dismissal for seven days", () => {
    renderPrompt();
    advancePromptDelay();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(Number(localStorage.getItem("campusconnect-push-prompt-dismissed-at:user-1"))).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
