import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { NotificationBell } from "./NotificationBell";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation((name: string) => {
    if (name === "notifications_list") return Promise.resolve({
      data: [{
        id: 8,
        type: "voice_invitation",
        actor_id: "user-2",
        actor_username: "amina",
        actor_display_name: "Amina Bello",
        entity_type: "voice_room",
        entity_id: "room-1",
        data: { title: "Study session" },
        created_at: "2026-11-27T09:00:00.000Z",
        read_at: null,
      }],
      error: null,
    });
    return Promise.resolve({ data: null, error: null });
  });
});

describe("NotificationBell", () => {
  it("opens a preview without marking notifications read, then marks the selected invitation", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(MemoryRouter, null,
      createElement(QueryClientProvider, { client },
        createElement(NotificationBell, { unreadCount: 1 }),
      ),
    ));

    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    const invitation = await screen.findByRole("link", { name: /Amina Bello invited you to join Study session/ });
    expect(invitation).toHaveAttribute("href", "/app/voice-spaces/room-1");
    expect(mocks.rpc).not.toHaveBeenCalledWith("mark_notifications_read", expect.anything());

    fireEvent.click(invitation);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("mark_notifications_read", { p_ids: [8] }));
  });

  it("closes the preview on an outside pointer action", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(MemoryRouter, null,
      createElement(QueryClientProvider, { client },
        createElement(NotificationBell, { unreadCount: 0 }),
      ),
    ));
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByRole("region", { name: "Recent notifications" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Recent notifications" })).not.toBeInTheDocument());
  });
});
