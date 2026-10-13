import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateField } from "./DateField";

/** A native date input has no implicit ARIA role, so it is queried by tag. */
function dateInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>("input[type='date']");
  if (!input) throw new Error("date input not rendered");
  return input;
}

describe("DateField", () => {
  it("renders an empty native date input", () => {
    const { container } = render(<DateField value="" onChange={() => {}} emptyHint="اختر تاريخ" />);

    expect(dateInput(container)).toBeInTheDocument();
    expect(screen.getByText("اختر تاريخ")).toBeInTheDocument();
  });

  it("shows the formatted echo of the chosen date", () => {
    render(
      <DateField
        value="2026-10-11"
        onChange={() => {}}
        formatValue={() => "الثلاثاء، 11 أكتوبر 2026"}
        emptyHint="اختر تاريخ"
      />,
    );

    expect(screen.getByText("الثلاثاء، 11 أكتوبر 2026")).toBeInTheDocument();
  });

  it("passes the raw ISO value to the parent on change", () => {
    const onChange = vi.fn();
    const { container } = render(<DateField value="" onChange={onChange} />);

    fireEvent.change(dateInput(container), { target: { value: "2026-12-01" } });

    expect(onChange).toHaveBeenCalledWith("2026-12-01");
  });

  it("announces the chosen date politely", () => {
    const { container } = render(<DateField value="2026-10-11" onChange={() => {}} formatValue={() => "11 أكتوبر"} />);

    expect(container.querySelector(".date-hint")).toHaveAttribute("aria-live", "polite");
  });

  it("keeps min and max constraints so invalid dates cannot be picked", () => {
    const { container } = render(<DateField value="" onChange={() => {}} min="2026-01-01" max="2026-12-31" />);

    const input = dateInput(container);
    expect(input).toHaveAttribute("min", "2026-01-01");
    expect(input).toHaveAttribute("max", "2026-12-31");
  });
});