import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CelebrationPoster } from "./CelebrationPoster";

const card = {
  title: "A new year to shine",
  category: "birthday" as const,
  celebrant_name: "Amina",
  celebration_at: "2026-12-01T12:00:00.000Z",
  timezone: "Africa/Lagos",
  message: "Wishing you a wonderful year.",
  template_id: "birthday-portrait",
  customization: {
    background: "#172c3c",
    accent: "#f4c769",
    text: "#fffaf2",
    align: "center" as const,
    font: "sans" as const,
    photoX: 50,
    photoY: 50,
    photoScale: 1,
  },
};

describe("CelebrationPoster", () => {
  it("shows a clean Whiteshirt board callout when a board link is provided", () => {
    render(<CelebrationPoster card={{ ...card, whiteshirt_url: "https://www.whiteshirt.fun/amina-board" }} />);

    expect(screen.getByLabelText("Whiteshirt celebration board")).toHaveTextContent("whiteshirt.fun/amina-board");
    expect(screen.getByLabelText("Whiteshirt celebration board")).toHaveTextContent("Continue celebrating");
  });

  it("does not show a Whiteshirt callout when no board link is provided", () => {
    render(<CelebrationPoster card={card} />);

    expect(screen.queryByLabelText("Whiteshirt celebration board")).not.toBeInTheDocument();
  });
});
