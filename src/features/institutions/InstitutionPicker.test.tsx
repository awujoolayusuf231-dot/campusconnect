import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstitutionPicker } from "./InstitutionPicker";
import type { InstitutionOption } from "./api";

const institutions: InstitutionOption[] = [
  { id: "uni-lagos", name: "University of Lagos", short_name: "UNILAG", type: "university" },
  { id: "uni-ibadan", name: "University of Ibadan", short_name: "UI", type: "university" },
  { id: "futa", name: "Federal University of Technology, Akure", short_name: "FUTA", type: "university" },
];

describe("InstitutionPicker", () => {
  it("filters institutions by full or short name and selects the matching ID", () => {
    const onChange = vi.fn();
    const { rerender } = render(<InstitutionPicker id="institution" selectedId="" institutions={institutions} onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: "" });
    fireEvent.change(input, { target: { value: "FUTA" } });

    expect(screen.getByRole("option", { name: /Federal University of Technology, Akure FUTA/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /University of Lagos/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Federal University of Technology, Akure/ }));

    expect(onChange).toHaveBeenCalledWith("futa");
    rerender(<InstitutionPicker id="institution" selectedId="futa" institutions={institutions} onChange={onChange} />);
    expect(input).toHaveValue("Federal University of Technology, Akure");
  });

  it("supports selecting an option with the keyboard", () => {
    const onChange = vi.fn();
    render(<InstitutionPicker id="institution" selectedId="" institutions={institutions} onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: "" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("uni-ibadan");
  });

  it("allows clearing the current institution", () => {
    const onChange = vi.fn();
    render(<InstitutionPicker id="institution" selectedId="uni-lagos" institutions={institutions} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear institution" }));

    expect(onChange).toHaveBeenCalledWith("");
  });
});
