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

  it("shows Discover immediately after Home in the mobile navigation", () => {
    renderStudentLayout();

    const mobileLinks = within(getMobileMainNavigation()).getAllByRole("link");

    expect(mobileLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/app",
      "/app/discover",
      "/app/communities",
      "/app/opportunities",
      "/app/messages",
    ]);
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
});
