import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { describeNotification, NotificationsPage, type Notif } from "./NotificationsPage";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

function notification(type: string, entityId: string | null, data: Record<string, unknown> = {}, entityType: string | null = null): Notif {
  return {
    id: 1,
    type,
    actor_username: "amina",
    actor_display_name: "Amina Bello",
    entity_type: entityType,
    entity_id: entityId,
    data,
    created_at: "2026-11-27T09:00:00.000Z",
    read_at: null,
  };
}

describe("notification routing and copy", () => {
  it("routes an invitation directly to its Voice Space with the room name", () => {
    expect(describeNotification(notification("voice_invitation", "room-1", { title: "Study session" }, "voice_room"))).toEqual({
      text: "Amina Bello invited you to join Study session",
      to: "/app/voice-spaces/room-1",
    });
  });

  it("routes broadcast notifications to the inbox with their full message available", () => {
    expect(describeNotification(notification(
      "announcement",
      "announcement-1",
      { title: "Campus update", body: "The library will open late tomorrow." },
      "announcement",
    ))).toEqual({
      text: "Announcement: Campus update",
      to: "/app/notifications?announcement=announcement-1",
    });
  });
});

describe("NotificationsPage", () => {
  it("focuses on viewing notifications and links preference management to Settings", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(MemoryRouter, null,
      createElement(QueryClientProvider, { client }, createElement(NotificationsPage)),
    ));

    expect(await screen.findByText("You are all caught up.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account settings" })).toHaveAttribute("href", "/app/settings");
    expect(screen.queryByText("Notify me about")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("shows the complete body of a broadcast on the notifications page", async () => {
    mocks.rpc.mockResolvedValue({
      data: [notification("announcement", "announcement-1", {
        title: "Campus update",
        body: "The library will open late tomorrow. Please use the east entrance.",
      }, "announcement")],
      error: null,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(MemoryRouter, null,
      createElement(QueryClientProvider, { client }, createElement(NotificationsPage)),
    ));

    const broadcast = await screen.findByRole("link", { name: /Announcement: Campus update/ });
    expect(broadcast).toHaveAttribute("href", "/app/notifications?announcement=announcement-1");
    expect(broadcast).toHaveTextContent("The library will open late tomorrow. Please use the east entrance.");
  });
});
