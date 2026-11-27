import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ session: { user: { id: "user-1" } } }) }));
vi.mock("@/features/push/pushNotifications", () => ({
  disablePushNotifications: vi.fn(),
  enablePushNotifications: vi.fn(),
  getPushNotificationStatus: vi.fn(),
  requestPushPermission: vi.fn(),
  showPushTestNotification: vi.fn(),
}));
vi.mock("@/features/push/pushConfig", () => ({
  getFirebaseBrowserConfigStatus: () => "missing",
  PUSH_CONFIG_MISCONFIGURED_MESSAGE: "Push notifications are misconfigured.",
}));
vi.mock("@/features/push/PushPermissionPrompt", () => ({
  isIOSDevice: () => false,
  isStandalone: () => false,
  supportsPush: () => false,
}));

import { NotificationSettings } from "./NotificationSettings";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { user_id: "user-1" }, error: null }),
      }),
    }),
    update: mocks.update,
    insert: mocks.insert,
  }));
  mocks.update.mockImplementation((values: Record<string, boolean>) => ({
    eq: (column: string, value: string) => {
      mocks.updateEq(column, value);
      return Promise.resolve({ error: null, values });
    },
  }));
  mocks.insert.mockResolvedValue({ error: null });
});

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(NotificationSettings)));
}

describe("NotificationSettings", () => {
  it("uses accessible switches and persists the master notification preference", async () => {
    renderSettings();
    const master = await screen.findByRole("switch", { name: "Enable notifications" });
    expect(master).toHaveAttribute("aria-checked", "true");
    fireEvent.click(master);

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ notify_enabled: false }));
    expect(mocks.updateEq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("persists Voice Space invitation notifications as their own category", async () => {
    renderSettings();
    const voice = await screen.findByRole("switch", { name: "Voice Space invitations" });
    fireEvent.click(voice);

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ notify_voice: false }));
  });
});
