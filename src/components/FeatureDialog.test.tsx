import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeatureDialog } from "./FeatureDialog";

describe("FeatureDialog", () => {
  it("portals above the app shell and closes on Escape", () => {
    const onClose = vi.fn();
    render(<FeatureDialog title="Create project" onClose={onClose}><form>Form content</form></FeatureDialog>);

    const dialog = screen.getByRole("dialog", { name: "Create project" });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(dialog.parentElement).toHaveClass("z-[70]");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
