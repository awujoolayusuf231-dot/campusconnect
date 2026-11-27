import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), delete: vi.fn(), not: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));

import { NotificationBell } from "./NotificationBell";

let previewReadAt: string | null;
let previewCleared: boolean;

beforeEach(() => {
  vi.clearAllMocks();
  previewReadAt = null;
  previewCleared = false;
  mocks.not.mockImplementation(() => {
    previewCleared = true;
    return Promise.resolve({ data: null, error: null });
  });
  mocks.delete.mockReturnValue({ not: mocks.not });
  mocks.from.mockReturnValue({ delete: mocks.delete });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { this.callback([{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    disconnect() {}
    unobserve() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = "0px";
    thresholds = [0.6];
  });
  mocks.rpc.mockImplementation((name: string) => {
    if (name === "notifications_list") return Promise.resolve({
      data: previewCleared ? [] : [{
        id: 8,
        type: "voice_invitation",
        actor_id: "user-2",
        actor_username: "amina",
        actor_display_name: "Amina Bello",
        entity_type: "voice_room",
        entity_id: "room-1",
        data: { title: "Study session" },
        created_at: "2026-11-27T09:00:00.000Z",
        read_at: previewReadAt,
      }],
      error: null,
    });
    if (name === "mark_notifications_read") {
      previewReadAt = new Date().toISOString();
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
});

function BellHarness({ unreadCount }: { unreadCount: number }) {
  const [open, setOpen] = useState(false);
  return createElement(NotificationBell, { unreadCount, open, onOpenChange: setOpen });
}

describe("NotificationBell", () => {
  it("marks a visible notification as read and removes it from the preview", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(MemoryRouter, null,
      createElement(QueryClientProvider, { client },
        createElement(BellHarness, { unreadCount: 1 }),
      ),
    ));

    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    const invitation = await screen.findByRole("link", { name: /Amina Bello invited you to join Study session/ });
    expect(invitation).toHaveAttribute("href", "/app/voice-spaces/room-1");
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("mark_notifications_read", { p_ids: [8] }));
    await waitFor(() => expect(screen.queryByRole("link", { name: /Amina Bello invited you to join Study session/ })).not.toBeInTheDocument());
  });

  it("closes the preview on an outside pointer action", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(MemoryRouter, null,
      createElement(QueryClientProvider, { client },
        createElement(BellHarness, { unreadCount: 0 }),
      ),
    ));
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByRole("region", { name: "Recent notifications" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Recent notifications" })).not.toBeInTheDocument());
  });

  it("shows broadcasts in the preview and links to the full notification", async () => {
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "notifications_list" ? [{
        id: 8,
        type: "announcement",
        actor_id: null,
        actor_username: null,
        actor_display_name: null,
        entity_type: "announcement",
        entity_id: "announcement-1",
        data: { title: "Campus update", body: "The library will open late tomorrow." },
        created_at: "2026-11-27T09:00:00.000Z",
        read_at: null,
      }] : null,
      error: null,
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(MemoryRouter, null,
      createElement(QueryClientProvider, { client },
        createElement(BellHarness, { unreadCount: 1 }),
      ),
    ));

    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    const broadcast = await screen.findByRole("link", { name: /Announcement: Campus update/ });
    expect(broadcast).toHaveAttribute("href", "/app/notifications?announcement=announcement-1");
    expect(broadcast).toHaveTextContent("The library will open late tomorrow.");
    expect(mocks.rpc).not.toHaveBeenCalledWith("mark_notifications_read", { p_ids: [8] });
  });

  it("marks all notifications read from the preview", async () => {
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = "0px";
      thresholds = [0.6];
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(MemoryRouter, null,
      createElement(QueryClientProvider, { client },
        createElement(BellHarness, { unreadCount: 1 }),
      ),
    ));

    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark all as read" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("mark_notifications_read"));
    await waitFor(() => expect(screen.queryByRole("link", { name: /Amina Bello invited you/ })).not.toBeInTheDocument());
  });

  it("clears all notifications from the inbox", async () => {
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = "0px";
      thresholds = [0.6];
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(MemoryRouter, null,
      createElement(QueryClientProvider, { client },
        createElement(BellHarness, { unreadCount: 1 }),
      ),
    ));

    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear all" }));

    await waitFor(() => expect(mocks.from).toHaveBeenCalledWith("notifications"));
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.not).toHaveBeenCalledWith("id", "is", null);
    await waitFor(() => expect(screen.queryByRole("link", { name: /Amina Bello invited you/ })).not.toBeInTheDocument());
  });
});
