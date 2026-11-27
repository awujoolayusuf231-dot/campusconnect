import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { session: { user: { id: "student-1" } }, role: "student" },
  counts: { notifications: 7, messages: 0 },
  signOut: vi.fn(),
}));

vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: "student" }) }));
vi.mock("@/features/notifications/useRealtimeCounts", () => ({ useUnreadCounts: () => mocks.counts }));
vi.mock("@/features/notifications/NotificationAlerts", () => ({ NotificationAlerts: () => null }));
vi.mock("@/features/notifications/NotificationBell", () => ({
  NotificationBell: ({
    unreadCount,
    open,
    onOpenChange,
  }: {
    unreadCount: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <>
      <button type="button" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"} onClick={() => onOpenChange(!open)} />
      {open && <div role="region" aria-label="Recent notifications" />}
    </>
  ),
}));
vi.mock("@/features/voice/VoiceActiveIndicator", () => ({ VoiceActiveIndicator: () => null }));
vi.mock("@/features/announcements/AnnouncementBanner", () => ({
  AnnouncementBanner: () => <div data-testid="global-announcement-banner" />,
}));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { signOut: mocks.signOut } } }));

import { StudentLayout } from "./StudentLayout";

function renderStudentLayout(initialEntry = "/app") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<StudentLayout />}>
          <Route path="/app" element={<p>Home content</p>} />
          <Route path="/app/discover" element={<p>Discover content</p>} />
          <Route path="/app/study-notes" element={<p>Study notes content</p>} />
          <Route path="/app/flashcards" element={<p>Flashcards content</p>} />
          <Route path="/app/messages/:id" element={<p>Conversation content</p>} />
          <Route path="/app/notifications" element={<p>Notification content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function getMobileMainNavigation() {
  const mobileNavigation = screen.getAllByRole("navigation", { name: "Main" })[1];
  if (!mobileNavigation) throw new Error("Mobile main navigation was not rendered.");
  return mobileNavigation;
}

describe("StudentLayout navigation", () => {
  beforeEach(() => {
    mocks.counts = { notifications: 7, messages: 0 };
  });

  it("keeps the primary mobile navigation focused on the core destinations", () => {
    renderStudentLayout();

    expect(screen.queryByTestId("global-announcement-banner")).not.toBeInTheDocument();
    const mobileNavigation = getMobileMainNavigation();
    const mobileLinks = within(mobileNavigation).getAllByRole("link");

    expect(mobileLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/app",
      "/app/discover",
      "/app/communities",
      "/app/messages",
    ]);
  });

  it("opens Learn, Collaborate and Discover from the hamburger menu", () => {
    renderStudentLayout();
    const hamburger = screen.getByRole("button", { name: "Open navigation menu" });
    expect(hamburger).toHaveClass("lg:hidden");
    fireEvent.click(hamburger);

    expect(screen.getAllByRole("link", { name: "Learn" }).some((link) => link.getAttribute("href") === "/app/learn")).toBe(true);
    expect(screen.getAllByRole("link", { name: "Collaborate" }).some((link) => link.getAttribute("href") === "/app/collaborate")).toBe(true);
    expect(screen.getAllByRole("link", { name: "Discover opportunities" }).some((link) => link.getAttribute("href") === "/app/discover-hub")).toBe(true);
    expect(screen.getAllByRole("link", { name: "Find students" })).toHaveLength(3);
  });

  it("closes the hamburger menu when the open page area is clicked", () => {
    renderStudentLayout();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByRole("navigation", { name: "Mobile menu" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss navigation menu" }));

    expect(screen.queryByRole("navigation", { name: "Mobile menu" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Close navigation menu" }));
    expect(screen.queryByRole("navigation", { name: "Mobile menu" })).not.toBeInTheDocument();
  });

  it("puts a notification preview button and unread count in the header", () => {
    renderStudentLayout();

    expect(screen.getByRole("button", { name: "Notifications, 7 unread" })).toBeInTheDocument();
    expect(within(getMobileMainNavigation()).queryByRole("link", { name: /Notifications/ })).not.toBeInTheDocument();
  });

  it("does not navigate to the notifications page just by opening the header preview", () => {
    renderStudentLayout();

    fireEvent.click(screen.getByRole("button", { name: "Notifications, 7 unread" }));

    expect(screen.getByText("Home content")).toBeInTheDocument();
    expect(screen.queryByText("Notification content")).not.toBeInTheDocument();
  });

  it("closes either header dropdown when the other is opened", () => {
    renderStudentLayout();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByRole("navigation", { name: "Mobile menu" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 7 unread" }));
    expect(screen.queryByRole("navigation", { name: "Mobile menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Recent notifications" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.queryByRole("region", { name: "Recent notifications" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mobile menu" })).toBeInTheDocument();
  });

  it("does not apply the transform entrance animation to an active conversation", () => {
    renderStudentLayout("/app/messages/conversation-1");

    expect(screen.getByText("Conversation content")).toBeInTheDocument();
    expect(screen.getByText("Conversation content").parentElement).not.toHaveClass("motion-content");
  });
});
