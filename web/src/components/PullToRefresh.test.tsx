import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PullToRefresh } from "../components/PullToRefresh";

function touch(y: number) {
  return { clientY: y };
}

describe("PullToRefresh", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("renders its children", () => {
    render(
      <PullToRefresh onRefresh={() => {}}>
        <p>home content</p>
      </PullToRefresh>,
    );
    expect(screen.getByText("home content")).toBeInTheDocument();
  });

  it("does not refresh on a short pull that never reaches the trigger", () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>content</p>
      </PullToRefresh>,
    );
    const content = container.querySelector(".ptr-content") as HTMLElement;

    fireEvent.touchStart(content, { touches: [touch(0)] });
    fireEvent.touchMove(content, { touches: [touch(30)] });
    fireEvent.touchEnd(content, { touches: [touch(30)] });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(container.querySelector(".ptr")).toHaveAttribute("data-state", "idle");
  });

  it("refreshes once the pull passes the trigger distance", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>content</p>
      </PullToRefresh>,
    );
    const content = container.querySelector(".ptr-content") as HTMLElement;

    fireEvent.touchStart(content, { touches: [touch(0)] });
    fireEvent.touchMove(content, { touches: [touch(200)] });
    expect(container.querySelector(".ptr")).toHaveAttribute("data-state", "armed");

    fireEvent.touchEnd(content, { touches: [touch(200)] });

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it("caps the pull distance so the indicator cannot leave the screen", () => {
    const { container } = render(
      <PullToRefresh onRefresh={() => {}}>
        <p>content</p>
      </PullToRefresh>,
    );
    const content = container.querySelector(".ptr-content") as HTMLElement;

    fireEvent.touchStart(content, { touches: [touch(0)] });
    fireEvent.touchMove(content, { touches: [touch(4000)] });

    const style = (content as HTMLElement).style.transform;
    const pulled = Number(/translate3d\(0,\s*([\d.]+)px/.exec(style)?.[1] ?? "0");
    expect(pulled).toBeGreaterThan(0);
    expect(pulled).toBeLessThanOrEqual(120);
  });

  it("returns to rest after a refresh completes", async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>content</p>
      </PullToRefresh>,
    );
    const content = container.querySelector(".ptr-content") as HTMLElement;

    fireEvent.touchStart(content, { touches: [touch(0)] });
    fireEvent.touchMove(content, { touches: [touch(200)] });
    fireEvent.touchEnd(content, { touches: [touch(200)] });

    await vi.waitFor(() => expect(container.querySelector(".ptr")).toHaveAttribute("data-state", "refreshing"));
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(container.querySelector(".ptr")).toHaveAttribute("data-state", "idle");
    vi.useRealTimers();
  });

  it("announces the refresh politely for screen readers", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh} labels={{ refreshing: "جاري التحديث…" }}>
        <p>content</p>
      </PullToRefresh>,
    );
    const content = container.querySelector(".ptr-content") as HTMLElement;

    fireEvent.touchStart(content, { touches: [touch(0)] });
    fireEvent.touchMove(content, { touches: [touch(200)] });
    fireEvent.touchEnd(content, { touches: [touch(200)] });

    const status = container.querySelector(".ptr-sr");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("ignores gestures while disabled", () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh} disabled>
        <p>content</p>
      </PullToRefresh>,
    );
    const content = container.querySelector(".ptr-content") as HTMLElement;

    fireEvent.touchStart(content, { touches: [touch(0)] });
    fireEvent.touchMove(content, { touches: [touch(200)] });
    fireEvent.touchEnd(content, { touches: [touch(200)] });

    expect(onRefresh).not.toHaveBeenCalled();
  });
});