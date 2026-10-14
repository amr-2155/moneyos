import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/utils";
import { Modal } from "./ui";

describe("Modal", () => {
  /** The portal root (the backdrop) must hang directly off document.body. */
  function portalRoot(): HTMLElement {
    const backdrop = document.body.querySelector<HTMLElement>(".modal-backdrop");
    if (!backdrop) throw new Error("modal backdrop not found");
    return backdrop;
  }

  it("renders into a portal on document.body so no ancestor can contain it", () => {
    renderPage(
      // Simulates the real page wrapper: `.page-enter > *` animates a transform,
      // which would otherwise become the containing block for position: fixed.
      <div style={{ transform: "translateY(0) scale(1)" }}>
        <Modal title="Sheets" onClose={() => {}}>
          <p>content</p>
        </Modal>
      </div>,
    );

    expect(portalRoot().parentElement).toBe(document.body);
    expect(screen.getByRole("dialog").parentElement).toBe(portalRoot());
  });

  it("escapes an overflow-hidden ancestor", () => {
    renderPage(
      <div style={{ overflow: "hidden" }}>
        <Modal title="Sheets" onClose={() => {}}>
          <p>content</p>
        </Modal>
      </div>,
    );

    expect(portalRoot().parentElement).toBe(document.body);
  });

  it("labels the dialog with its title for screen readers", () => {
    renderPage(
      <Modal title="New budget" onClose={() => {}}>
        <p>content</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("New budget");
  });

  it("renders its children", () => {
    renderPage(
      <Modal title="New budget" onClose={() => {}}>
        <p>form body</p>
      </Modal>,
    );

    expect(screen.getByText("form body")).toBeInTheDocument();
  });
});