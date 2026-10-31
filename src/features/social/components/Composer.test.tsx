import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPost } from "../api";
import { Composer } from "./Composer";

vi.mock("../api", () => ({
  createPost: vi.fn().mockResolvedValue({ failedImages: 0 }),
  validateImages: vi.fn(() => null),
}));

function renderComposer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><Composer /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Composer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the post editor from the floating compose button and focuses the input", () => {
    renderComposer();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "Create a post" });
    expect(trigger.className).toContain("fixed");
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "Create a post" })).toBeInTheDocument();
    expect(screen.getByLabelText("What's happening?")).toHaveFocus();
  });

  it("submits a post from the opened editor", async () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "Create a post" }));
    const dialog = screen.getByRole("dialog", { name: "Create a post" });
    fireEvent.change(within(dialog).getByLabelText("What's happening?"), { target: { value: "Hello campus!" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Post" }));

    await waitFor(() => expect(createPost).toHaveBeenCalledWith("Hello campus!", [], undefined));
    expect(await screen.findByRole("status")).toHaveTextContent("Posted!");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes with Escape and returns focus to the trigger", () => {
    renderComposer();
    const trigger = screen.getByRole("button", { name: "Create a post" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
