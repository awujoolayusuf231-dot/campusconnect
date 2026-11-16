import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PostBody } from "./PostBody";

describe("PostBody hashtags", () => {
  it("links valid Latin hashtags and preserves the original post text", () => {
    const body = "Study group #CampusLife and #Ọlá\nmeet today.";
    const { container } = render(<MemoryRouter><PostBody body={body} /></MemoryRouter>);

    expect(container.textContent).toBe(body);
    expect(screen.getByRole("link", { name: "View posts tagged CampusLife" })).toHaveAttribute("href", "/app/tags/campuslife");
    expect(screen.getByRole("link", { name: "View posts tagged Ọlá" })).toHaveAttribute("href", `/app/tags/${encodeURIComponent("ọlá")}`);
    expect(screen.getByText(/and/)).toBeInTheDocument();
  });

  it("does not link hashtags embedded in another word or followed by an unsupported-script letter", () => {
    render(<MemoryRouter><PostBody body="word#joined #studyЖ #okay" /></MemoryRouter>);

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "View posts tagged okay" })).toBeInTheDocument();
  });

  it("links usernames to profiles without treating email addresses as mentions", () => {
    const body = "Nice work @Ada_Student, and reach me at ada@example.com.";
    const { container } = render(<MemoryRouter><PostBody body={body} /></MemoryRouter>);

    expect(container.textContent).toBe(body);
    expect(screen.getByRole("link", { name: "View @Ada_Student's profile" })).toHaveAttribute("href", "/app/u/Ada_Student");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
