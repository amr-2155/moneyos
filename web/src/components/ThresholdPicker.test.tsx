import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThresholdPicker } from "./ThresholdPicker";

const labels = {
  early: "تنبيه مبكر",
  soon: "قرب الحد",
  late: "اللحظة الأخيرة",
  now: "التنبيه عند",
  custom: "عتبة التنبيه",
};

describe("ThresholdPicker", () => {
  it("renders the current value and its urgency label", () => {
    const { container } = render(<ThresholdPicker value={75} onChange={() => {}} labels={labels} />);

    expect(container.querySelector(".threshold-value")).toHaveTextContent("75%");
    expect(container.querySelector(".threshold-tone")).toHaveTextContent("قرب الحد");
  });

  it("changes the value when a preset is pressed", () => {
    const onChange = vi.fn();
    render(<ThresholdPicker value={75} onChange={onChange} labels={labels} presets={[50, 75, 90]} />);

    fireEvent.click(screen.getByRole("button", { name: "50%" }));

    expect(onChange).toHaveBeenCalledWith(50);
  });

  it("marks the active preset as pressed", () => {
    render(<ThresholdPicker value={90} onChange={() => {}} labels={labels} presets={[50, 75, 90]} />);

    expect(screen.getByRole("button", { name: "90%" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "50%" })).toHaveAttribute("aria-pressed", "false");
  });

  it("describes the urgency as the threshold rises", () => {
    const { container, rerender } = render(<ThresholdPicker value={50} onChange={() => {}} labels={labels} />);
    expect(container.querySelector(".threshold-tone")).toHaveTextContent("تنبيه مبكر");

    rerender(<ThresholdPicker value={90} onChange={() => {}} labels={labels} />);
    expect(container.querySelector(".threshold-tone")).toHaveTextContent("اللحظة الأخيرة");
  });

  it("emits slider values as numbers", () => {
    const onChange = vi.fn();
    render(<ThresholdPicker value={50} onChange={onChange} labels={labels} />);

    const slider = screen.getByRole("slider", { name: "عتبة التنبيه" });
    fireEvent.change(slider, { target: { value: "85" } });

    expect(onChange).toHaveBeenCalledWith(85);
  });

  it("does not fire while disabled", () => {
    const onChange = vi.fn();
    render(<ThresholdPicker value={75} onChange={onChange} labels={labels} disabled />);

    fireEvent.click(screen.getByRole("button", { name: "50%" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});