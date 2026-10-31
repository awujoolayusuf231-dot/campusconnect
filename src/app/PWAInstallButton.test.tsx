import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PWAInstallButton } from "./PWAInstallButton";

describe("PWAInstallButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prompts to install after the browser signals installability", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
    });

    render(<PWAInstallButton />);
    act(() => { window.dispatchEvent(event); });

    fireEvent.click(await screen.findByRole("button", { name: /install app/i }));

    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("button", { name: /install app/i })).not.toBeInTheDocument());
  });

  it("explains how to install on iOS devices", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
    render(<PWAInstallButton />);

    fireEvent.click(screen.getByRole("button", { name: /install app/i }));

    expect(await screen.findByRole("dialog", { name: /install campusconnect/i })).toHaveTextContent("Add to Home Screen");
  });
});
