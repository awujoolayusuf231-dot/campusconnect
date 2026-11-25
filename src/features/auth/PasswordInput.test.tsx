import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "./PasswordInput";

describe("PasswordInput", () => {
  it("reveals and hides the password without changing its value", () => {
    render(
      <>
        <label htmlFor="password">Password</label>
        <PasswordInput id="password" autoComplete="new-password" />
      </>,
    );

    const input = screen.getByLabelText("Password");
    fireEvent.change(input, { target: { value: "CampusConnect123" } });
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("CampusConnect123");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("CampusConnect123");
  });
});
