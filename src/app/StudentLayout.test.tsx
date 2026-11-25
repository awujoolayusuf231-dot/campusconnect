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
vi.mock("@/features/announcements/AnnouncementBanner", () => ({ AnnouncementBanner: () => null }));
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

  it("puts the notification link and unread count in the header", () => {
    renderStudentLayout();

    const notificationLink = screen.getByRole("link", { name: "Notifications, 7 unread" });
    expect(notificationLink).toHaveAttribute("href", "/app/notifications");
    expect(within(notificationLink).getByText("7")).toBeInTheDocument();
    expect(within(getMobileMainNavigation()).queryByRole("link", { name: /Notifications/ })).not.toBeInTheDocument();
  });

  it("opens the notifications page from the header link", () => {
    renderStudentLayout();

    fireEvent.click(screen.getByRole("link", { name: "Notifications, 7 unread" }));

    expect(screen.getByText("Notification content")).toBeInTheDocument();
  });

  it("does not apply the transform entrance animation to an active conversation", () => {
    renderStudentLayout("/app/messages/conversation-1");

    expect(screen.getByText("Conversation content")).toBeInTheDocument();
    expect(screen.getByText("Conversation content").parentElement).not.toHaveClass("motion-content");
  });
});
