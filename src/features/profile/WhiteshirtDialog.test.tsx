import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { extractBoardUrl, WHITESHIRT_HOME, WhiteshirtDialog } from "./WhiteshirtDialog";

describe("extractBoardUrl", () => {
  it("accepts a plain board link", () => expect(extractBoardUrl("https://whiteshirt.fun/ada")).toBe("https://whiteshirt.fun/ada"));
  it("accepts www and finds it inside a sentence with trailing punctuation", () =>
    expect(extractBoardUrl("here is my board: https://www.whiteshirt.fun/ada-2026.")).toBe("https://www.whiteshirt.fun/ada-2026"));
  it("strips surrounding brackets and quotes", () => expect(extractBoardUrl('"<https://whiteshirt.fun/x>"')).toBe("https://whiteshirt.fun/x"));
  it.each(["https://whiteshirt.fun.evil.com/x", "https://whiteshirt.fun@evil.com/", "http://whiteshirt.fun/x", "javascript:alert(1)", "https://evil.com/whiteshirt.fun", "", "no link at all"])("rejects %s", (t) => expect(extractBoardUrl(t)).toBeNull());
  it("ignores a bad link and takes a later good one", () => expect(extractBoardUrl("https://evil.com/a https://whiteshirt.fun/ok")).toBe("https://whiteshirt.fun/ok"));
});

describe("WhiteshirtDialog", () => {
  it("embeds the fixed referral URL, sandboxed", () => {
    render(<WhiteshirtDialog onUse={() => undefined} onClose={() => undefined} />);
    const frame = screen.getByTitle("whiteshirt.fun");
    expect(WHITESHIRT_HOME).toBe("https://www.whiteshirt.fun/?ref=ecomedge");
    expect(frame).toHaveAttribute("src", "https://www.whiteshirt.fun/?ref=ecomedge");
    expect(frame.getAttribute("sandbox")).toContain("allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-top-navigation");
    const openInBrowser = screen.getByRole("link", { name: /open in browser/i });
    expect(openInBrowser).toHaveAttribute("href", WHITESHIRT_HOME);
    expect(openInBrowser).toHaveAttribute("target", "_blank");
    expect(openInBrowser).toHaveAttribute("rel", "noopener noreferrer");
  });
  it("keeps the button disabled for non-whiteshirt links and enables it for a valid one", () => {
    const onUse = vi.fn();
    render(<WhiteshirtDialog onUse={onUse} onClose={() => undefined} />);
    const input = screen.getByLabelText(/paste its link here/i); const use = screen.getByRole("button", { name: /use this link/i });
    expect(use).toBeDisabled();
    fireEvent.change(input, { target: { value: "https://evil.com/x" } });
    expect(use).toBeDisabled(); expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "my board https://whiteshirt.fun/ada" } });
    expect(use).toBeEnabled(); fireEvent.click(use);
    expect(onUse).toHaveBeenCalledWith("https://whiteshirt.fun/ada");
  });
  it("closes with Escape and the close button", () => {
    const onClose = vi.fn();
    render(<WhiteshirtDialog onUse={() => undefined} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" }); fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
