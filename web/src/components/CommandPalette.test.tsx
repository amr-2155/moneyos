import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./Toast";
import { I18nProvider } from "../i18n";
import { AuthProvider } from "../lib/auth";
import { ThemeProvider } from "../lib/theme";
import { CommandPalette } from "./CommandPalette";

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <MemoryRouter initialEntries={["/"]}>
          <AuthProvider>
            <ToastProvider>
              <CommandPalette open={open} onClose={onClose} />
              <Routes>
                <Route path="/" element={<div>home page</div>} />
                <Route path="/budgets" element={<div>budgets page</div>} />
                <Route path="/add" element={<div>add page</div>} />
              </Routes>
            </ToastProvider>
          </AuthProvider>
        </MemoryRouter>
      </ThemeProvider>
    </I18nProvider>
  );
}

function open(extra?: { onClose?: () => void }) {
  const onClose = extra?.onClose ?? vi.fn();
  render(<Harness open onClose={onClose} />);
  return { onClose };
}

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    render(<Harness open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens as a dialog portalled to the body", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.closest(".cmdk-backdrop")?.parentElement).toBe(document.body);
  });

  it("focuses the search input on open", () => {
    open();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("lists navigation destinations grouped by kind", () => {
    open();
    expect(screen.getByRole("option", { name: /Home/ })).toBeInTheDocument();
    expect(screen.getByText("Go to")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("filters as the user types", () => {
    open();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "budg" } });

    expect(screen.getByRole("option", { name: /Budgets/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^Home$/ })).not.toBeInTheDocument();
  });

  it("navigates to the highlighted result on Enter", () => {
    open();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "budgets" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(screen.getByText("budgets page")).toBeInTheDocument();
  });

  it("moves the highlight with the arrow keys", () => {
    open();
    const input = screen.getByRole("combobox");
    // "add" matches the Add page and the two add actions, so there is room to move.
    fireEvent.change(input, { target: { value: "add" } });

    const before = screen.getAllByRole("option");
    expect(before.length).toBeGreaterThan(1);
    expect(before[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const after = screen.getAllByRole("option");
    expect(after[0]).toHaveAttribute("aria-selected", "false");
    expect(after[1]).toHaveAttribute("aria-selected", "true");
  });

  it("closes on Escape without navigating", () => {
    const { onClose } = open();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText("home page")).toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    open();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzzzzz" } });

    expect(screen.getByText("Nothing matches that search")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("closes when the backdrop is clicked but not the panel", () => {
    const { onClose } = open();
    const backdrop = document.querySelector(".cmdk-backdrop");
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(backdrop as Element);
    expect(onClose).toHaveBeenCalled();
  });
});