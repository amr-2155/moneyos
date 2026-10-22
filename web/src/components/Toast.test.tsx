import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderPage } from "../test/utils";
import { useToast } from "./Toast";

function Probe({ message, withAction, duration }: { message: string; withAction?: () => void; duration?: number }) {
  const { show } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        show(
          "success",
          message,
          withAction || duration
            ? { action: withAction ? { label: "Undo", onAction: withAction } : undefined, duration }
            : undefined,
        )
      }
    >
      trigger
    </button>
  );
}

function clickTrigger() {
  fireEvent.click(screen.getByRole("button", { name: "trigger" }));
}

describe("Toast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the message", () => {
    renderPage(<Probe message="Category archived." />);
    clickTrigger();
    expect(screen.getByText("Category archived.")).toBeTruthy();
  });

  it("runs the action and dismisses itself", () => {
    const onAction = vi.fn();
    renderPage(<Probe message="Category deleted." withAction={onAction} />);
    clickTrigger();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Category deleted.")).toBeNull();
  });

  it("auto-dismisses a plain toast", () => {
    vi.useFakeTimers();
    renderPage(<Probe message="Saved." />);
    clickTrigger();
    expect(screen.getByText("Saved.")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  it("keeps an actionable toast alive long enough to be undone", () => {
    vi.useFakeTimers();
    renderPage(<Probe message="Category archived." withAction={() => {}} />);
    clickTrigger();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText("Category archived.")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText("Category archived.")).toBeNull();
  });

  it("honours an explicit duration", () => {
    vi.useFakeTimers();
    renderPage(<Probe message="Quick." duration={1000} />);
    clickTrigger();

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.queryByText("Quick.")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Quick.")).toBeNull();
  });
});